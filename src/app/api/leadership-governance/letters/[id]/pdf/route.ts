import { readFile } from "fs/promises";
import path from "path";
import QRCode from "qrcode";
import { PDFDocument, PDFImage, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { requireLeadershipGovernanceScopeAccess } from "@/lib/leadership-governance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type PdfColor = ReturnType<typeof rgb>;
type FontSet = {
  sans: PDFFont;
  bold: PDFFont;
  serif: PDFFont;
  script: PDFFont;
};

const pageSize: [number, number] = [595, 842];
const marginX = 54;
const contentWidth = pageSize[0] - marginX * 2;
const bodyTop = 650;
const bodyBottom = 116;
const signatureBlockTop = 256;

function formatDate(value?: Date | null) {
  if (!value) return "Not issued";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(value);
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-");
}

function fittedFontSize(font: PDFFont, text: string, maxWidth: number, preferred: number, minimum: number) {
  let size = preferred;
  while (size > minimum && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

function drawFittedText(page: PDFPage, text: string, x: number, y: number, maxWidth: number, font: PDFFont, size: number, color: PdfColor) {
  page.drawText(text, {
    x,
    y,
    size: fittedFontSize(font, text, maxWidth, size, 6),
    font,
    color
  });
}

function wrapByWidth(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next;
        continue;
      }

      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        line = word;
      } else {
        let chunk = "";
        for (const character of word) {
          const nextChunk = `${chunk}${character}`;
          if (font.widthOfTextAtSize(nextChunk, size) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = character;
          } else {
            chunk = nextChunk;
          }
        }
        line = chunk;
      }
    }
    if (line) lines.push(line);
    lines.push("");
  }
  while (lines.at(-1) === "") lines.pop();
  return lines;
}

function wrapParagraphsByWidth(text: string, font: PDFFont, size: number, maxWidth: number) {
  return text.split(/\n+/).map((paragraph) => wrapByWidth(paragraph, font, size, maxWidth));
}

function drawJustifiedLine(page: PDFPage, text: string, x: number, y: number, width: number, font: PDFFont, size: number, color: PdfColor) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    page.drawText(text, { x, y, size, font, color });
    return;
  }

  const wordsWidth = words.reduce((total, word) => total + font.widthOfTextAtSize(word, size), 0);
  const gap = (width - wordsWidth) / (words.length - 1);
  const naturalGap = font.widthOfTextAtSize(" ", size);
  if (gap <= naturalGap || gap > 11) {
    page.drawText(text, { x, y, size, font, color });
    return;
  }

  let currentX = x;
  words.forEach((word) => {
    page.drawText(word, { x: currentX, y, size, font, color });
    currentX += font.widthOfTextAtSize(word, size) + gap;
  });
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

function drawHeader(input: {
  page: PDFPage;
  logo: PDFImage;
  fonts: FontSet;
  letterNumber: string;
  status: string;
  navy: PdfColor;
  gold: PdfColor;
  white: PdfColor;
}) {
  const { page, logo, fonts, letterNumber, status, navy, gold, white } = input;
  page.drawRectangle({ x: 0, y: 736, width: pageSize[0], height: 106, color: navy });
  page.drawRectangle({ x: 0, y: 730, width: pageSize[0], height: 6, color: gold });
  page.drawImage(logo, { x: 44, y: 756, width: 62, height: 62 });
  drawFittedText(page, "LIGHT ENCOUNTER TABERNACLE WORLDWIDE", 122, 795, 272, fonts.bold, 14, white);
  page.drawText("Official Leadership Letter - letw.org", { x: 122, y: 776, size: 9.2, font: fonts.bold, color: gold });
  page.drawText("Encounter God. Experience Transformation. Impact Nations.", { x: 122, y: 760, size: 8.2, font: fonts.sans, color: white });

  page.drawRectangle({ x: 416, y: 774, width: 126, height: 34, color: white, opacity: 0.11, borderColor: gold, borderWidth: 0.7 });
  drawFittedText(page, letterNumber, 426, 794, 104, fonts.bold, 8.5, gold);
  page.drawText(status, { x: 426, y: 780, size: 7.5, font: fonts.bold, color: white });
}

