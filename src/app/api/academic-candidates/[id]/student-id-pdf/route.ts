import { readFile } from "fs/promises";
import path from "path";
import QRCode from "qrcode";
import {
  clip,
  endPath,
  PDFDocument,
  PDFImage,
  PDFFont,
  PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
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

function drawImageCover(page: PDFPage, image: PDFImage, x: number, y: number, width: number, height: number, opacity = 1) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  page.pushOperators(pushGraphicsState(), rectangle(x, y, width, height), clip(), endPath());
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

function drawStudentPlasticSheet(input: {
  pdf: PDFDocument;
  logo: PDFImage;
  photo: PDFImage | null;
  qr: PDFImage;
  fonts: { sans: PDFFont; bold: PDFFont; oblique: PDFFont };
  candidate: {
    fullName: string;
    phone?: string | null;
    email?: string | null;
    organization?: string | null;
    programName: string;
    educationLevel: string;
    fieldOfStudy: string;
    studyMode?: string | null;
    admissionDate?: Date | null;
    studentIdNumber: string;
    studentIdIssuedAt?: Date | null;
    studentIdExpiresAt?: Date | null;
  };
  status: string;
}) {
  const { pdf, logo, photo, qr, fonts, candidate, status } = input;
  const page = pdf.addPage([842, 595]);
  const navy = rgb(0.043, 0.106, 0.239);
  const deepNavy = rgb(0.027, 0.067, 0.16);
  const gold = rgb(0.831, 0.686, 0.216);
  const softGold = rgb(0.965, 0.862, 0.45);
  const blue = rgb(0.039, 0.239, 0.514);
  const ink = rgb(0.071, 0.102, 0.157);
  const muted = rgb(0.38, 0.44, 0.52);
  const white = rgb(1, 1, 1);
  const paleBlue = rgb(0.942, 0.974, 1);
  const cardW = 344;
  const cardH = 216;
  const frontX = 58;
  const backX = 440;
  const cardY = 188;
  const schoolName = candidate.organization?.trim() || "LETW School of Theology";

  page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(0.985, 0.988, 0.992) });
  page.drawText("LETW Student Plastic ID Sheet", { x: 58, y: 535, size: 22, font: fonts.bold, color: navy });
  page.drawText("Front and back layouts are QR-verifiable and ready for high-quality card production.", { x: 58, y: 512, size: 9, font: fonts.sans, color: muted });
  page.drawText(`Generated for ${candidate.fullName} - ${candidate.studentIdNumber}`, { x: 58, y: 496, size: 8, font: fonts.sans, color: muted });
  page.drawText("FRONT", { x: frontX, y: cardY + cardH + 16, size: 8, font: fonts.bold, color: muted });
  page.drawText("BACK", { x: backX, y: cardY + cardH + 16, size: 8, font: fonts.bold, color: muted });

  page.drawRectangle({ x: frontX, y: cardY, width: cardW, height: cardH, color: deepNavy, borderColor: gold, borderWidth: 1.3 });
  page.drawRectangle({ x: frontX, y: cardY + cardH - 50, width: cardW, height: 50, color: navy });
  page.drawRectangle({ x: frontX, y: cardY + cardH - 54, width: cardW, height: 4, color: gold });
  page.drawImage(logo, { x: frontX + 18, y: cardY + cardH - 42, width: 34, height: 34 });
  page.drawText("LIGHT ENCOUNTER TABERNACLE", { x: frontX + 62, y: cardY + cardH - 23, size: 8.1, font: fonts.bold, color: white });
  page.drawText("WORLDWIDE", { x: frontX + 62, y: cardY + cardH - 38, size: 8.1, font: fonts.bold, color: white });
  drawFittedText({ page, text: schoolName, x: frontX + 197, y: cardY + cardH - 33, maxWidth: 126, font: fonts.bold, preferredSize: 7.2, minimumSize: 5.6, color: softGold });
  page.drawImage(logo, { x: frontX + 186, y: cardY + 41, width: 118, height: 118, opacity: 0.04 });

  const photoX = frontX + 24;
  const photoY = cardY + 62;
  page.drawRectangle({ x: photoX - 4, y: photoY - 4, width: 92, height: 112, color: gold });
  page.drawRectangle({ x: photoX, y: photoY, width: 84, height: 104, color: navy });
  if (photo) {
    drawImageCover(page, photo, photoX, photoY, 84, 104);
  } else {
    page.drawRectangle({ x: photoX, y: photoY, width: 84, height: 104, color: paleBlue });
    drawCenteredText(page, "PHOTO", photoX + 42, photoY + 55, fonts.bold, 10, muted);
    drawCenteredText(page, "PENDING", photoX + 42, photoY + 40, fonts.sans, 7, muted);
  }

  const infoX = frontX + 134;
  drawFittedText({ page, text: candidate.fullName, x: infoX, y: cardY + 142, maxWidth: 184, font: fonts.bold, preferredSize: 18.5, minimumSize: 11, color: white });
  drawFittedText({ page, text: candidate.educationLevel, x: infoX, y: cardY + 121, maxWidth: 176, font: fonts.bold, preferredSize: 10.5, minimumSize: 7.2, color: softGold });
  drawFittedText({ page, text: candidate.programName, x: infoX, y: cardY + 104, maxWidth: 176, font: fonts.sans, preferredSize: 8.8, minimumSize: 6.3, color: rgb(0.86, 0.9, 0.96) });
  drawField({ page, label: "Student ID", value: candidate.studentIdNumber, x: infoX, y: cardY + 73, width: 174, labelFont: fonts.bold, valueFont: fonts.bold, labelColor: softGold, valueColor: white });
  drawField({ page, label: "Admitted", value: dateText(candidate.admissionDate), x: infoX, y: cardY + 43, width: 78, labelFont: fonts.bold, valueFont: fonts.bold, labelColor: softGold, valueColor: white });
  drawField({ page, label: "Expires", value: dateText(candidate.studentIdExpiresAt), x: infoX + 96, y: cardY + 43, width: 86, labelFont: fonts.bold, valueFont: fonts.bold, labelColor: softGold, valueColor: white });

  page.drawRectangle({ x: frontX, y: cardY, width: cardW, height: 32, color: navy });
  page.drawRectangle({ x: frontX, y: cardY + 32, width: cardW, height: 3, color: gold });
  page.drawCircle({ x: frontX + 27, y: cardY + 16, size: 4.4, color: status === "ACTIVE" ? rgb(0.14, 0.75, 0.48) : rgb(0.84, 0.24, 0.18) });
  page.drawText(`Status: ${status}`, { x: frontX + 39, y: cardY + 12.5, size: 8.2, font: fonts.bold, color: white });
  page.drawText(`Issued: ${dateText(candidate.studentIdIssuedAt)}`, { x: frontX + 122, y: cardY + 12.5, size: 7, font: fonts.sans, color: rgb(0.86, 0.9, 0.96) });
  page.drawText("letw.org", { x: frontX + cardW - 62, y: cardY + 12.5, size: 8, font: fonts.bold, color: softGold });

  page.drawRectangle({ x: backX, y: cardY, width: cardW, height: cardH, color: white, borderColor: gold, borderWidth: 1.3 });
  page.drawRectangle({ x: backX, y: cardY + cardH - 50, width: cardW, height: 50, color: navy });
  page.drawRectangle({ x: backX, y: cardY + cardH - 54, width: cardW, height: 4, color: gold });
  page.drawImage(logo, { x: backX + 146, y: cardY + 48, width: 116, height: 116, opacity: 0.045 });
  page.drawText("IDENTITY VERIFICATION", { x: backX + 24, y: cardY + cardH - 24, size: 12.4, font: fonts.bold, color: white });
  page.drawText("Scan to confirm current student status", { x: backX + 24, y: cardY + cardH - 40, size: 8.2, font: fonts.sans, color: rgb(0.82, 0.88, 0.96) });

  const termsX = backX + 24;
  page.drawText("Verification rules", { x: termsX, y: cardY + 134, size: 10, font: fonts.bold, color: navy });
  let termY = cardY + 116;
  for (const line of [
    "This card remains the property of Light Encounter Tabernacle Worldwide.",
    "It is valid only when the QR confirmation page displays an active status.",
    "Suspended, expired, revoked, replaced, or altered student IDs must not be accepted.",
    "Use the QR page for entrance, exam, class, and official school verification."
  ]) {
    page.drawCircle({ x: termsX + 4, y: termY + 3, size: 2.2, color: gold });
    const used = drawWrappedText({
      page,
      text: line,
      x: termsX + 14,
      y: termY,
      maxWidth: 155,
      font: fonts.sans,
      size: 6.25,
      lineHeight: 7.35,
      color: ink
    });
    termY -= used + 3.2;
  }

  const qrSize = 104;
  const qrX = backX + cardW - 24 - qrSize;
  const qrY = cardY + 50;
  const qrCenterX = qrX + qrSize / 2;
  page.drawRectangle({ x: qrX - 11, y: qrY - 11, width: qrSize + 22, height: qrSize + 34, color: white, borderColor: gold, borderWidth: 1.2 });
  page.drawRectangle({ x: qrX - 5, y: qrY - 5, width: qrSize + 10, height: qrSize + 10, borderColor: rgb(0.65, 0.82, 0.96), borderWidth: 1 });
  page.drawText("LIVE QR", { x: qrCenterX - 18, y: qrY + qrSize + 10, size: 7, font: fonts.bold, color: navy });
  page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  drawCenteredText(page, "SCAN TO AUTHENTICATE", qrCenterX, qrY - 16, fonts.bold, 6.6, navy);
  drawCenteredText(page, candidate.studentIdNumber, qrCenterX, qrY - 28, fonts.bold, 5.3, blue);

  page.drawText("Contact", { x: termsX, y: cardY + 34, size: 7.5, font: fonts.bold, color: navy });
  drawFittedText({ page, text: candidate.phone ?? candidate.email ?? "LETW academic office", x: termsX + 58, y: cardY + 34, maxWidth: 104, font: fonts.sans, preferredSize: 7, minimumSize: 5.4, color: muted });
  page.drawText("letw.org", { x: termsX, y: cardY + 21, size: 7.2, font: fonts.bold, color: blue });
  page.drawRectangle({ x: backX, y: cardY, width: cardW, height: 18, color: navy });
  drawCenteredText(page, "LIGHT ENCOUNTER TABERNACLE WORLDWIDE", backX + cardW / 2, cardY + 6.3, fonts.bold, 6.6, white);

  if (status !== "ACTIVE") {
    drawInactiveOverlay(page, { x: frontX, y: cardY, width: cardW, height: cardH, font: fonts.bold, status });
    drawInactiveOverlay(page, { x: backX, y: cardY, width: cardW, height: cardH, font: fonts.bold, status });
  }

  page.drawLine({ start: { x: frontX, y: cardY - 18 }, end: { x: frontX + cardW, y: cardY - 18 }, thickness: 0.5, color: rgb(0.78, 0.72, 0.6) });
  page.drawLine({ start: { x: backX, y: cardY - 18 }, end: { x: backX + cardW, y: cardY - 18 }, thickness: 0.5, color: rgb(0.78, 0.72, 0.6) });
  page.drawText("Print at high quality. Keep the QR code flat and unobstructed for scanning.", { x: 58, y: 126, size: 8.3, font: fonts.oblique, color: muted });
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
    const format = new URL(request.url).searchParams.get("format");

    if (format === "plastic") {
      drawStudentPlasticSheet({
        pdf,
        logo,
        photo,
        qr,
        fonts: { sans, bold, oblique },
        candidate: {
          ...candidate,
          studentIdNumber: candidate.studentIdNumber
        },
        status
      });
      const pdfBytes = await pdf.save();
      const safeId = candidate.studentIdNumber.replace(/[^A-Za-z0-9-]/g, "");
      return new Response(Buffer.from(pdfBytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${safeId}-plastic-id.pdf"`,
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
          "X-Content-Type-Options": "nosniff",
          "X-Robots-Tag": "noindex, nofollow, noarchive"
        }
      });
    }

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

    const photoX = frontX + 24;
    const photoY = cardY + 58;
    page.drawRectangle({ x: photoX - 4, y: photoY - 4, width: 84, height: 106, color: white, borderColor: gold, borderWidth: 1.4 });
    if (photo) {
      drawImageCover(page, photo, photoX, photoY, 76, 98);
    } else {
      page.drawRectangle({ x: photoX, y: photoY, width: 76, height: 98, color: light });
      drawCenteredText(page, "PHOTO", photoX + 38, photoY + 51, bold, 9, muted);
      drawCenteredText(page, "PENDING", photoX + 38, photoY + 39, sans, 7, muted);
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

    const qrSize = 94;
    const qrX = backX + cardW - 26 - qrSize;
    const qrY = cardY + 55;
    const qrCenterX = qrX + qrSize / 2;
    page.drawRectangle({ x: qrX - 10, y: qrY - 10, width: qrSize + 20, height: qrSize + 30, color: white, borderColor: gold, borderWidth: 1.25 });
    page.drawRectangle({ x: qrX - 4, y: qrY - 4, width: qrSize + 8, height: qrSize + 8, borderColor: rgb(0.66, 0.82, 0.96), borderWidth: 0.8 });
    drawCenteredText(page, "LIVE QR VERIFICATION", qrCenterX, qrY + qrSize + 10, bold, 6.2, navy);
    page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    drawCenteredText(page, "SCAN TO AUTHENTICATE", qrCenterX, qrY - 15, bold, 6.6, navy);
    drawCenteredText(page, candidate.studentIdNumber, qrCenterX, qrY - 27, bold, 5.2, blue);

    const termsX = backX + 24;
    page.drawText("Verification rules", { x: termsX, y: cardY + 136, size: 10, font: bold, color: navy });
    let termY = cardY + 117;
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
        maxWidth: 154,
        font: sans,
        size: 6.1,
        lineHeight: 7.15,
        color: ink
      });
      termY -= used + 3.2;
    }
    page.drawText("Contact", { x: termsX, y: cardY + 36, size: 7.5, font: bold, color: navy });
    page.drawText("letw.org", { x: termsX, y: cardY + 24, size: 7, font: sans, color: blue });
    page.drawText(candidate.phone ?? candidate.email ?? "LETW academic office", { x: termsX + 58, y: cardY + 24, size: 7, font: sans, color: muted });
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
