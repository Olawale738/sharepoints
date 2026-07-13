import { z } from "zod";

import {
  aiAssistantModes,
  canUseWorkspaceAi,
  collectAuthorizedAiSources,
  describeAiAccess,
  type AiSource
} from "@/lib/ai-assistant";
import { generateAiText, isAiTextConfigured } from "@/lib/ai-provider";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { getOrganizationAncestorIds, getOrganizationUnitAccess } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  question: z.string().trim().min(2).max(4_000),
  mode: z.enum(aiAssistantModes).default("ASK"),
  workspaceId: z.string().cuid().nullable().optional(),
  agentId: z.string().cuid().nullable().optional(),
  threadId: z.string().cuid().nullable().optional()
});

function sourceContext(sources: AiSource[]) {
  return sources
    .map(
      (source, index) =>
        `[S${index + 1}] ${source.type.toUpperCase()}: ${source.title}\n` +
        `Workspace: ${source.workspaceName ?? "Organization-wide"}\n` +
        `Updated: ${source.updatedAt}\n` +
        `${source.excerpt}`
    )
    .join("\n\n");
}

function localAssistantFallback(input: {
  question: string;
  mode: string;
  sources: AiSource[];
}) {
  const selectedSources = input.sources.slice(0, 6);
  const sourceLines = selectedSources.map((source, index) => {
    const marker = `[S${index + 1}]`;
    return `${marker} ${source.title} (${source.type}) - ${source.excerpt.slice(0, 420)}${source.excerpt.length > 420 ? "..." : ""}`;
  });
  const sourceList = sourceLines.join("\n\n");

  if (input.mode === "DRAFT") {
    return [
      "Draft suggestion based only on authorized LETW sources:",
      "",
      "Peace be unto you,",
      "",
      `Following the approved information available to this account, please review the matters below:\n${sourceList}`,
      "",
      "This is an AI draft. Confirm the details in LETW before sending or acting."
    ].join("\n");
  }

  if (input.mode === "ACTION_ITEMS") {
    return [
      "Suggested action items from authorized LETW sources:",
      "",
      ...selectedSources.map((source, index) => `- Review ${source.title} [S${index + 1}] and assign a responsible person if follow-up is required.`),
      "",
      "These are suggestions only. No record has been changed."
    ].join("\n");
  }

  if (input.mode === "REPORT") {
    return [
      "Permission-aware LETW report:",
      "",
      `Request: ${input.question}`,
      "",
      "Authorized source summary:",
      sourceList,
      "",
      "Conclusion: use the source links below to confirm details before decisions are made."
    ].join("\n");
  }

  if (input.mode === "TRANSLATE") {
    return [
      "Translation requires a configured OpenAI or Claude key for high-quality output.",
      "",
      "For now, here is the authorized content selected for translation:",
      sourceList
    ].join("\n");
  }

  return [
    "Permission-aware answer from authorized LETW information:",
    "",
    sourceList,
    "",
    "I only used records your account is allowed to access. If the answer is incomplete, the information may not exist yet or may be outside your permission boundary."
  ].join("\n");
}

async function canUseOrganizationAgent(userId: string, organizationUnitId: string) {
  const leadershipAccess = await getOrganizationUnitAccess(userId);
  if (leadershipAccess.isAdmin || leadershipAccess.visibleUnitIds.has(organizationUnitId)) return true;
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId, workspace: { deletedAt: null } },
    select: { workspace: { select: { organizationUnitId: true } } }
  });
  const directUnitIds = memberships
    .map((membership) => membership.workspace.organizationUnitId)
    .filter((id): id is string => Boolean(id));
  const accessibleUnitIds = await getOrganizationAncestorIds(directUnitIds);
  return accessibleUnitIds.includes(organizationUnitId);
}