function drawFooter(input: {
  page: PDFPage;
  fonts: FontSet;
  pageNumber: number;
  navy: PdfColor;
  gold: PdfColor;
  muted: PdfColor;
}) {
  const { page, fonts, pageNumber, navy, gold, muted } = input;
  page.drawLine({ start: { x: marginX, y: 82 }, end: { x: pageSize[0] - marginX, y: 82 }, thickness: 0.7, color: gold });
  page.drawText("Light Encounter Tabernacle Worldwide | letw.org", { x: marginX, y: 62, size: 8.6, font: fonts.bold, color: navy });
  page.drawText("Official LETW record. Confirm current status from the verification QR before relying on this letter.", {
    x: marginX,
    y: 48,
    size: 7.3,
    font: fonts.sans,
    color: muted
  });
  page.drawText(`Page ${pageNumber}`, { x: pageSize[0] - 88, y: 62, size: 8, font: fonts.bold, color: navy });
}

function drawOfficialFrame(page: PDFPage, navy: PdfColor, gold: PdfColor) {
  page.drawRectangle({ x: 28, y: 30, width: pageSize[0] - 56, height: pageSize[1] - 60, borderColor: navy, borderWidth: 1.05 });
  page.drawRectangle({ x: 34, y: 36, width: pageSize[0] - 68, height: pageSize[1] - 72, borderColor: gold, borderWidth: 0.45 });
  page.drawLine({ start: { x: 42, y: 722 }, end: { x: pageSize[0] - 42, y: 722 }, thickness: 0.55, color: gold });
}

function drawSeal(input: {
  page: PDFPage;
  logo: PDFImage;
  fonts: FontSet;
  x: number;
  y: number;
  navy: PdfColor;
  gold: PdfColor;
  white: PdfColor;
}) {
  const { page, logo, fonts, x, y, navy, gold, white } = input;
  page.drawEllipse({ x, y, xScale: 34, yScale: 34, color: white, borderColor: gold, borderWidth: 2.2 });
  page.drawEllipse({ x, y, xScale: 27, yScale: 27, borderColor: navy, borderWidth: 0.9 });
  page.drawImage(logo, { x: x - 20, y: y - 20, width: 40, height: 40, opacity: 0.94 });
  drawCenteredText(page, "LETW SEAL", x, y - 43, fonts.bold, 6.4, navy);
}

