import { auth } from "@/auth";
import { ApiError, handleRouteError } from "@/lib/api";
import { ensureCanSeeFile } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { getDownloadResponse } from "@/lib/storage";

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

    if (!file) {
      throw new ApiError(404, "File not found.");
    }

    await requireWorkspaceMembership(session.user.id, file.workspaceId);
    await ensureCanSeeFile(session.user.id, file);

    return getDownloadResponse(file.storageKey, file.fileName, file.fileType);
  } catch (error) {
    return handleRouteError(error);
  }
}
