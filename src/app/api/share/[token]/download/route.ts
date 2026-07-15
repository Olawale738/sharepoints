import { auth } from "@/auth";
import { hasActiveFileGrant } from "@/lib/access-requests";
import { ApiError, handleRouteError } from "@/lib/api";
import { ensureCanDownloadFile, ensureCanSeeFile, hasActiveFileDownloadGrant, isPresidentDocumentAuthority } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { getObjectBuffer, getProtectedDownloadResponse, getProtectedInlineResponse } from "@/lib/storage";
import {
  createWatermarkedPdf,
  getViewerWatermark,
  isPdfDocument,
  protectedWatermarkHeaders,
  watermarkedDownloadHeaders
} from "@/lib/watermark";

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

    const { token } = await context.params;
    const shareLink = await prisma.fileShareLink.findUnique({
      where: { token },
      include: {
        file: {
          select: {
            id: true,
            workspaceId: true,
            uploadedById: true,
            approvalStatus: true,
            sensitivityLabel: true,
            dlpRestricted: true,
            downloadRestricted: true,
            storageKey: true,
            fileName: true,
            fileType: true,
            deletedAt: true,
            scanStatus: true
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

    if (shareLink.file.deletedAt) {
      throw new ApiError(404, "File not found.");
    }

    try {
      await requireWorkspaceMembership(session.user.id, shareLink.file.workspaceId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403 && !(await hasActiveFileGrant(session.user.id, shareLink.file.id))) {
        return redirectToAccessRequest(request, shareLink.file.id);
      }

      if (!(error instanceof ApiError && error.status === 403)) {
        throw error;
      }
    }
    if (shareLink.file.scanStatus === "INFECTED") {
      throw new ApiError(423, "This document was blocked by security screening.");
    }

    if ((await isPresidentDocumentAuthority(session.user.id)) || (await hasActiveFileDownloadGrant(session.user.id, shareLink.file.id))) {
      await ensureCanDownloadFile(session.user.id, shareLink.file);
      const watermark = await getViewerWatermark(session.user.id);

      if (isPdfDocument(shareLink.file.fileName, shareLink.file.fileType)) {
        const buffer = await getObjectBuffer(shareLink.file.storageKey);
        const watermarked = await createWatermarkedPdf({ buffer, fileName: shareLink.file.fileName, watermark });
        return new Response(watermarked, {
          headers: watermarkedDownloadHeaders({
            fileName: shareLink.file.fileName,
            contentType: "application/pdf",
            bodyLength: watermarked.length,
            disposition: "attachment",
            watermark
          })
        });
      }

      const response = await getProtectedDownloadResponse(shareLink.file.storageKey, shareLink.file.fileName, shareLink.file.fileType);
      for (const [key, value] of Object.entries(protectedWatermarkHeaders(watermark))) {
        response.headers.set(key, value);
      }
      return response;
    }

    await ensureCanSeeFile(session.user.id, shareLink.file);
    const watermark = await getViewerWatermark(session.user.id);
    if (isPdfDocument(shareLink.file.fileName, shareLink.file.fileType)) {
      const buffer = await getObjectBuffer(shareLink.file.storageKey);
      const watermarked = await createWatermarkedPdf({ buffer, fileName: shareLink.file.fileName, watermark });
      return new Response(watermarked, {
        headers: watermarkedDownloadHeaders({
          fileName: shareLink.file.fileName,
          contentType: "application/pdf",
          bodyLength: watermarked.length,
          disposition: "inline",
          watermark
        })
      });
    }

    const response = await getProtectedInlineResponse(shareLink.file.storageKey, shareLink.file.fileName, shareLink.file.fileType);
    for (const [key, value] of Object.entries(protectedWatermarkHeaders(watermark))) {
      response.headers.set(key, value);
    }
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
