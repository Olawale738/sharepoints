import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAdminAccess } from "@/lib/rbac";
import { deleteObject } from "@/lib/storage";
import { removeVoiceNote } from "@/lib/voice-notes";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceAdminAccess(user.id, id, "Only admins can delete workspaces.");

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        files: {
          select: {
            storageKey: true
          }
        },
        chatChannels: {
          select: {
            messages: {
              where: {
                voiceStorageKey: {
                  not: null
                }
              },
              select: {
                voiceStorageKey: true
              }
            }
          }
        },
        directConversations: {
          select: {
            messages: {
              where: {
                voiceStorageKey: {
                  not: null
                }
              },
              select: {
                voiceStorageKey: true
              }
            }
          }
        }
      }
    });

    if (!workspace) {
      throw new ApiError(404, "Workspace not found.");
    }

    for (const file of workspace.files) {
      await deleteObject(file.storageKey);
    }
    const voiceStorageKeys = [
      ...workspace.chatChannels.flatMap((channel) => channel.messages.map((message) => message.voiceStorageKey)),
      ...workspace.directConversations.flatMap((conversation) =>
        conversation.messages.map((message) => message.voiceStorageKey)
      )
    ];

    await Promise.all(voiceStorageKeys.map((storageKey) => removeVoiceNote(storageKey).catch(() => undefined)));

    await prisma.workspace.delete({
      where: { id }
    });

    await logActivity({
      userId: user.id,
      action: activityActions.workspaceDeleted,
      targetId: workspace.id,
      metadata: {
        name: workspace.name,
        filesDeleted: workspace.files.length,
        voiceNotesDeleted: voiceStorageKeys.length
      }
    });

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
