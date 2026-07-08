import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { requireLeadershipGovernanceScopeAccess } from "@/lib/leadership-governance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function drawParagraph(page: import("pdf-lib").PDFPage, text: string, x: number, y: number, widthChars: number, font: import("pdf-lib").PDFFont, size: number, color: ReturnType<typeof rgb>) {
  let currentY = y;
  for (const paragraph of text.split(/\n+/)) {
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > widthChars && line) {
        page.drawText(line, { x, y: currentY, size, font, color });
        currentY -= size + 6;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) {
      page.drawText(line, { x, y: currentY, size, font, color });
      currentY -= size + 10;
    }
  }
  return currentY;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const letter = await prisma.officialLetter.findUnique({ where: { id } });
    if (!letter) throw new ApiError(404, "Official letter not found.");
    await requireLeadershipGovernanceScopeAccess(user.id, {
      ...letter,
      participantIds: [letter.recipientUserId]
    });

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const navy = rgb(0.043, 0.106, 0.239);
    const gold = rgb(0.831, 0.686, 0.216);
    const ink = rgb(0.071, 0.102, 0.157);
    const muted = rgb(0.38, 0.42, 0.48);
    const sans = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
    const logo = await pdf.embedPng(await readFile(path.join(process.cwd(), "public", "letw-logo.png")));

    page.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: navy });
    page.drawRectangle({ x: 0, y: 735, width: 595, height: 7, color: gold });
    page.drawImage(logo, { x: 44, y: 758, width: 58, height: 58 });
    page.drawText("LIGHT ENCOUNTER TABERNACLE WORLDWIDE", { x: 120, y: 792, size: 14, font: bold, color: rgb(1, 1, 1) });
    page.drawText("Official letter | letw.org", { x: 120, y: 772, size: 9, font: bold, color: gold });
    page.drawText(letter.letterNumber, { x: 412, y: 792, size: 9, font: bold, color: gold });

    page.drawText(letter.title, { x: 50, y: 690, size: 21, font: bold, color: navy });
    page.drawText(`To: ${letter.recipientName}`, { x: 50, y: 662, size: 10, font: bold, color: ink });
    if (letter.recipientEmail) page.drawText(letter.recipientEmail, { x: 50, y: 646, size: 9, font: sans, color: muted });
    page.drawText(`Type: ${letter.letterType.toLowerCase().replaceAll("_", " ")}`, { x: 390, y: 662, size: 9, font: bold, color: navy });
    page.drawText(`Status: ${letter.status}`, { x: 390, y: 646, size: 9, font: bold, color: letter.status === "ISSUED" ? navy : muted });

    const y = drawParagraph(page, letter.body, 58, 600, 86, sans, 11, ink);
    page.drawText(letter.signatureName, { x: 70, y: Math.max(132, y - 40), size: 21, font: script, color: navy });
    page.drawLine({ start: { x: 58, y: Math.max(126, y - 46) }, end: { x: 252, y: Math.max(126, y - 46) }, thickness: 0.8, color: navy });
    page.drawText("Authorized signature", { x: 78, y: Math.max(108, y - 64), size: 8, font: bold, color: muted });
    page.drawText("Light Encounter Tabernacle Worldwide", { x: 50, y: 62, size: 9, font: bold, color: navy });

    if (letter.status === "REVOKED") {
      page.drawRectangle({ x: 125, y: 350, width: 345, height: 70, color: rgb(1, 1, 1), opacity: 0.75 });
      page.drawText("REVOKED", { x: 198, y: 374, size: 38, font: bold, color: rgb(0.65, 0.28, 0.2) });
    }

    const pdfBytes = await pdf.save();
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${letter.letterNumber}.pdf"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
