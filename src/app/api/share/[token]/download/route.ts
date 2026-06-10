import { auth } from "@/auth";
import { ApiError, handleRouteError } from "@/lib/api";
import { ensureCanSeeFile } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { getDownloadResponse } from "@/lib/storage";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export const runtime = "nodejs";

function redirectToLogin(request: Request) {
  const url = new URL(request.url);
  const callbackUrl = `${url.pathname}${url.search}`;
  const loginUrl = new URL("/login", url.origin);
  loginUrl.searchParams.set("callbackUrl", callbackUrl);

  return Response.redirect(loginUrl, 302);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return redirectToLogin(request);
    }

    const { token } = await context.params;
    const shareLink = await prisma.fileShareLink.findUnique({
      where: { token },
      include: {
        file: {
          select: {
            workspaceId: true,
            uploadedById: true,
            approvalStatus: true,
            storageKey: true,
            fileName: true,
            fileType: true
          }
        }
      }
    });

    if (!shareLink) {
      throw new ApiError(404, "Share link not found.");
    }

    if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
      throw new ApiError(410, "Share link has expired.");
    }

    await requireWorkspaceMembership(session.user.id, shareLink.file.workspaceId);
    await ensureCanSeeFile(session.user.id, shareLink.file);

    return getDownloadResponse(shareLink.file.storageKey, shareLink.file.fileName, shareLink.file.fileType);
  } catch (error) {
    return handleRouteError(error);
  }
}
