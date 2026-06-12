import { ApiError, handleRouteError } from "@/lib/api";
import { inspectForDlp, recordDlpIncidents } from "@/lib/dlp";
import { scanUploadedFile } from "@/lib/file-security";
import { verifyOnlyOfficeCallbackSignature } from "@/lib/onlyoffice";
import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/storage";

type RouteContext = { params: Promise<{ fileId: string }> };

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext) {
  try {
    const { fileId } = await context.params;
    const signature = new URL(request.url).searchParams.get("signature") ?? "";
    if (!verifyOnlyOfficeCallbackSignature(fileId, signature)) {
      throw new ApiError(401, "Invalid OnlyOffice callback signature.");
    }

    const body = (await request.json()) as { status?: number; url?: string };
    if (![2, 6].includes(body.status ?? 0) || !body.url) {
      return Response.json({ error: 0 });
    }

    const file = await prisma.file.findFirst({ where: { id: fileId, deletedAt: null } });
    if (!file) throw new ApiError(404, "File not found.");

    const response = await fetch(body.url);
    if (!response.ok) throw new Error("OnlyOffice document download failed.");
    const content = Buffer.from(await response.arrayBuffer());
    const scan = scanUploadedFile(file.fileName, content);
    if (scan.status === "INFECTED") throw new ApiError(422, scan.details);

    const dlp = await inspectForDlp(file.workspaceId, content);
    if (dlp.action === "BLOCK") {
      await recordDlpIncidents({ workspaceId: file.workspaceId, fileId, userId: file.uploadedById, result: dlp });
      throw new ApiError(422, "Edited document was blocked by data-loss prevention.");
    }

    const versionNumber = file.currentVersionNumber + 1;
    const storageKey = `workspaces/${file.workspaceId}/versions/${file.id}/v${versionNumber}-${file.fileName}`;
    const fileUrl = await uploadObject({
      key: storageKey,
      body: content,
      contentType: file.fileType,
      contentLength: content.length
    });

    await prisma.$transaction([
      prisma.fileVersion.create({
        data: {
          fileId,
          versionNumber,
          storageKey,
          fileUrl,
          fileName: file.fileName,
          fileType: file.fileType,
          size: content.length,
          changeNote: "Saved from OnlyOffice",
          uploadedById: file.uploadedById
        }
      }),
      prisma.file.update({
        where: { id: fileId },
        data: {
          storageKey,
          fileUrl,
          size: content.length,
          currentVersionNumber: versionNumber,
          scanStatus: scan.status,
          scanDetails: scan.details,
          dlpRestricted: dlp.action === "RESTRICT",
          dlpClassification: dlp.classification
        }
      })
    ]);
    await recordDlpIncidents({ workspaceId: file.workspaceId, fileId, userId: file.uploadedById, result: dlp });
    return Response.json({ error: 0 });
  } catch (error) {
    const response = handleRouteError(error);
    const payload = await response.json().catch(() => ({ error: "OnlyOffice save failed." }));
    return Response.json({ error: 1, details: payload }, { status: response.status });
  }
}
