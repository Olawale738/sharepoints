import { z } from "zod";

import {
  aiAssistantModes,
  canUseWorkspaceAi,
  collectAuthorizedAiSources,
  describeAiAccess,
  type AiSource
} from "@/lib/ai-assistant";
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

function extractOutput(body: {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
}) {
  return (
    body.output_text ??
    body.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text ?? "")
      .join("")
      .trim() ??
    ""
  );
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
    if (!process.env.OPENAI_API_KEY) {
      throw new ApiError(503, "The LETW AI Assistant is not configured yet.");
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

    const model = process.env.OPENAI_ASSISTANT_MODEL ?? "gpt-5-mini";
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
        model,
        status: "PROCESSING"
      }
    });
    let response: Response;

    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          instructions,
          input: `USER REQUEST:\n${question}\n\nAUTHORIZED LETW SOURCES:\n${sourceContext(authorizedSources)}`
        })
      });
    } catch (serviceError) {
      await prisma.aiAssistantAudit.update({
        where: { id: audit.id },
        data: {
          status: "FAILED",
          errorMessage: serviceError instanceof Error ? serviceError.message : "AI service connection failed."
        }
      });
      throw new ApiError(502, "The LETW AI Assistant could not connect to the AI service.");
    }
    const body = (await response.json().catch(() => null)) as
      | {
          output_text?: string;
          output?: Array<{ content?: Array<{ text?: string }> }>;
          error?: { message?: string };
        }
      | null;

    if (!response.ok || !body) {
      await prisma.aiAssistantAudit.update({
        where: { id: audit.id },
        data: {
          status: "FAILED",
          errorMessage: body?.error?.message ?? "AI service failed."
        }
      });
      throw new ApiError(502, body?.error?.message ?? "The LETW AI Assistant could not answer right now.");
    }

    const answer = extractOutput(body);
    if (!answer) {
      await prisma.aiAssistantAudit.update({
        where: { id: audit.id },
        data: { status: "FAILED", errorMessage: "The AI service returned an empty answer." }
      });
      throw new ApiError(502, "The LETW AI Assistant returned an empty answer.");
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
        data: { status: "COMPLETED" }
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