function drawQrChip(input: {
  page: PDFPage;
  qr: PDFImage;
  fonts: FontSet;
  x: number;
  y: number;
  width: number;
  height: number;
  letterNumber: string;
  navy: PdfColor;
  blue: PdfColor;
  gold: PdfColor;
  white: PdfColor;
}) {
  const { page, qr, fonts, x, y, width, height, letterNumber, navy, blue, gold, white } = input;
  page.drawRectangle({ x, y, width, height, color: rgb(0.965, 0.984, 1), borderColor: gold, borderWidth: 1.15 });
  page.drawRectangle({ x: x + 5, y: y + 5, width: width - 10, height: height - 10, borderColor: rgb(0.58, 0.73, 0.91), borderWidth: 0.6 });
  page.drawRectangle({ x: x + 8, y: y + height - 25, width: width - 16, height: 17, color: rgb(0.9, 0.96, 1), borderColor: rgb(0.68, 0.8, 0.93), borderWidth: 0.45 });
  drawCenteredText(page, "SECURE QR CHIP", x + width / 2, y + height - 20, fonts.bold, 6.6, blue);

  for (let index = 0; index < 7; index += 1) {
    page.drawLine({
      start: { x: x + 12 + index * 19, y: y + 12 },
      end: { x: x + 12 + index * 19, y: y + height - 32 },
      thickness: 0.25,
      color: rgb(0.54, 0.72, 0.91),
      opacity: 0.28
    });
    page.drawLine({
      start: { x: x + 10, y: y + 20 + index * 17 },
      end: { x: x + width - 10, y: y + 20 + index * 17 },
      thickness: 0.25,
      color: rgb(0.54, 0.72, 0.91),
      opacity: 0.24
    });
  }

  const qrSize = Math.min(width - 30, height - 70);
  const qrX = x + (width - qrSize) / 2;
  const qrY = y + 42;
  page.drawRectangle({ x: qrX - 7, y: qrY - 7, width: qrSize + 14, height: qrSize + 14, color: white, borderColor: gold, borderWidth: 0.9 });
  page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  drawCenteredText(page, "SCAN TO VERIFY", x + width / 2, y + 28, fonts.bold, 7.7, navy);
  drawCenteredText(page, "LIVE LETTER STATUS", x + width / 2, y + 17, fonts.bold, 6.7, blue);
  drawFittedText(page, letterNumber, x + 11, y + 7, width - 22, fonts.bold, 6.1, navy);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const letter = await prisma.officialLetter.findUnique({ where: { id } });
    if (!letter) throw new ApiError(404, "Official letter not found.");
    await requireLeadershipGovernanceScopeAccess(user.id, {
      ...letter,
      participantIds: [letter.recipientUserId]
    });

    const [workspace, unit, issuer, recipient] = await Promise.all([
      letter.workspaceId ? prisma.workspace.findUnique({ where: { id: letter.workspaceId }, select: { name: true } }) : null,
      letter.organizationUnitId
        ? prisma.organizationUnit.findUnique({ where: { id: letter.organizationUnitId }, select: { name: true, type: true, countryCode: true } })
        : null,
      prisma.user.findUnique({ where: { id: letter.issuedById }, select: { name: true, email: true } }),
      letter.recipientUserId
        ? prisma.user.findUnique({
            where: { id: letter.recipientUserId },
            select: {
              memberProfile: {
                select: {
                  membershipNumber: true,
                  organizationPosition: true,
                  phone: true,
                  city: true,
                  country: true
                }
              }
            }
          })
        : null
    ]);

    const pdf = await PDFDocument.create();
    const fonts: FontSet = {
      sans: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      serif: await pdf.embedFont(StandardFonts.TimesRomanBold),
      script: await pdf.embedFont(StandardFonts.TimesRomanItalic)
    };
    const logo = await pdf.embedPng(await readFile(path.join(process.cwd(), "public", "letw-logo.png")));
    const navy = rgb(0.043, 0.106, 0.239);
    const blue = rgb(0.039, 0.239, 0.514);
    const gold = rgb(0.831, 0.686, 0.216);
    const ink = rgb(0.071, 0.102, 0.157);
    const muted = rgb(0.38, 0.42, 0.48);
    const light = rgb(0.94, 0.973, 1);
    const white = rgb(1, 1, 1);
    const revoked = rgb(0.65, 0.28, 0.2);
    const origin = new URL(request.url).origin;
    const verifyUrl = `${origin}/verify/letter/${letter.id}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 520,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#0b1b3d", light: "#ffffff" }
    });
    const qr = await pdf.embedPng(Buffer.from(qrDataUrl.split(",")[1] ?? "", "base64"));

    let pageNumber = 1;
    let page = pdf.addPage(pageSize);
    drawHeader({ page, logo, fonts, letterNumber: letter.letterNumber, status: letter.status, navy, gold, white });
    drawFooter({ page, fonts, pageNumber, navy, gold, muted });
    drawOfficialFrame(page, navy, gold);
    page.drawImage(logo, { x: 178, y: 267, width: 238, height: 238, opacity: 0.035 });

    const addPage = () => {
      pageNumber += 1;
      page = pdf.addPage(pageSize);
      drawHeader({ page, logo, fonts, letterNumber: letter.letterNumber, status: letter.status, navy, gold, white });
      drawFooter({ page, fonts, pageNumber, navy, gold, muted });
      drawOfficialFrame(page, navy, gold);
      page.drawImage(logo, { x: 178, y: 267, width: 238, height: 238, opacity: 0.035 });
      return bodyTop;
    };

    const typeLabel = titleCase(letter.letterType);
    const statusDate = letter.issuedAt ?? letter.createdAt;
    const scopeText = unit
      ? `${unit.name} - ${unit.type.toLowerCase()}${unit.countryCode ? ` (${unit.countryCode})` : ""}`
      : workspace
        ? workspace.name
        : "Global LETW";
    const recipientDetails = [
      recipient?.memberProfile?.organizationPosition ? `Position: ${recipient.memberProfile.organizationPosition}` : null,
      recipient?.memberProfile?.membershipNumber ? `Member no: ${recipient.memberProfile.membershipNumber}` : null,
      recipient?.memberProfile?.phone ? `Phone: ${recipient.memberProfile.phone}` : null,
      [recipient?.memberProfile?.city, recipient?.memberProfile?.country].filter(Boolean).join(", ") || null
    ].filter(Boolean);

    page.drawText("OFFICIAL LETW LETTER", { x: marginX, y: 698, size: 10, font: fonts.bold, color: gold });
    drawFittedText(page, letter.title, marginX, 671, 310, fonts.serif, 24, navy);

    page.drawRectangle({ x: 388, y: 624, width: 153, height: 80, color: light, borderColor: gold, borderWidth: 0.7 });
    page.drawText("DATE", { x: 404, y: 682, size: 6.8, font: fonts.bold, color: blue });
    page.drawText(formatDate(statusDate), { x: 404, y: 664, size: 9, font: fonts.bold, color: navy });
    page.drawText("TYPE", { x: 404, y: 646, size: 6.8, font: fonts.bold, color: blue });
    drawFittedText(page, typeLabel, 404, 631, 118, fonts.bold, 8.3, navy);

    const recipientBoxY = 508;
    page.drawRectangle({ x: marginX, y: recipientBoxY, width: 230, height: 88, color: white, borderColor: rgb(0.84, 0.88, 0.94), borderWidth: 0.8 });
    page.drawRectangle({ x: marginX, y: recipientBoxY + 78, width: 230, height: 10, color: navy });
    page.drawText("RECIPIENT", { x: marginX + 14, y: recipientBoxY + 60, size: 7, font: fonts.bold, color: blue });
    drawFittedText(page, letter.recipientName, marginX + 14, recipientBoxY + 42, 197, fonts.bold, 11.5, navy);
    if (letter.recipientEmail) drawFittedText(page, letter.recipientEmail, marginX + 14, recipientBoxY + 26, 197, fonts.sans, 8, muted);
    recipientDetails.slice(0, 2).forEach((detail, index) => {
      page.drawText(String(detail), { x: marginX + 14, y: recipientBoxY + 12 - index * 10, size: 7.2, font: fonts.sans, color: muted });
    });

    page.drawRectangle({ x: 308, y: recipientBoxY, width: 233, height: 88, color: white, borderColor: rgb(0.84, 0.88, 0.94), borderWidth: 0.8 });
    page.drawRectangle({ x: 308, y: recipientBoxY + 78, width: 233, height: 10, color: navy });
    page.drawText("OFFICIAL RECORD", { x: 322, y: recipientBoxY + 60, size: 7, font: fonts.bold, color: blue });
    page.drawText(`Letter no: ${letter.letterNumber}`, { x: 322, y: recipientBoxY + 42, size: 8.2, font: fonts.bold, color: navy });
    drawFittedText(page, `Scope: ${scopeText}`, 322, recipientBoxY + 26, 190, fonts.sans, 7.8, muted);
    drawFittedText(page, `Issued by: ${issuer?.name ?? issuer?.email ?? "LETW Admin"}`, 322, recipientBoxY + 10, 190, fonts.sans, 7.8, muted);

    page.drawText("Subject:", { x: marginX, y: 474, size: 10.2, font: fonts.bold, color: navy });
    drawFittedText(page, letter.title, marginX + 52, 474, contentWidth - 52, fonts.bold, 10.2, ink);
    page.drawLine({ start: { x: marginX, y: 461 }, end: { x: pageSize[0] - marginX, y: 461 }, thickness: 0.6, color: gold });

    let y = 434;
    page.drawText(`Dear ${letter.recipientName},`, { x: marginX, y, size: 10.8, font: fonts.bold, color: ink });
    y -= 27;

    const bodyFontSize = 11.2;
    const bodyParagraphs = wrapParagraphsByWidth(letter.body, fonts.sans, bodyFontSize, contentWidth);
    for (const paragraph of bodyParagraphs) {
      const visibleLines = paragraph.filter(Boolean);
      if (!visibleLines.length) {
        y -= 9;
        continue;
      }

      for (let index = 0; index < visibleLines.length; index += 1) {
        if (y < bodyBottom + 38) y = addPage();
        const line = visibleLines[index];
        const isLastLine = index === visibleLines.length - 1;
        if (isLastLine) {
          page.drawText(line, { x: marginX, y, size: bodyFontSize, font: fonts.sans, color: ink });
        } else {
          drawJustifiedLine(page, line, marginX, y, contentWidth, fonts.sans, bodyFontSize, ink);
        }
        y -= 17.2;
      }
      y -= 7;
    }

    const closingLines = [
      "This letter is issued under the authority and administrative record of Light Encounter Tabernacle Worldwide.",
      "It should be accepted only while the letter status remains active in the LETW system."
    ];
    y -= 10;
    for (const line of closingLines) {
      if (y < bodyBottom + 38) y = addPage();
      page.drawText(line, { x: marginX, y, size: 9.8, font: fonts.sans, color: muted });
      y -= 14.5;
    }

    if (y < signatureBlockTop + 20) y = addPage();
    const footY = 216;
    page.drawText("Yours in kingdom service,", { x: marginX, y: footY, size: 10.5, font: fonts.sans, color: ink });
    page.drawText(letter.signatureName, { x: marginX, y: footY - 43, size: 23, font: fonts.script, color: navy });
    page.drawLine({ start: { x: marginX, y: footY - 50 }, end: { x: marginX + 205, y: footY - 50 }, thickness: 0.8, color: navy });
    page.drawText("Authorized Signature", { x: marginX + 18, y: footY - 67, size: 8.3, font: fonts.bold, color: muted });
    page.drawText("For: Light Encounter Tabernacle Worldwide", { x: marginX, y: footY - 84, size: 8.8, font: fonts.bold, color: navy });

    drawSeal({ page, logo, fonts, x: 300, y: 151, navy, gold, white });
    drawQrChip({
      page,
      qr,
      fonts,
      x: 371,
      y: 96,
      width: 170,
      height: 180,
      letterNumber: letter.letterNumber,
      navy,
      blue,
      gold,
      white
    });

    if (letter.status === "REVOKED") {
      page.drawRectangle({ x: 92, y: 366, width: 412, height: 82, color: white, opacity: 0.82 });
      drawCenteredText(page, "REVOKED", pageSize[0] / 2, 394, fonts.bold, 42, revoked);
    } else if (letter.status === "DRAFT") {
      page.drawRectangle({ x: 112, y: 371, width: 372, height: 70, color: white, opacity: 0.72 });
      drawCenteredText(page, "DRAFT - NOT YET ISSUED", pageSize[0] / 2, 396, fonts.bold, 25, muted);
    }

    const pdfBytes = await pdf.save();
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFileName(letter.letterNumber)}.pdf"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