export async function GET() {
  try {
    const user = await requireUser();
    const [access, threads, agents] = await Promise.all([
      describeAiAccess(user.id),
      prisma.aiAssistantThread.findMany({
        where: { userId: user.id },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 30
          }
        },
        orderBy: { updatedAt: "desc" },
        take: 12
      }),
      prisma.workspaceAiAgent.findMany({
        where: { enabled: true },
        orderBy: { name: "asc" }
      })
    ]);

    const accessibleAgents = [];
    for (const agent of agents) {
      if (
        (agent.workspaceId && (await canUseWorkspaceAi(user.id, agent.workspaceId))) ||
        (agent.organizationUnitId && (await canUseOrganizationAgent(user.id, agent.organizationUnitId))) ||
        (!agent.workspaceId && !agent.organizationUnitId)
      ) {
        accessibleAgents.push(agent);
      }
    }

    return ok({ access, threads, agents: accessibleAgents });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid assistant request.");
    }
    const { question, mode } = parsed.data;
    const agent = parsed.data.agentId
      ? await prisma.workspaceAiAgent.findFirst({
          where: { id: parsed.data.agentId, enabled: true }
        })
      : null;
    if (parsed.data.agentId && !agent) {
      throw new ApiError(404, "AI agent not found.");
    }
    if (agent?.workspaceId && !(await canUseWorkspaceAi(user.id, agent.workspaceId))) {
      throw new ApiError(403, "You do not have permission to use this workspace AI agent.");
    }
    if (
      agent?.organizationUnitId &&
      !(await canUseOrganizationAgent(user.id, agent.organizationUnitId))
    ) {
      throw new ApiError(403, "You do not have permission to use this church network AI agent.");
    }
    const workspaceId = agent?.workspaceId ?? parsed.data.workspaceId;
    const existingThread = parsed.data.threadId
      ? await prisma.aiAssistantThread.findFirst({
          where: { id: parsed.data.threadId, userId: user.id }
        })
      : null;
    if (parsed.data.threadId && !existingThread) {
      throw new ApiError(404, "Assistant conversation not found.");
    }

    const thread =
      existingThread ??
      (await prisma.aiAssistantThread.create({
        data: {
          userId: user.id,
          title: question.slice(0, 72)
        }
      }));
    const retrieval = await collectAuthorizedAiSources({
      userId: user.id,
      question,
      mode,
      workspaceId
    });
    const allowedSourceTypes = Array.isArray(agent?.allowedSourceTypes)
      ? new Set(agent.allowedSourceTypes.filter((item): item is string => typeof item === "string"))
      : null;
    const authorizedSources = allowedSourceTypes
      ? retrieval.sources.filter((source) => allowedSourceTypes.has(source.type))
      : retrieval.sources;

    await prisma.aiAssistantMessage.create({
      data: {
        threadId: thread.id,
        role: "USER",
        mode,
        content: question
      }
    });

    if (!authorizedSources.length) {
      const answer =
        "I could not find authorized LETW information that answers this request. You may not have permission to access it, or no approved content is available.";
      await prisma.$transaction([
        prisma.aiAssistantMessage.create({
          data: { threadId: thread.id, role: "ASSISTANT", mode, content: answer, sources: [] }
        }),
        prisma.aiAssistantAudit.create({
          data: {
            userId: user.id,
            threadId: thread.id,
            mode,
            question,
            workspaceIds: retrieval.workspaceIds,
            sources: [],
            status: "NO_AUTHORIZED_SOURCES"
          }
        })
      ]);
      return ok({ threadId: thread.id, answer, sources: [] });
    }

    const openAiModel = process.env.OPENAI_ASSISTANT_MODEL ?? "gpt-5-mini";
    const anthropicModel = process.env.ANTHROPIC_ASSISTANT_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
    const instructions = [
      "You are the private LETW permission-aware organizational assistant.",
      "Use only the authorized source excerpts supplied below. Never infer hidden filenames, workspaces, people, or metadata.",
      "Do not claim access to anything outside those sources. If evidence is insufficient, say so.",
      "Cite factual statements with source markers such as [S1]. Keep citations attached to the relevant sentence.",
      "Clearly label drafts, recommendations, and assumptions as AI suggestions.",
      "You are read-only. Never claim to have sent a message, changed a record, approved content, or performed an action.",
      "When asked to perform an action, provide a draft or proposed steps and state that user confirmation is required in LETW.",
      `Requested mode: ${mode}.`,
      agent ? `Active specialized agent: ${agent.name}. Agent instructions: ${agent.instructions}` : "",
      "Answer clearly and concisely for a church collaboration platform."
    ].filter(Boolean).join(" ");
    const sourceAudit = authorizedSources.map((source) => ({
      id: source.id,
      type: source.type,
      workspaceId: source.workspaceId,
      title: source.title
    }));
    const audit = await prisma.aiAssistantAudit.create({
      data: {
        userId: user.id,
        threadId: thread.id,
        mode,
        question,
        workspaceIds: retrieval.workspaceIds,
        sources: sourceAudit,
        model: process.env.AI_PROVIDER ?? "auto",
        status: "PROCESSING"
      }
    });
    let answer = localAssistantFallback({ question, mode, sources: authorizedSources });
    let providerModel = "local-fallback";
    let auditStatus = isAiTextConfigured() ? "COMPLETED" : "LOCAL_FALLBACK";
    let errorMessage: string | undefined;

    if (isAiTextConfigured()) {
      try {
        const generated = await generateAiText({
          instructions,
          input: `USER REQUEST:\n${question}\n\nAUTHORIZED LETW SOURCES:\n${sourceContext(authorizedSources)}`,
          openAiModel,
          anthropicModel,
          maxTokens: 2200
        });
        if (generated.text) {
          answer = generated.text;
          providerModel = `${generated.provider}:${generated.model}`;
        }
      } catch (serviceError) {
        auditStatus = "FAILED_WITH_LOCAL_FALLBACK";
        providerModel = "local-fallback";
        errorMessage = serviceError instanceof Error ? serviceError.message : "AI service connection failed.";
      }
    }

    await prisma.$transaction([
      prisma.aiAssistantMessage.create({
        data: {
          threadId: thread.id,
          role: "ASSISTANT",
          mode,
          content: answer,
          sources: authorizedSources
        }
      }),
      prisma.aiAssistantAudit.update({
        where: { id: audit.id },
        data: { status: auditStatus, model: providerModel, errorMessage }
      }),
      prisma.aiAssistantThread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() }
      })
    ]);

    return ok({ threadId: thread.id, answer, sources: authorizedSources });
  } catch (error) {
    return handleRouteError(error);
  }
}
