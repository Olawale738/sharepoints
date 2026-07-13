import { auth } from "@/auth";
import { hasActiveFileGrant } from "@/lib/access-requests";
import { ApiError, handleRouteError } from "@/lib/api";
import { ensureCanDownloadFile } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { getProtectedDownloadResponse } from "@/lib/storage";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

function redirectToLogin(request: Request) {
  const url = new URL(request.url);
  const callbackUrl = `${url.pathname}${url.search}`;
  const loginUrl = new URL("/login", url.origin);
  loginUrl.searchParams.set("callbackUrl", callbackUrl);

  return Response.redirect(loginUrl, 302);
}

function redirectToAccessRequest(request: Request, fileId: string) {
  const url = new URL(request.url);
  const requestUrl = new URL("/dashboard/request-access", url.origin);
  requestUrl.searchParams.set("targetType", "FILE");
  requestUrl.searchParams.set("targetId", fileId);

  return Response.redirect(requestUrl, 302);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return redirectToLogin(request);
    }

    const { id } = await context.params;
    const file = await prisma.file.findUnique({
      where: { id }
    });

    if (!file || file.deletedAt) {
      throw new ApiError(404, "File not found.");
    }

    try {
      await requireWorkspaceMembership(session.user.id, file.workspaceId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403 && !(await hasActiveFileGrant(session.user.id, file.id))) {
        return redirectToAccessRequest(request, file.id);
      }

      if (!(error instanceof ApiError && error.status === 403)) {
        throw error;
      }
    }
    await ensureCanDownloadFile(session.user.id, file);

    if (file.scanStatus === "INFECTED") {
      throw new ApiError(423, "This document was blocked by security screening.");
    }

    return getProtectedDownloadResponse(file.storageKey, file.fileName, file.fileType);
  } catch (error) {
    return handleRouteError(error);
  }
}
