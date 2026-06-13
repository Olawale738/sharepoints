import { z } from "zod";

import {
  aiAssistantModes,
  collectAuthorizedAiSources,
  describeAiAccess,
  type AiSource
} from "@/lib/ai-assistant";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  question: z.string().trim().min(2).max(4_000),
  mode: z.enum(aiAssistantModes).default("ASK"),
  workspaceId: z.string().cuid().nullable().optional(),
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

export async function GET() {
  try {
    const user = await requireUser();
    const [access, threads] = await Promise.all([
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
      })
    ]);

    return ok({ access, threads });
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

    const { question, mode, workspaceId } = parsed.data;
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

    await prisma.aiAssistantMessage.create({
      data: {
        threadId: thread.id,
        role: "USER",
        mode,
        content: question
      }
    });

    if (!retrieval.sources.length) {
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
      "Answer clearly and concisely for a church collaboration platform."
    ].join(" ");
    const sourceAudit = retrieval.sources.map((source) => ({
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
          input: `USER REQUEST:\n${question}\n\nAUTHORIZED LETW SOURCES:\n${sourceContext(retrieval.sources)}`
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
          sources: retrieval.sources
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

    return ok({ threadId: thread.id, answer, sources: retrieval.sources });
  } catch (error) {
    return handleRouteError(error);
  }
}
