import { WorkspaceAudienceMode } from "@prisma/client";
import { z } from "zod";

import { handleRouteError, ok, requireUser } from "@/lib/api";
import {
  getLeadershipSuiteData,
  runDocumentIntelligence,
  runFollowUpAutomation,
  sendMilestoneReminders,
  updateWorkspaceAudienceMode
} from "@/lib/leadership-suite";

const workspaceModeSchema = z.object({
  action: z.literal("WORKSPACE_MODE"),
  workspaceId: z.string().cuid(),
  audienceMode: z.nativeEnum(WorkspaceAudienceMode),
  memberDirectoryOpen: z.boolean()
});

const actionSchema = z.object({
  action: z.enum(["SEND_MILESTONE_REMINDERS", "RUN_FOLLOW_UP_AUTOMATION", "RUN_DOCUMENT_INTELLIGENCE"])
});

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await getLeadershipSuiteData(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const parsed = workspaceModeSchema.parse(await request.json());
    const workspace = await updateWorkspaceAudienceMode(
      user.id,
      parsed.workspaceId,
      parsed.audienceMode,
      parsed.memberDirectoryOpen
    );
    return ok({ workspace });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = actionSchema.parse(await request.json());
    if (parsed.action === "SEND_MILESTONE_REMINDERS") {
      return ok(await sendMilestoneReminders(user.id));
    }
    if (parsed.action === "RUN_FOLLOW_UP_AUTOMATION") {
      return ok(await runFollowUpAutomation(user.id));
    }
    return ok(await runDocumentIntelligence(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}
