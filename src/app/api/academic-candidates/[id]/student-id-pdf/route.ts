import { readFile } from "fs/promises";
import path from "path";
import QRCode from "qrcode";
import {
  clip,
  drawEllipsePath,
  endPath,
  PDFDocument,
  PDFImage,
  PDFFont,
  PDFPage,
  popGraphicsState,
  pushGraphicsState,
  StandardFonts,
  rgb
} from "pdf-lib";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { getOfficialIssuanceAuthority } from "@/lib/official-issuance";
import { embedImageForPdf } from "@/lib/pdf-images";
import { prisma } from "@/lib/prisma";
import { getObjectBuffer } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PdfColor = ReturnType<typeof rgb>;

function lower(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

function studentIdStatus(candidate: { studentIdNumber?: string | null; studentIdStatus?: string | null; studentIdExpiresAt?: Date | null }) {
  if (!candidate.studentIdNumber) return "PENDING";
  if (candidate.studentIdStatus && candidate.studentIdStatus !== "ACTIVE") return candidate.studentIdStatus;
  if (candidate.studentIdExpiresAt && candidate.studentIdExpiresAt <= new Date()) return "EXPIRED";
  return "ACTIVE";
}

function dateText(value?: Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(value);
}

function storageKeyFromAssetUrl(value?: string | null) {
  const prefix = "/api/certificates/assets/";
  if (!value?.startsWith(prefix)) return null;
  return decodeURIComponent(value.slice(prefix.length).split("?")[0] ?? "");
}

function fittedFontSize(font: PDFFont, text: string, maxWidth: number, preferred: number, minimum: number) {
  let size = preferred;
  while (size > minimum && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

function drawFittedText(input: {
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  font: PDFFont;
  preferredSize: number;
  minimumSize: number;
  color: PdfColor;
}) {
  const { page, text, x, y, maxWidth, font, preferredSize, minimumSize, color } = input;
  const size = fittedFontSize(font, text, maxWidth, preferredSize, minimumSize);
  let displayText = text;

  if (font.widthOfTextAtSize(displayText, size) > maxWidth) {
    while (displayText.length > 8 && font.widthOfTextAtSize(`${displayText.slice(0, -4)}...`, size) > maxWidth) {
      displayText = displayText.slice(0, -1);
    }
    displayText = `${displayText.slice(0, -3)}...`;
  }

  page.drawText(displayText, { x, y, size, font, color });
}

function wrapTextToWidth(font: PDFFont, text: string, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(input: {
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  font: PDFFont;
  size: number;
  lineHeight: number;
  color: PdfColor;
}) {
  const lines = wrapTextToWidth(input.font, input.text, input.size, input.maxWidth);
  lines.forEach((line, index) => {
    input.page.drawText(line, {
      x: input.x,
      y: input.y - index * input.lineHeight,
      size: input.size,
      font: input.font,
      color: input.color
    });
  });
  return Math.max(lines.length, 1) * input.lineHeight;
}

function drawCenteredText(page: PDFPage, text: string, centerX: number, y: number, font: PDFFont, size: number, color: PdfColor) {
  page.drawText(text, {
    x: centerX - font.widthOfTextAtSize(text, size) / 2,
    y,
    size,
    font,
    color
  });
}

function drawField(input: {
  page: PDFPage;
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
  labelFont: PDFFont;
  valueFont: PDFFont;
  labelColor: PdfColor;
  valueColor: PdfColor;
}) {
  const { page, label, value, x, y, width, labelFont, valueFont, labelColor, valueColor } = input;
  page.drawText(label.toUpperCase(), { x, y: y + 17, size: 5.8, font: labelFont, color: labelColor });
  drawFittedText({ page, text: value, x, y, maxWidth: width, font: valueFont, preferredSize: 8.6, minimumSize: 6, color: valueColor });
}

function drawCircularImageCover(page: PDFPage, image: PDFImage, centerX: number, centerY: number, radius: number, opacity = 1) {
  const width = radius * 2;
  const height = radius * 2;
  const x = centerX - radius;
  const y = centerY - radius;
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  page.pushOperators(
    pushGraphicsState(),
    ...drawEllipsePath({ x: centerX, y: centerY, xScale: radius, yScale: radius }),
    clip(),
    endPath()
  );
  page.drawImage(image, {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
    opacity
  });
  page.pushOperators(popGraphicsState());
}

async function getPhotoBytes(photoUrl?: string | null) {
  const key = storageKeyFromAssetUrl(photoUrl);
  if (key) return getObjectBuffer(key);

  if (!photoUrl || !/^https?:\/\//i.test(photoUrl)) return null;
  try {
    const response = await fetch(photoUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const body = Buffer.from(await response.arrayBuffer());
    return body.length ? body : null;
  } catch {
    return null;
  }
}

async function embedStudentPhoto(pdf: PDFDocument, photoUrl?: string | null) {
  const body = await getPhotoBytes(photoUrl);
  if (!body) return null;
  return embedImageForPdf(pdf, body);
}

function drawInactiveOverlay(page: PDFPage, input: { x: number; y: number; width: number; height: number; font: PDFFont; status: string }) {
  page.drawRectangle({ x: input.x, y: input.y + input.height / 2 - 22, width: input.width, height: 44, color: rgb(1, 1, 1), opacity: 0.78 });
  drawCenteredText(page, input.status, input.x + input.width / 2, input.y + input.height / 2 - 8, input.font, 26, rgb(0.65, 0.14, 0.12));
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
        fullName: true,
        email: true,
        phone: true,
        photoUrl: true,
        organization: true,
        programName: true,
        educationLevel: true,
        fieldOfStudy: true,
        studyMode: true,
        admissionDate: true,
        studentIdNumber: true,
        studentIdIssuedAt: true,
        studentIdExpiresAt: true,
        studentIdStatus: true
      }
    });

    if (!candidate) {
      throw new ApiError(404, "Student record not found.");
    }

    const authority = await getOfficialIssuanceAuthority(user.id);
    const isOwner = candidate.userId === user.id || Boolean(candidate.email && lower(candidate.email) === lower(user.email));
    if (!isOwner && !authority.canManageSchoolAcademics && !authority.canIssueAcademicCertificates) {
      throw new ApiError(403, "You cannot print this Student ID card.");
    }

    if (!candidate.studentIdNumber) {
      throw new ApiError(404, "Student ID has not been issued yet.");
    }

    const pdf = await PDFDocument.create();
    const navy = rgb(0.043, 0.106, 0.239);
    const deepNavy = rgb(0.027, 0.067, 0.16);
    const gold = rgb(0.831, 0.686, 0.216);
    const softGold = rgb(0.965, 0.862, 0.45);
    const blue = rgb(0.039, 0.239, 0.514);
    const ink = rgb(0.071, 0.102, 0.157);
    const muted = rgb(0.37, 0.43, 0.5);
    const light = rgb(0.952, 0.973, 1);
    const white = rgb(1, 1, 1);
    const sans = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);
    const logoBytes = await readFile(path.join(process.cwd(), "public", "letw-logo-transparent.png"));
    const logo = await pdf.embedPng(logoBytes);
    const photo = await embedStudentPhoto(pdf, candidate.photoUrl);
    const origin = new URL(request.url).origin;
    const verifyUrl = `${origin}/verify/student-id/${candidate.id}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 360,
      margin: 1,
      color: { dark: "#0B1B3D", light: "#FFFFFF" },
      errorCorrectionLevel: "H"
    });
    const qr = await pdf.embedPng(Buffer.from(qrDataUrl.split(",")[1] ?? "", "base64"));
    const status = studentIdStatus(candidate);
    const schoolName = candidate.organization?.trim() || "LETW School of Theology";

    const page = pdf.addPage([842, 595]);
    const cardW = 344;
    const cardH = 216;
    const frontX = 58;
    const backX = 440;
    const cardY = 196;

    page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(0.98, 0.975, 0.955) });
    page.drawText("LETW Student ID Printable PDF", { x: 58, y: 535, size: 22, font: bold, color: navy });
    page.drawText("Print this sheet at high quality. Cut along the card edges, then laminate if a physical card is needed.", { x: 58, y: 512, size: 9, font: sans, color: muted });
    page.drawText(`Generated for ${candidate.fullName} - ${candidate.studentIdNumber}`, { x: 58, y: 496, size: 8, font: sans, color: muted });

    page.drawText("FRONT", { x: frontX, y: cardY + cardH + 14, size: 8, font: bold, color: muted });
    page.drawText("BACK", { x: backX, y: cardY + cardH + 14, size: 8, font: bold, color: muted });

    // Front card
    page.drawRectangle({ x: frontX, y: cardY, width: cardW, height: cardH, color: deepNavy, borderColor: gold, borderWidth: 1.1 });
    page.drawRectangle({ x: frontX, y: cardY + cardH - 52, width: cardW, height: 52, color: navy });
    page.drawRectangle({ x: frontX, y: cardY + cardH - 56, width: cardW, height: 4, color: gold });
    page.drawCircle({ x: frontX + cardW - 40, y: cardY + cardH - 62, size: 45, color: rgb(0.07, 0.16, 0.31), opacity: 0.22 });
    page.drawCircle({ x: frontX + 46, y: cardY + 52, size: 46, color: rgb(0.08, 0.19, 0.36), opacity: 0.18 });
    page.drawImage(logo, { x: frontX + 17, y: cardY + cardH - 43, width: 35, height: 35 });
    page.drawText("LIGHT ENCOUNTER TABERNACLE WORLDWIDE", { x: frontX + 62, y: cardY + cardH - 25, size: 8.2, font: bold, color: white });
    page.drawText("Official Student Identity", { x: frontX + 62, y: cardY + cardH - 40, size: 7.4, font: bold, color: softGold });

    const photoCenterX = frontX + 67;
    const photoCenterY = cardY + 107;
    const photoRadius = 40;
    page.drawCircle({ x: photoCenterX, y: photoCenterY, size: photoRadius + 6, color: gold });
    page.drawCircle({ x: photoCenterX, y: photoCenterY, size: photoRadius + 2, color: deepNavy });
    if (photo) {
      drawCircularImageCover(page, photo, photoCenterX, photoCenterY, photoRadius);
    } else {
      page.drawCircle({ x: photoCenterX, y: photoCenterY, size: photoRadius, color: light });
      drawCenteredText(page, "PHOTO", photoCenterX, photoCenterY + 4, bold, 9, navy);
      drawCenteredText(page, "PENDING", photoCenterX, photoCenterY - 8, sans, 7, muted);
    }

    const infoX = frontX + 124;
    drawFittedText({ page, text: candidate.fullName, x: infoX, y: cardY + 139, maxWidth: 194, font: bold, preferredSize: 18, minimumSize: 11, color: white });
    drawFittedText({ page, text: candidate.educationLevel, x: infoX, y: cardY + 119, maxWidth: 154, font: bold, preferredSize: 9.5, minimumSize: 7, color: softGold });
    drawFittedText({ page, text: candidate.programName, x: infoX, y: cardY + 104, maxWidth: 176, font: sans, preferredSize: 8.5, minimumSize: 6.5, color: rgb(0.86, 0.9, 0.96) });

    drawField({ page, label: "Student ID", value: candidate.studentIdNumber, x: infoX, y: cardY + 72, width: 172, labelFont: bold, valueFont: bold, labelColor: softGold, valueColor: white });
    drawField({ page, label: "Admitted", value: dateText(candidate.admissionDate), x: infoX, y: cardY + 43, width: 78, labelFont: bold, valueFont: bold, labelColor: softGold, valueColor: white });
    drawField({ page, label: "Expires", value: dateText(candidate.studentIdExpiresAt), x: infoX + 96, y: cardY + 43, width: 86, labelFont: bold, valueFont: bold, labelColor: softGold, valueColor: white });

    page.drawRectangle({ x: frontX, y: cardY, width: cardW, height: 33, color: navy });
    page.drawRectangle({ x: frontX, y: cardY + 33, width: cardW, height: 3, color: gold });
    page.drawCircle({ x: frontX + 27, y: cardY + 16.5, size: 4.5, color: status === "ACTIVE" ? rgb(0.14, 0.75, 0.48) : rgb(0.84, 0.24, 0.18) });
    page.drawText(`Status: ${status}`, { x: frontX + 38, y: cardY + 13, size: 8.5, font: bold, color: white });
    page.drawText("letw.org", { x: frontX + cardW - 64, y: cardY + 13, size: 8.5, font: bold, color: softGold });

    // Back card
    page.drawRectangle({ x: backX, y: cardY, width: cardW, height: cardH, color: white, borderColor: gold, borderWidth: 1.1 });
    page.drawRectangle({ x: backX, y: cardY + cardH - 52, width: cardW, height: 52, color: navy });
    page.drawRectangle({ x: backX, y: cardY + cardH - 56, width: cardW, height: 4, color: gold });
    page.drawImage(logo, { x: backX + 142, y: cardY + 47, width: 112, height: 112, opacity: 0.045 });
    page.drawText("IDENTITY VERIFICATION", { x: backX + 26, y: cardY + cardH - 25, size: 12, font: bold, color: white });
    page.drawText("Scan to confirm current student status", { x: backX + 26, y: cardY + cardH - 41, size: 8, font: sans, color: rgb(0.82, 0.88, 0.96) });

    const qrSize = 86;
    const qrX = backX + cardW - 22 - qrSize;
    const qrY = cardY + 49;
    const qrCenterX = qrX + qrSize / 2;
    page.drawRectangle({ x: qrX - 9, y: qrY - 9, width: qrSize + 18, height: qrSize + 30, color: white, borderColor: gold, borderWidth: 1.2 });
    page.drawRectangle({ x: qrX - 4, y: qrY - 4, width: qrSize + 8, height: qrSize + 8, borderColor: rgb(0.66, 0.82, 0.96), borderWidth: 0.9 });
    drawCenteredText(page, "LIVE QR CHECK", qrCenterX, qrY + qrSize + 9, bold, 6.4, navy);
    page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    drawCenteredText(page, "SCAN TO VERIFY", qrCenterX, qrY - 14, bold, 6.5, navy);
    drawCenteredText(page, candidate.studentIdNumber, qrCenterX, qrY - 25, bold, 4.8, blue);

    const termsX = backX + 24;
    page.drawText("Verification rules", { x: termsX, y: cardY + 135, size: 11, font: bold, color: navy });
    let termY = cardY + 116;
    for (const line of [
      "This card remains the property of Light Encounter Tabernacle Worldwide.",
      "It is valid only when the QR confirmation page displays an active status.",
      "Suspended, expired, revoked, or replaced student IDs must not be accepted.",
      "Use the QR page for entrance, exam, class, and official school verification."
    ]) {
      page.drawCircle({ x: termsX + 4, y: termY + 3, size: 2.1, color: gold });
      const used = drawWrappedText({
        page,
        text: line,
        x: termsX + 13,
        y: termY,
        maxWidth: 170,
        font: sans,
        size: 7.05,
        lineHeight: 8.25,
        color: ink
      });
      termY -= used + 4;
    }
    page.drawText("Contact", { x: termsX, y: cardY + 37, size: 8, font: bold, color: navy });
    page.drawText("letw.org", { x: termsX, y: cardY + 24, size: 7.3, font: sans, color: blue });
    page.drawText(candidate.phone ?? candidate.email ?? "LETW academic office", { x: termsX + 58, y: cardY + 24, size: 7.3, font: sans, color: muted });
    page.drawRectangle({ x: backX, y: cardY, width: cardW, height: 20, color: navy });
    drawCenteredText(page, "LIGHT ENCOUNTER TABERNACLE WORLDWIDE", backX + cardW / 2, cardY + 7, bold, 7, white);

    if (status !== "ACTIVE") {
      drawInactiveOverlay(page, { x: frontX, y: cardY, width: cardW, height: cardH, font: bold, status });
      drawInactiveOverlay(page, { x: backX, y: cardY, width: cardW, height: cardH, font: bold, status });
    }

    page.drawLine({ start: { x: frontX, y: cardY - 18 }, end: { x: frontX + cardW, y: cardY - 18 }, thickness: 0.5, color: rgb(0.78, 0.72, 0.6) });
    page.drawLine({ start: { x: backX, y: cardY - 18 }, end: { x: backX + cardW, y: cardY - 18 }, thickness: 0.5, color: rgb(0.78, 0.72, 0.6) });
    page.drawText("Cut guide. Print at high quality and laminate if a physical card is needed.", { x: 58, y: 122, size: 8, font: oblique, color: muted });

    const pdfBytes = await pdf.save();
    const safeId = candidate.studentIdNumber.replace(/[^A-Za-z0-9-]/g, "");
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeId}-student-id.pdf"`,
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
