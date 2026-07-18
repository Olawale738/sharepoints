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
import { cardStatusTone } from "@/lib/qr-identity";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { getObjectBuffer } from "@/lib/storage";

export const runtime = "nodejs";

type PdfColor = ReturnType<typeof rgb>;

function dateText(value?: Date | null) {
  if (!value) return "No Expiry";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(value);
}

function titleCase(value?: string | null) {
  if (!value) return null;
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
  input.page.drawText(input.label.toUpperCase(), {
    x: input.x,
    y: input.y + 15,
    size: 6.1,
    font: input.labelFont,
    color: input.labelColor
  });
  drawFittedText({
    page: input.page,
    text: input.value,
    x: input.x,
    y: input.y,
    maxWidth: input.width,
    font: input.valueFont,
    preferredSize: 9.3,
    minimumSize: 6.4,
    color: input.valueColor
  });
}

async function getProfilePhotoBytes(userId: string, imageUrl?: string | null) {
  try {
    const body = await getObjectBuffer(`profiles/${userId}/avatar`);
    if (body.length) return body;
  } catch {
    // Fall back to an externally stored image URL when present.
  }

  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return null;
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const body = Buffer.from(await response.arrayBuffer());
    return body.length ? body : null;
  } catch {
    return null;
  }
}

async function embedProfilePhoto(pdf: PDFDocument, userId: string, imageUrl?: string | null) {
  const body = await getProfilePhotoBytes(userId, imageUrl);
  if (!body) return null;
  return embedImageForPdf(pdf, body);
}

