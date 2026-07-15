import { auth } from "@/auth";
import { hasActiveFileGrant } from "@/lib/access-requests";
import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError } from "@/lib/api";
import { ensureCanSeeFile } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { getObjectBuffer, getProtectedInlineResponse } from "@/lib/storage";
import {
  createWatermarkedPdf,
  getViewerWatermark,
  isImageDocument,
  isPdfDocument,
  isTextDocument,
  protectedWatermarkHeaders,
  watermarkedDownloadHeaders,
  watermarkedHtmlShell,
  watermarkedImagePreview,
  watermarkedTextPreview
} from "@/lib/watermark";

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
    const watermark = await getViewerWatermark(session.user.id);

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

    if (isPdfDocument(file.fileName, file.fileType)) {
      const buffer = await getObjectBuffer(file.storageKey);
      const watermarked = await createWatermarkedPdf({ buffer, fileName: file.fileName, watermark });

      return new Response(watermarked, {
        headers: watermarkedDownloadHeaders({
          fileName: file.fileName,
          contentType: "application/pdf",
          bodyLength: watermarked.length,
          disposition: "inline",
          watermark
        })
      });
    }

    if (isImageDocument(file.fileType)) {
      const buffer = await getObjectBuffer(file.storageKey);
      return new Response(watermarkedImagePreview({ fileName: file.fileName, contentType: file.fileType, buffer, watermark }), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline';",
          ...protectedWatermarkHeaders(watermark)
        }
      });
    }

    if (isTextDocument(file.fileName, file.fileType)) {
      const buffer = await getObjectBuffer(file.storageKey);
      return new Response(watermarkedTextPreview({ fileName: file.fileName, text: buffer.toString("utf8"), watermark }), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline';",
          ...protectedWatermarkHeaders(watermark)
        }
      });
    }

    if (isWordDocument(file.fileName, file.fileType)) {
      const mammoth = await import("mammoth");
      const buffer = await getObjectBuffer(file.storageKey);
      const result = await mammoth.convertToHtml({ buffer });

      return new Response(watermarkedHtmlShell({ title: file.fileName, body: result.value, watermark }), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline';",
          "X-Content-Type-Options": "nosniff",
          ...protectedWatermarkHeaders(watermark)
        }
      });
    }

    const response = await getProtectedInlineResponse(file.storageKey, file.fileName, file.fileType);
    response.headers.set("X-LETW-Protected-Preview", "true");
    for (const [key, value] of Object.entries(protectedWatermarkHeaders(watermark))) {
      response.headers.set(key, value);
    }
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
