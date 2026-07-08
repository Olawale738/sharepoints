import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { requireLeadershipGovernanceScopeAccess } from "@/lib/leadership-governance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function drawLines(page: import("pdf-lib").PDFPage, text: string, x: number, y: number, size: number, font: import("pdf-lib").PDFFont, color: ReturnType<typeof rgb>, max = 86) {
  const words = text.split(/\s+/);
  let line = "";
  let currentY = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      page.drawText(line, { x, y: currentY, size, font, color });
      currentY -= size + 5;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) page.drawText(line, { x, y: currentY, size, font, color });
  return currentY - size - 5;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const report = await prisma.monthlyMinistryReport.findUnique({ where: { id } });
    if (!report) throw new ApiError(404, "Monthly report not found.");
    await requireLeadershipGovernanceScopeAccess(user.id, report);

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const navy = rgb(0.043, 0.106, 0.239);
    const gold = rgb(0.831, 0.686, 0.216);
    const ink = rgb(0.071, 0.102, 0.157);
    const light = rgb(0.952, 0.973, 1);
    const sans = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const logo = await pdf.embedPng(await readFile(path.join(process.cwd(), "public", "letw-logo.png")));

    page.drawRectangle({ x: 0, y: 735, width: 595, height: 107, color: navy });
    page.drawRectangle({ x: 0, y: 728, width: 595, height: 7, color: gold });
    page.drawImage(logo, { x: 42, y: 754, width: 62, height: 62 });
    page.drawText("LIGHT ENCOUNTER TABERNACLE WORLDWIDE", { x: 122, y: 789, size: 14, font: bold, color: rgb(1, 1, 1) });
    page.drawText("Monthly leadership report pack", { x: 122, y: 768, size: 10, font: bold, color: gold });
    page.drawText(`${report.year}-${String(report.month).padStart(2, "0")}`, { x: 450, y: 785, size: 16, font: bold, color: gold });

    page.drawText(report.title, { x: 48, y: 680, size: 20, font: bold, color: navy });
    let y = drawLines(page, report.summary, 50, 644, 10, sans, ink, 88);
    const metrics = report.metrics && typeof report.metrics === "object" ? (report.metrics as Record<string, unknown>) : {};
    page.drawRectangle({ x: 48, y: y - 150, width: 500, height: 130, color: light, borderColor: gold, borderWidth: 0.7 });
    page.drawText("Key metrics", { x: 66, y: y - 42, size: 12, font: bold, color: navy });
    let rowY = y - 65;
    Object.entries(metrics).slice(0, 12).forEach(([key, value], index) => {
      const x = index % 2 === 0 ? 66 : 300;
      if (index % 2 === 0 && index > 0) rowY -= 18;
      page.drawText(`${key.replace(/([A-Z])/g, " $1").toLowerCase()}: ${String(value)}`, { x, y: rowY, size: 8.5, font: sans, color: ink });
    });
    page.drawText("Generated from LETW SharePoint authorized branch, ministry, attendance, giving, document, and follow-up records.", { x: 50, y: 70, size: 8.5, font: sans, color: ink });
    const pdfBytes = await pdf.save();
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="LETW-monthly-report-${report.year}-${report.month}.pdf"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
