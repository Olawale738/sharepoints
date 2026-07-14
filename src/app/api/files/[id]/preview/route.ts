import { auth } from "@/auth";
import { hasActiveFileGrant } from "@/lib/access-requests";
import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError } from "@/lib/api";
import { ensureCanSeeFile } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { getObjectBuffer, getProtectedInlineResponse } from "@/lib/storage";

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

function htmlPreview(fileName: string, body: string, viewerMark: string) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(fileName)}</title>
  <style>
    body { margin: 0; background: #F8F6F0; color: #18201F; font-family: Arial, sans-serif; }
    .letw-watermark { position: fixed; inset: 0; pointer-events: none; z-index: 50; opacity: .105; display: grid; grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 32px; transform: rotate(-22deg); padding: 48px; color: #0B1B3D; font-size: 15px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .letw-watermark span { border: 1px solid rgba(11,27,61,.28); border-radius: 8px; padding: 16px; text-align: center; }
    .letw-protected-banner { position: sticky; top: 0; z-index: 80; border-bottom: 1px solid rgba(11,27,61,.14); background: #0B1B3D; color: white; padding: 10px 16px; font-size: 13px; font-weight: 700; text-align: center; }
    main { position: relative; z-index: 10; max-width: 900px; margin: 32px auto; background: white; border: 1px solid rgba(24,32,31,.1); border-radius: 8px; padding: 32px; box-shadow: 0 12px 36px rgba(11,27,61,.08); }
    h1 { font-size: 20px; margin: 0 0 24px; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid rgba(24,32,31,.15); padding: 6px; }
    p { line-height: 1.65; }
    @media print {
      main, .letw-watermark { display: none !important; }
      body::before { content: "LETW protected preview - printing is disabled. Request president-approved download access."; display: block; padding: 48px; color: #0B1B3D; font: 700 20px Arial, sans-serif; }
    }
  </style>
</head>
<body>
  <div class="letw-protected-banner">LETW protected preview - ${escapeHtml(viewerMark)} - printing disabled for generated previews</div>
  <div class="letw-watermark">
    ${Array.from({ length: 12 }, () => `<span>LETW CONFIDENTIAL<br />${escapeHtml(viewerMark)}</span>`).join("")}
  </div>
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
    } catch (error) {
      if (error instanceof ApiError && error.status === 403 && !(await hasActiveFileGrant(session.user.id, file.id))) {
        return redirectToAccessRequest(request, file.id);
      }

      if (!(error instanceof ApiError && error.status === 403)) {
        throw error;
      }
    }
    await ensureCanSeeFile(session.user.id, file);
    const viewerMark = `${session.user.email ?? session.user.name ?? session.user.id} - ${new Date().toISOString()}`;

    await logActivity({
      userId: session.user.id,
      workspaceId: file.workspaceId,
      action: activityActions.filePreviewed,
      targetId: file.id,
      metadata: {
        fileName: file.fileName,
        sensitivityLabel: file.sensitivityLabel,
        dlpRestricted: file.dlpRestricted,
        downloadRestricted: file.downloadRestricted,
        shareRestricted: file.shareRestricted
      }
    }).catch(() => null);

    if (file.scanStatus === "INFECTED") {
      throw new ApiError(423, "This document was blocked by security screening.");
    }

    if (isWordDocument(file.fileName, file.fileType)) {
      const mammoth = await import("mammoth");
      const buffer = await getObjectBuffer(file.storageKey);
      const result = await mammoth.convertToHtml({ buffer });

      return new Response(htmlPreview(file.fileName, result.value, viewerMark), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline';",
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
          "X-Content-Type-Options": "nosniff",
          "X-Robots-Tag": "noindex, nofollow, noarchive"
        }
      });
    }

    const response = await getProtectedInlineResponse(file.storageKey, file.fileName, file.fileType);
    response.headers.set("X-LETW-Protected-Preview", "true");
    response.headers.set("X-LETW-Viewer", viewerMark);
    response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