function drawInactiveOverlay(page: PDFPage, input: { x: number; y: number; width: number; height: number; font: PDFFont; status: string }) {
  page.drawRectangle({ x: input.x, y: input.y + input.height / 2 - 22, width: input.width, height: 44, color: rgb(1, 1, 1), opacity: 0.78 });
  drawCenteredText(page, input.status, input.x + input.width / 2, input.y + input.height / 2 - 8, input.font, 26, rgb(0.65, 0.14, 0.12));
}

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    const url = new URL(request.url);
    const requestedUserId = url.searchParams.get("userId") || actor.id;

    if (requestedUserId !== actor.id) {
      const [authority, isAdmin] = await Promise.all([
        getOfficialIssuanceAuthority(actor.id),
        hasAnyWorkspaceAdminRole(actor.id)
      ]);
      if (!authority.canIssueIdCards && !isAdmin) {
        throw new ApiError(403, "Only administrators or approved ID-card issuers can print another member's plastic ID.");
      }
    }

    const [card, account] = await Promise.all([
      prisma.digitalMembershipCard.findFirst({
        where: { userId: requestedUserId, deletedAt: null }
      }),
      prisma.user.findFirst({
        where: { id: requestedUserId, deletedAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          category: true,
          image: true,
          memberProfile: {
            select: {
              membershipNumber: true,
              membershipStatus: true,
              phone: true,
              alternatePhone: true,
              city: true,
              country: true,
              membershipStartedAt: true,
              organizationPosition: true,
              digitalIdLocation: true
            }
          }
        }
      })
    ]);

    if (!account) throw new ApiError(404, "Member account was not found.");
    if (!card) throw new ApiError(404, "A digital membership card has not been issued to this account.");

    const pdf = await PDFDocument.create();
    const navy = rgb(0.043, 0.106, 0.239);
    const deepNavy = rgb(0.027, 0.067, 0.16);
    const gold = rgb(0.831, 0.686, 0.216);
    const softGold = rgb(0.965, 0.862, 0.45);
    const blue = rgb(0.039, 0.239, 0.514);
    const ink = rgb(0.071, 0.102, 0.157);
    const muted = rgb(0.38, 0.44, 0.52);
    const white = rgb(1, 1, 1);
    const paleBlue = rgb(0.942, 0.974, 1);
    const sans = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);
    const logoBytes = await readFile(path.join(process.cwd(), "public", "letw-logo-transparent.png"));
    const logo = await pdf.embedPng(logoBytes);
    const photo = await embedProfilePhoto(pdf, account.id, account.image);
    const verifyUrl = `${url.origin}/verify/member/${card.qrToken}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 520,
      margin: 2,
      color: { dark: "#0B1B3D", light: "#FFFFFF" },
      errorCorrectionLevel: "H"
    });
    const qr = await pdf.embedPng(Buffer.from(qrDataUrl.split(",")[1] ?? "", "base64"));
    const status = cardStatusTone(card);
    const memberNumber = account.memberProfile?.membershipNumber || card.cardNumber;
    const position = account.memberProfile?.organizationPosition || titleCase(account.category) || "Member";
    const location =
      account.memberProfile?.digitalIdLocation ||
      [account.memberProfile?.city, account.memberProfile?.country].filter(Boolean).join(", ") ||
      "LETTW Worldwide";
    const memberSince = String(account.memberProfile?.membershipStartedAt?.getUTCFullYear() ?? card.issuedAt.getUTCFullYear());
    const contact = account.memberProfile?.phone || account.memberProfile?.alternatePhone || account.email || "info@letw.org";

    const page = pdf.addPage([842, 595]);
    const cardW = 344;
    const cardH = 216;
    const frontX = 58;
    const backX = 440;
    const cardY = 188;

    page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(0.985, 0.988, 0.992) });
    page.drawText("LETW Membership Plastic ID Sheet", { x: 58, y: 535, size: 22, font: bold, color: navy });
    page.drawText("Front and back layouts are QR-verifiable and ready for high-quality card production.", { x: 58, y: 512, size: 9, font: sans, color: muted });
    page.drawText(`Generated for ${account.name ?? "LETTW Member"} - ${card.organizationId}`, { x: 58, y: 496, size: 8, font: sans, color: muted });
    page.drawText("FRONT", { x: frontX, y: cardY + cardH + 16, size: 8, font: bold, color: muted });
    page.drawText("BACK", { x: backX, y: cardY + cardH + 16, size: 8, font: bold, color: muted });

    page.drawRectangle({ x: frontX, y: cardY, width: cardW, height: cardH, color: deepNavy, borderColor: gold, borderWidth: 1.3 });
    page.drawRectangle({ x: frontX, y: cardY + cardH - 50, width: cardW, height: 50, color: navy });
    page.drawRectangle({ x: frontX, y: cardY + cardH - 54, width: cardW, height: 4, color: gold });
    page.drawImage(logo, { x: frontX + 18, y: cardY + cardH - 42, width: 34, height: 34 });
    page.drawText("LIGHT ENCOUNTER TABERNACLE", { x: frontX + 62, y: cardY + cardH - 23, size: 8.1, font: bold, color: white });
    page.drawText("WORLDWIDE", { x: frontX + 62, y: cardY + cardH - 38, size: 8.1, font: bold, color: white });
    drawFittedText({ page, text: "Official Membership Identity", x: frontX + 195, y: cardY + cardH - 33, maxWidth: 128, font: bold, preferredSize: 7.2, minimumSize: 5.6, color: softGold });
    page.drawImage(logo, { x: frontX + 184, y: cardY + 38, width: 122, height: 122, opacity: 0.04 });

    const photoX = frontX + 24;
    const photoY = cardY + 62;
    page.drawRectangle({ x: photoX - 4, y: photoY - 4, width: 92, height: 112, color: gold });
    page.drawRectangle({ x: photoX, y: photoY, width: 84, height: 104, color: navy });
    if (photo) {
      drawImageCover(page, photo, photoX, photoY, 84, 104);
    } else {
      page.drawRectangle({ x: photoX, y: photoY, width: 84, height: 104, color: paleBlue });
      drawCenteredText(page, "PHOTO", photoX + 42, photoY + 55, bold, 10, muted);
      drawCenteredText(page, "PENDING", photoX + 42, photoY + 40, sans, 7, muted);
    }

    const infoX = frontX + 134;
    drawFittedText({ page, text: account.name ?? "LETTW Member", x: infoX, y: cardY + 142, maxWidth: 184, font: bold, preferredSize: 18.5, minimumSize: 11, color: white });
    drawFittedText({ page, text: position, x: infoX, y: cardY + 121, maxWidth: 176, font: bold, preferredSize: 10.5, minimumSize: 7.2, color: softGold });
    page.drawRectangle({ x: infoX, y: cardY + 113, width: 54, height: 1.2, color: gold });
    drawField({ page, label: "Organization ID", value: card.organizationId, x: infoX, y: cardY + 83, width: 174, labelFont: bold, valueFont: bold, labelColor: softGold, valueColor: white });
    drawField({ page, label: "Member number", value: memberNumber, x: infoX, y: cardY + 54, width: 174, labelFont: bold, valueFont: bold, labelColor: softGold, valueColor: white });
    drawField({ page, label: "Member since", value: memberSince, x: infoX, y: cardY + 26, width: 80, labelFont: bold, valueFont: bold, labelColor: softGold, valueColor: white });
    drawField({ page, label: "Location", value: location, x: infoX + 96, y: cardY + 26, width: 88, labelFont: bold, valueFont: bold, labelColor: softGold, valueColor: white });

    page.drawRectangle({ x: frontX, y: cardY, width: cardW, height: 32, color: navy });
    page.drawRectangle({ x: frontX, y: cardY + 32, width: cardW, height: 3, color: gold });
    page.drawCircle({ x: frontX + 27, y: cardY + 16, size: 4.4, color: status === "ACTIVE" ? rgb(0.14, 0.75, 0.48) : rgb(0.84, 0.24, 0.18) });
    page.drawText(`Status: ${titleCase(status) ?? status}`, { x: frontX + 39, y: cardY + 12.5, size: 8.2, font: bold, color: white });
    page.drawText(`Issued: ${dateText(card.issuedAt)}`, { x: frontX + 120, y: cardY + 12.5, size: 7, font: sans, color: rgb(0.86, 0.9, 0.96) });
    page.drawText(`Valid: ${dateText(card.expiresAt)}`, { x: frontX + 220, y: cardY + 12.5, size: 7, font: sans, color: softGold });

    page.drawRectangle({ x: backX, y: cardY, width: cardW, height: cardH, color: white, borderColor: gold, borderWidth: 1.3 });
    page.drawRectangle({ x: backX, y: cardY + cardH - 50, width: cardW, height: 50, color: navy });
    page.drawRectangle({ x: backX, y: cardY + cardH - 54, width: cardW, height: 4, color: gold });
    page.drawImage(logo, { x: backX + 146, y: cardY + 48, width: 116, height: 116, opacity: 0.045 });
    page.drawText("IDENTITY VERIFICATION", { x: backX + 24, y: cardY + cardH - 24, size: 12.4, font: bold, color: white });
    page.drawText("Scan to confirm current membership status", { x: backX + 24, y: cardY + cardH - 40, size: 8.2, font: sans, color: rgb(0.82, 0.88, 0.96) });

    const termsX = backX + 24;
    page.drawText("Verification rules", { x: termsX, y: cardY + 134, size: 10, font: bold, color: navy });
    let termY = cardY + 116;
    for (const line of [
      "This card remains the property of Light Encounter Tabernacle Worldwide.",
      "It is valid only when the QR confirmation page displays an active status.",
      "Revoked, expired, suspended, replaced, altered, or deleted cards must not be accepted.",
      "Use the QR page for entrance, event, office, and official LETW identity verification."
    ]) {
      page.drawCircle({ x: termsX + 4, y: termY + 3, size: 2.2, color: gold });
      const used = drawWrappedText({
        page,
        text: line,
        x: termsX + 14,
        y: termY,
        maxWidth: 155,
        font: sans,
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
    page.drawText("LIVE QR", { x: qrCenterX - 18, y: qrY + qrSize + 10, size: 7, font: bold, color: navy });
    page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    drawCenteredText(page, "SCAN TO AUTHENTICATE", qrCenterX, qrY - 16, bold, 6.6, navy);
    drawCenteredText(page, card.organizationId, qrCenterX, qrY - 28, bold, 5.3, blue);

    page.drawText("Contact", { x: termsX, y: cardY + 34, size: 7.5, font: bold, color: navy });
    drawFittedText({ page, text: contact, x: termsX + 58, y: cardY + 34, maxWidth: 104, font: sans, preferredSize: 7, minimumSize: 5.4, color: muted });
    page.drawText("letw.org", { x: termsX, y: cardY + 21, size: 7.2, font: bold, color: blue });
    page.drawRectangle({ x: backX, y: cardY, width: cardW, height: 18, color: navy });
    drawCenteredText(page, "LIGHT ENCOUNTER TABERNACLE WORLDWIDE", backX + cardW / 2, cardY + 6.3, bold, 6.6, white);

    if (status !== "ACTIVE") {
      drawInactiveOverlay(page, { x: frontX, y: cardY, width: cardW, height: cardH, font: bold, status });
      drawInactiveOverlay(page, { x: backX, y: cardY, width: cardW, height: cardH, font: bold, status });
    }

    page.drawLine({ start: { x: frontX, y: cardY - 18 }, end: { x: frontX + cardW, y: cardY - 18 }, thickness: 0.5, color: rgb(0.78, 0.72, 0.6) });
    page.drawLine({ start: { x: backX, y: cardY - 18 }, end: { x: backX + cardW, y: cardY - 18 }, thickness: 0.5, color: rgb(0.78, 0.72, 0.6) });
    page.drawText("Print at high quality. Keep the QR code flat and unobstructed for scanning.", { x: 58, y: 126, size: 8.3, font: oblique, color: muted });

    const pdfBytes = await pdf.save();
    const safeId = card.organizationId.replace(/[^A-Za-z0-9-]/g, "");
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
  } catch (error) {
    return handleRouteError(error);
  }
}
