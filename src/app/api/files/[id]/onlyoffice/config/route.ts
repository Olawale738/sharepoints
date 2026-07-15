import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  isOnlyOfficeConfigured,
  onlyOfficeCallbackSignature,
  onlyOfficeDocumentType,
  onlyOfficeServerUrl,
  signOnlyOfficeConfig
} from "@/lib/onlyoffice";
import { ensureCanEditFile, isPresidentDocumentAuthority } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { getInlineUrl } from "@/lib/storage";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    if (!isOnlyOfficeConfigured()) {
      throw new ApiError(503, "OnlyOffice is not configured.");
    }

    const { id } = await context.params;
    const file = await prisma.file.findFirst({
      where: { id, deletedAt: null },
      include: { uploadedBy: { select: { name: true, email: true } } }
    });
    if (!file) throw new ApiError(404, "File not found.");

    await requireWorkspaceMembership(user.id, file.workspaceId);
    await ensureCanEditFile(user.id, file);
    const documentType = onlyOfficeDocumentType(file.fileName);
    if (!documentType) throw new ApiError(415, "This file type cannot be edited in OnlyOffice.");

    const origin = new URL(request.url).origin;
    const callbackSignature = onlyOfficeCallbackSignature(file.id);
    const canExportFromEditor = (await isPresidentDocumentAuthority(user.id)) && !file.dlpRestricted && !file.downloadRestricted;
    const config = {
      document: {
        fileType: file.fileName.split(".").pop()?.toLowerCase(),
        key: `${file.id}-${file.currentVersionNumber}-${file.updatedAt.getTime()}`,
        title: file.fileName,
        url: await getInlineUrl(file.storageKey, file.fileName, file.fileType),
        permissions: {
          edit: true,
          download: canExportFromEditor,
          print: canExportFromEditor
        }
      },
      documentType,
      editorConfig: {
        mode: "edit",
        callbackUrl: `${origin}/api/onlyoffice/callback/${file.id}?signature=${callbackSignature}`,
        user: {
          id: user.id,
          name: user.name ?? user.email ?? "LETW member"
        },
        customization: {
          autosave: true,
          forcesave: true,
          compactHeader: false,
          compactToolbar: false,
          hideRightMenu: false
        }
      }
    };

    return ok({
      serverUrl: onlyOfficeServerUrl(),
      config: {
        ...config,
        token: await signOnlyOfficeConfig(config)
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
