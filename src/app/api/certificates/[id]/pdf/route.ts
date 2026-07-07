import { readFile } from "fs/promises";
import path from "path";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { getObjectBuffer } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function formatDate(value?: Date | null) {
  if (!value) return "No expiry";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(value);
}

function displayName(user: { name?: string | null; email?: string | null }) {
  return user.name ?? user.email ?? "LETW Member";
}

function initials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "L"
  );
}

function wrapText(text: string, maxLength: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);
  return lines;
}

async function embedImage(pdf: PDFDocument, body: Buffer) {
  if (!body.length) return null;
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return pdf.embedPng(body);
  }
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return pdf.embedJpg(body);
  }
  return null;
}

async function loadProfilePhoto(userId: string, image?: string | null) {
  try {
    if (image?.startsWith("http")) {
      const response = await fetch(image);
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    }
    return await getObjectBuffer(`profiles/${userId}/avatar`);
  } catch {
    return null;
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const certificate = await prisma.memberCertificationBadge.findUnique({
      where: { id }
    });

    if (!certificate) {
      throw new ApiError(404, "Certificate not found.");
    }

    const isAdmin = await hasAnyWorkspaceAdminRole(actor.id);
    if (!isAdmin && certificate.userId !== actor.id) {
      throw new ApiError(403, "You cannot download this certificate.");
    }

    const certificateUser = await prisma.user.findUnique({
      where: { id: certificate.userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        memberProfile: {
          select: {
            membershipNumber: true,
            organizationPosition: true,
            phone: true
          }
        }
      }
    });

    if (!certificateUser) {
      throw new ApiError(404, "Certificate owner not found.");
    }

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([842, 595]);
    const width = page.getWidth();
    const height = page.getHeight();
    const navy = rgb(0.043, 0.106, 0.239);
    const blue = rgb(0.039, 0.239, 0.514);
    const gold = rgb(0.831, 0.686, 0.216);
    const ink = rgb(0.071, 0.102, 0.157);
    const muted = rgb(0.38, 0.42, 0.48);
    const white = rgb(1, 1, 1);
    const lightBlue = rgb(0.94, 0.973, 1);
    const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const sans = await pdf.embedFont(StandardFonts.Helvetica);
    const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
    const logoBytes = await readFile(path.join(process.cwd(), "public", "letw-logo.png"));
    const logo = await pdf.embedPng(logoBytes);
    const photo = await embedImage(pdf, (await loadProfilePhoto(certificateUser.id, certificateUser.image)) ?? Buffer.alloc(0));
    const origin = new URL(request.url).origin;
    const verifyUrl = `${origin}/verify/certificate/${certificate.verifyToken}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 420,
      margin: 1,
      errorCorrectionLevel: "H",
      color: { dark: "#0b1b3d", light: "#ffffff" }
    });
    const qr = await pdf.embedPng(Buffer.from(qrDataUrl.split(",")[1] ?? "", "base64"));
    const holderName = displayName(certificateUser);
    const certificateNumber = certificate.certificateNumber ?? `LETW-CERT-${certificate.id.slice(-8).toUpperCase()}`;
    const position = certificateUser.memberProfile?.organizationPosition ?? "LETW Member";
    const memberNumber = certificateUser.memberProfile?.membershipNumber ?? "Member number pending";
    const valid = certificate.status === "ACTIVE" && !certificate.revokedAt && (!certificate.expiresAt || certificate.expiresAt > new Date());

    page.drawRectangle({ x: 0, y: 0, width, height, color: white });
    page.drawRectangle({ x: 22, y: 22, width: width - 44, height: height - 44, borderColor: navy, borderWidth: 7 });
    page.drawRectangle({ x: 37, y: 37, width: width - 74, height: height - 74, borderColor: gold, borderWidth: 1.4 });
    page.drawRectangle({ x: 48, y: height - 116, width: width - 96, height: 70, color: navy });
    page.drawRectangle({ x: 48, y: height - 121, width: width - 96, height: 5, color: gold });
    page.drawImage(logo, { x: 64, y: height - 105, width: 52, height: 52 });
    page.drawText("LIGHT ENCOUNTER TABERNACLE WORLDWIDE", { x: 130, y: height - 82, size: 14, font: sansBold, color: white });
    page.drawText("Official certificate | letw.org", { x: 130, y: height - 101, size: 9, font: sansBold, color: gold });
    page.drawRectangle({
      x: width - 205,
      y: height - 101,
      width: 128,
      height: 28,
      color: valid ? gold : rgb(0.65, 0.28, 0.2),
      opacity: 0.96
    });
    page.drawText(valid ? "VERIFIED ACTIVE" : "NOT ACTIVE", {
      x: width - 194,
      y: height - 87,
      size: 11,
      font: sansBold,
      color: valid ? navy : white
    });

    page.drawImage(logo, { x: width / 2 - 118, y: 183, width: 236, height: 236, opacity: 0.045 });
    page.drawText("CERTIFICATE OF LETW RECOGNITION", { x: 118, y: 430, size: 11, font: sansBold, color: gold });
    page.drawText(certificate.title, { x: 118, y: 384, size: 34, font: serif, color: navy });
    page.drawText("This certifies that", { x: 118, y: 345, size: 13, font: sansBold, color: muted });
    page.drawText(holderName, { x: 118, y: 303, size: Math.min(32, Math.max(22, 420 / Math.max(holderName.length, 12))), font: sansBold, color: blue });
    page.drawRectangle({ x: 118, y: 282, width: 210, height: 22, color: navy });
    page.drawText(position.toUpperCase().slice(0, 44), { x: 130, y: 288, size: 9, font: sansBold, color: white });

    const statement =
      "has been officially recorded and recognized by Light Encounter Tabernacle Worldwide. This certificate is valid only when the QR verification page confirms an active status.";
    wrapText(statement, 78).forEach((line, index) => {
      page.drawText(line, { x: 118, y: 252 - index * 16, size: 11, font: sans, color: ink });
    });

    const photoX = width - 232;
    const photoY = 286;
    page.drawRectangle({ x: photoX - 4, y: photoY - 4, width: 134, height: 134, color: gold });
    page.drawRectangle({ x: photoX, y: photoY, width: 126, height: 126, color: lightBlue });
    if (photo) {
      page.drawImage(photo, { x: photoX, y: photoY, width: 126, height: 126 });
    } else {
      page.drawText(initials(holderName), { x: photoX + 41, y: photoY + 52, size: 27, font: sansBold, color: navy });
    }
    page.drawImage(logo, { x: width - 207, y: 176, width: 82, height: 82, opacity: 0.86 });
    page.drawText("OFFICIAL SEAL", { x: width - 202, y: 160, size: 8, font: sansBold, color: navy });

    const detailY = 137;
    const details = [
      ["Certificate number", certificateNumber],
      ["Member number", memberNumber],
      ["Issued", formatDate(certificate.issuedAt)],
      ["Expires", formatDate(certificate.expiresAt)]
    ];
    details.forEach(([label, value], index) => {
      const x = 70 + index * 132;
      page.drawRectangle({ x, y: detailY, width: 118, height: 48, color: lightBlue, borderColor: rgb(0.8, 0.87, 0.96), borderWidth: 0.6 });
      page.drawText(label.toUpperCase(), { x: x + 8, y: detailY + 29, size: 7, font: sansBold, color: blue });
      page.drawText(value.slice(0, 24), { x: x + 8, y: detailY + 12, size: 8.5, font: sansBold, color: navy });
    });

    page.drawText("Olawale N Sanni", { x: 98, y: 80, size: 22, font: script, color: navy });
    page.drawLine({ start: { x: 86, y: 74 }, end: { x: 276, y: 74 }, thickness: 0.7, color: navy });
    page.drawText("President / Authorized Signature", { x: 105, y: 58, size: 8, font: sansBold, color: muted });
    page.drawImage(qr, { x: width - 172, y: 54, width: 86, height: 86 });
    page.drawText("SCAN TO VERIFY", { x: width - 164, y: 39, size: 8, font: sansBold, color: navy });
    page.drawText(certificateNumber, { x: width - 238, y: 30, size: 7, font: sansBold, color: blue });

    if (!valid) {
      page.drawRectangle({ x: 270, y: 256, width: 275, height: 62, color: rgb(1, 1, 1), opacity: 0.72 });
      page.drawText("NOT VALID", { x: 310, y: 276, size: 34, font: sansBold, color: rgb(0.65, 0.28, 0.2) });
    }

    const pdfBytes = await pdf.save();
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${certificateNumber.replace(/[^A-Za-z0-9._-]/g, "-")}.pdf"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
