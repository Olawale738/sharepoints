import { readFile } from "fs/promises";
import path from "path";
import QRCode from "qrcode";
import { PDFDocument, PDFImage, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";

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

function drawImageFit(page: PDFPage, image: PDFImage, x: number, y: number, width: number, height: number, opacity = 1) {
  const scaled = image.scaleToFit(width, height);
  page.drawImage(image, {
    x: x + (width - scaled.width) / 2,
    y: y + (height - scaled.height) / 2,
    width: scaled.width,
    height: scaled.height,
    opacity
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
  input.page.drawText(input.label.toUpperCase(), {
    x: input.x,
    y: input.y + 12,
    size: 5.1,
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
    preferredSize: 6.9,
    minimumSize: 5.2,
    color: input.valueColor
  });
}

async function embedProfilePhoto(pdf: PDFDocument, userId: string) {
  try {
    const body = await getObjectBuffer(`profiles/${userId}/avatar`);
    return await embedImageForPdf(pdf, body);
  } catch {
    return null;
  }
}

function drawInactiveOverlay(page: PDFPage, input: { width: number; height: number; font: PDFFont; status: string }) {
  page.drawRectangle({ x: 0, y: input.height / 2 - 21, width: input.width, height: 42, color: rgb(1, 1, 1), opacity: 0.8 });
  drawCenteredText(page, input.status, input.width / 2, input.height / 2 - 8, input.font, 24, rgb(0.65, 0.14, 0.12));
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
    const pageW = 243;
    const pageH = 153;
    const navy = rgb(0.043, 0.106, 0.239);
    const deepNavy = rgb(0.027, 0.067, 0.16);
    const gold = rgb(0.831, 0.686, 0.216);
    const softGold = rgb(0.965, 0.862, 0.45);
    const blue = rgb(0.039, 0.239, 0.514);
    const ink = rgb(0.071, 0.102, 0.157);
    const muted = rgb(0.38, 0.44, 0.52);
    const light = rgb(0.952, 0.973, 1);
    const white = rgb(1, 1, 1);
    const sans = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const logoBytes = await readFile(path.join(process.cwd(), "public", "letw-logo-transparent.png"));
    const logo = await pdf.embedPng(logoBytes);
    const photo = account.image?.startsWith("/api/profile/photo/") ? await embedProfilePhoto(pdf, account.id) : null;
    const verifyUrl = `${url.origin}/verify/member/${card.qrToken}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 380,
      margin: 1,
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

    const front = pdf.addPage([pageW, pageH]);
    front.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: deepNavy });
    front.drawRectangle({ x: 0, y: pageH - 38, width: pageW, height: 38, color: navy });
    front.drawRectangle({ x: 0, y: pageH - 41, width: pageW, height: 3, color: gold });
    front.drawCircle({ x: pageW - 26, y: pageH - 24, size: 36, color: rgb(0.07, 0.16, 0.31), opacity: 0.28 });
    front.drawCircle({ x: 24, y: 34, size: 35, color: rgb(0.08, 0.19, 0.36), opacity: 0.22 });
    front.drawImage(logo, { x: 11, y: pageH - 32, width: 25, height: 25 });
    front.drawText("LIGHT ENCOUNTER TABERNACLE", { x: 43, y: pageH - 16, size: 6.5, font: bold, color: white });
    front.drawText("WORLDWIDE", { x: 43, y: pageH - 27, size: 6.5, font: bold, color: white });
    drawFittedText({ page: front, text: "Membership Identity", x: 152, y: pageH - 25, maxWidth: 72, font: bold, preferredSize: 5.7, minimumSize: 4.6, color: softGold });
    front.drawImage(logo, { x: 118, y: 31, width: 104, height: 104, opacity: 0.038 });

    front.drawRectangle({ x: 17, y: 61, width: 50, height: 62, color: gold });
    front.drawRectangle({ x: 20, y: 64, width: 44, height: 56, color: white });
    if (photo) {
      drawImageFit(front, photo, 22, 66, 40, 52);
    } else {
      front.drawRectangle({ x: 22, y: 66, width: 40, height: 52, color: light });
      drawCenteredText(front, "PHOTO", 42, 93, bold, 6.2, muted);
      drawCenteredText(front, "PENDING", 42, 84, sans, 4.8, muted);
    }

    drawFittedText({ page: front, text: account.name ?? "LETTW Member", x: 82, y: 106, maxWidth: 144, font: bold, preferredSize: 11.8, minimumSize: 7.8, color: white });
    drawFittedText({ page: front, text: position, x: 82, y: 91, maxWidth: 124, font: bold, preferredSize: 7.4, minimumSize: 5.5, color: softGold });
    front.drawRectangle({ x: 82, y: 84, width: 34, height: 1, color: gold });

    drawField({ page: front, label: "Organization ID", value: card.organizationId, x: 17, y: 42, width: 96, labelFont: bold, valueFont: bold, labelColor: softGold, valueColor: white });
    drawField({ page: front, label: "Member Number", value: memberNumber, x: 127, y: 42, width: 96, labelFont: bold, valueFont: bold, labelColor: softGold, valueColor: white });
    drawField({ page: front, label: "Member Since", value: memberSince, x: 17, y: 24, width: 84, labelFont: bold, valueFont: bold, labelColor: softGold, valueColor: white });
    drawField({ page: front, label: "Location", value: location, x: 127, y: 24, width: 96, labelFont: bold, valueFont: bold, labelColor: softGold, valueColor: white });
    front.drawRectangle({ x: 0, y: 0, width: pageW, height: 18, color: navy });
    front.drawRectangle({ x: 0, y: 18, width: pageW, height: 2, color: gold });
    front.drawCircle({ x: 18, y: 9, size: 3.1, color: status === "ACTIVE" ? rgb(0.14, 0.75, 0.48) : rgb(0.84, 0.24, 0.18) });
    front.drawText(`Status: ${titleCase(status) ?? status}`, { x: 26, y: 6.4, size: 5.9, font: bold, color: white });
    front.drawText(`Issued: ${dateText(card.issuedAt)}`, { x: 82, y: 6.4, size: 5.5, font: sans, color: rgb(0.86, 0.9, 0.96) });
    front.drawText(`Valid: ${dateText(card.expiresAt)}`, { x: 156, y: 6.4, size: 5.5, font: sans, color: softGold });

    const back = pdf.addPage([pageW, pageH]);
    back.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: white });
    back.drawRectangle({ x: 0, y: pageH - 38, width: pageW, height: 38, color: navy });
    back.drawRectangle({ x: 0, y: pageH - 41, width: pageW, height: 3, color: gold });
    back.drawImage(logo, { x: 76, y: 34, width: 92, height: 92, opacity: 0.045 });
    back.drawText("IDENTITY VERIFICATION", { x: 15, y: pageH - 18, size: 8.8, font: bold, color: white });
    back.drawText("Scan to confirm current membership status", { x: 15, y: pageH - 30, size: 5.5, font: sans, color: rgb(0.82, 0.88, 0.96) });
    back.drawText("Verification rules", { x: 15, y: 106, size: 7, font: bold, color: navy });

    let termY = 93;
    for (const line of [
      "This card remains the property of Light Encounter Tabernacle Worldwide.",
      "It is valid only when the QR confirmation page displays an active status.",
      "Revoked, expired, suspended, replaced, altered, or deleted cards are invalid."
    ]) {
      back.drawCircle({ x: 18, y: termY + 2.3, size: 1.7, color: gold });
      const used = drawWrappedText({
        page: back,
        text: line,
        x: 25,
        y: termY,
        maxWidth: 109,
        font: sans,
        size: 4.65,
        lineHeight: 5.45,
        color: ink
      });
      termY -= used + 3;
    }

    const qrSize = 70;
    const qrX = pageW - 18 - qrSize;
    const qrY = 42;
    back.drawRectangle({ x: qrX - 8, y: qrY - 8, width: qrSize + 16, height: qrSize + 17, color: white, borderColor: gold, borderWidth: 1 });
    drawCenteredText(back, "LIVE QR", qrX + qrSize / 2, qrY + qrSize + 5, bold, 4.8, navy);
    back.drawRectangle({ x: qrX - 2, y: qrY - 2, width: qrSize + 4, height: qrSize + 4, borderColor: rgb(0.66, 0.82, 0.96), borderWidth: 0.6 });
    back.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    drawCenteredText(back, "SCAN TO AUTHENTICATE", qrX + qrSize / 2, qrY - 10, bold, 4.5, navy);
    drawCenteredText(back, card.organizationId, qrX + qrSize / 2, qrY - 18, bold, 3.9, blue);

    back.drawText("Contact", { x: 15, y: 27, size: 5.8, font: bold, color: navy });
    drawFittedText({ page: back, text: contact, x: 50, y: 27, maxWidth: 84, font: sans, preferredSize: 5.25, minimumSize: 4, color: muted });
    back.drawText("letw.org", { x: 15, y: 18, size: 5.6, font: bold, color: blue });
    back.drawRectangle({ x: 0, y: 0, width: pageW, height: 15, color: navy });
    drawCenteredText(back, "LIGHT ENCOUNTER TABERNACLE WORLDWIDE", pageW / 2, 5.5, bold, 5, white);

    if (status !== "ACTIVE") {
      drawInactiveOverlay(front, { width: pageW, height: pageH, font: bold, status });
      drawInactiveOverlay(back, { width: pageW, height: pageH, font: bold, status });
    }

    const pdfBytes = await pdf.save();
    const safeId = card.organizationId.replace(/[^A-Za-z0-9-]/g, "");
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeId}-plastic-id-cr80.pdf"`,
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
