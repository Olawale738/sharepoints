import { DlpAction } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DlpMatch = {
  ruleId?: string;
  name: string;
  action: DlpAction;
  sample: string;
};

const builtInRules = [
  {
    name: "Payment card number",
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    action: DlpAction.RESTRICT
  },
  {
    name: "US social security number",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    action: DlpAction.BLOCK
  },
  {
    name: "Private key material",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    action: DlpAction.BLOCK
  },
  {
    name: "Likely API secret",
    pattern: /\b(?:api[_-]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}/gi,
    action: DlpAction.RESTRICT
  }
] as const;

const actionRank: Record<DlpAction, number> = {
  WARN: 1,
  RESTRICT: 2,
  BLOCK: 3
};

function safeSample(value: string) {
  if (value.length <= 8) return "[redacted]";
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

export async function inspectForDlp(workspaceId: string, body: Buffer) {
  const text = body.subarray(0, 2_000_000).toString("utf8");
  const customRules = await prisma.dlpRule.findMany({
    where: {
      enabled: true,
      OR: [{ workspaceId }, { workspaceId: null }]
    }
  });
  const matches: DlpMatch[] = [];

  for (const rule of builtInRules) {
    const found = text.match(rule.pattern)?.[0];
    if (found) {
      matches.push({ name: rule.name, action: rule.action, sample: safeSample(found) });
    }
  }

  for (const rule of customRules) {
    try {
      const found = text.match(new RegExp(rule.pattern, "i"))?.[0];
      if (found) {
        matches.push({
          ruleId: rule.id,
          name: rule.name,
          action: rule.action,
          sample: safeSample(found)
        });
      }
    } catch {
      // Invalid custom expressions are ignored until an admin corrects them.
    }
  }

  const action = matches.reduce<DlpAction | null>((highest, match) => {
    if (!highest || actionRank[match.action] > actionRank[highest]) return match.action;
    return highest;
  }, null);

  return {
    action,
    matches,
    classification: matches.map((match) => match.name).join(", ") || null
  };
}

export async function recordDlpIncidents(input: {
  workspaceId: string;
  fileId?: string;
  userId: string;
  result: Awaited<ReturnType<typeof inspectForDlp>>;
}) {
  if (!input.result.matches.length || !input.result.action) return;

  await prisma.dlpIncident.createMany({
    data: input.result.matches.map((match) => ({
      workspaceId: input.workspaceId,
      fileId: input.fileId ?? null,
      ruleId: match.ruleId ?? null,
      detectedById: input.userId,
      classification: match.name,
      action: match.action,
      details: { sample: match.sample }
    }))
  });
}
