import { auth } from "@/auth";
import { ApiError, handleRouteError } from "@/lib/api";
import { ensureCanSeeFile } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { getInlineResponse, getObjectBuffer } from "@/lib/storage";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

function isWordDocument(fileName: string, contentType: string) {
  return (
    contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.toLowerCase().endsWith(".docx")
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlPreview(fileName: string, body: string) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(fileName)}</title>
  <style>
    body { margin: 0; background: #F8F6F0; color: #18201F; font-family: Arial, sans-serif; }
    main { max-width: 900px; margin: 32px auto; background: white; border: 1px solid rgba(24,32,31,.1); border-radius: 8px; padding: 32px; }
    h1 { font-size: 20px; margin: 0 0 24px; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid rgba(24,32,31,.15); padding: 6px; }
    p { line-height: 1.65; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(fileName)}</h1>
    ${body}
  </main>
</body>
</html>`;
}

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
      await ensureCanSeeFile(session.user.id, file);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        return redirectToAccessRequest(request, file.id);
      }

      throw error;
    }

    if (file.scanStatus === "INFECTED") {
      throw new ApiError(423, "This document was blocked by security screening.");
    }

    if (isWordDocument(file.fileName, file.fileType)) {
      const mammoth = await import("mammoth");
      const buffer = await getObjectBuffer(file.storageKey);
      const result = await mammoth.convertToHtml({ buffer });

      return new Response(htmlPreview(file.fileName, result.value), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline';"
        }
      });
    }

    return getInlineResponse(file.storageKey, file.fileName, file.fileType);
  } catch (error) {
    return handleRouteError(error);
  }
}
