import { randomBytes, randomInt } from "crypto";
import type { MeetingResponseStatus } from "@prisma/client";

import { slugify } from "@/lib/utils";

export const meetingInclude = {
  createdBy: {
    select: {
      name: true,
      email: true
    }
  },
  workspace: {
    select: {
      id: true,
      name: true
    }
  },
  responses: {
    select: {
      userId: true,
      status: true
    }
  }
};

type SerializableMeeting = {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  passcode: string;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt?: Date;
  createdBy: { name?: string | null; email?: string | null };
  workspace?: { id: string; name: string };
  responses?: Array<{ userId: string; status: MeetingResponseStatus }>;
};

export function createMeetingPasscode() {
  return String(randomInt(100000, 1000000));
}

export function createMeetingRoomName(workspaceName: string) {
  const workspaceSlug = slugify(workspaceName) || "workspace";
  return `letw-${workspaceSlug}-${randomBytes(12).toString("hex")}`;
}

export function meetingInviteUrl(meetingId: string, origin?: string) {
  const baseUrl = (origin || process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${baseUrl}/dashboard/meetings/${meetingId}`;
}

export function serializeMeeting(meeting: SerializableMeeting, userId: string, origin?: string) {
  const responseCounts = {
    YES: 0,
    MAYBE: 0,
    NO: 0
  };

  for (const response of meeting.responses ?? []) {
    responseCounts[response.status] += 1;
  }

  return {
    id: meeting.id,
    workspaceId: meeting.workspaceId,
    title: meeting.title,
    description: meeting.description,
    startsAt: meeting.startsAt.toISOString(),
    endsAt: meeting.endsAt.toISOString(),
    passcode: meeting.passcode,
    cancelledAt: meeting.cancelledAt?.toISOString() ?? null,
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt?.toISOString(),
    createdBy: meeting.createdBy,
    workspace: meeting.workspace,
    responseCounts,
    currentUserResponse: meeting.responses?.find((response) => response.userId === userId)?.status ?? null,
    inviteUrl: meetingInviteUrl(meeting.id, origin)
  };
}
