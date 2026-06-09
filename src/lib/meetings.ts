import { randomBytes, randomInt } from "crypto";

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
  }
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
