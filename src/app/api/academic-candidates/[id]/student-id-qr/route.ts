import QRCode from "qrcode";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { getOfficialIssuanceAuthority } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function lower(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

function studentIdStatus(candidate: { studentIdNumber?: string | null; studentIdStatus?: string | null; studentIdExpiresAt?: Date | null }) {
  if (!candidate.studentIdNumber) return "PENDING";
  if (candidate.studentIdStatus && candidate.studentIdStatus !== "ACTIVE") return candidate.studentIdStatus;
  if (candidate.studentIdExpiresAt && candidate.studentIdExpiresAt <= new Date()) return "EXPIRED";
  return "ACTIVE";
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const candidate = await prisma.academicCandidate.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        email: true,
        studentIdNumber: true,
        studentIdStatus: true,
        studentIdExpiresAt: true
      }
    });

    if (!candidate) {
      throw new ApiError(404, "Student record not found.");
    }

    const authority = await getOfficialIssuanceAuthority(user.id);
    const isOwner = candidate.userId === user.id || Boolean(candidate.email && lower(candidate.email) === lower(user.email));
    if (!isOwner && !authority.canManageSchoolAcademics && !authority.canIssueAcademicCertificates) {
      throw new ApiError(403, "You cannot view this Student ID QR code.");
    }

    if (!candidate.studentIdNumber) {
      throw new ApiError(404, "Student ID has not been issued yet.");
    }

    const origin = new URL(request.url).origin;
    const svg = await QRCode.toString(`${origin}/verify/student-id/${candidate.id}`, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 2,
      color: {
        dark: "#0b1b3d",
        light: "#ffffff"
      }
    });

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "private, no-store",
        "X-LETW-Student-ID-Status": studentIdStatus(candidate)
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
