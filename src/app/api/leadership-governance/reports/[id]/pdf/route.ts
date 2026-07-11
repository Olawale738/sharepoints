import { readFile } from "fs/promises";
import path from "path";
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
};

const pageSize: [number, number] = [595, 842];
const marginX = 48;
const contentWidth = pageSize[0] - marginX * 2;

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function listFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") return value ? [value] : [];
  return [];
}

function humanize(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: Date | null) {
  if (!value) return "Not finalized";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(value);
}

function formatMetric(key: string, value: unknown) {
  if (key.toLowerCase().includes("amountcents") && typeof value === "number") {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value / 100);
  }
  if (key.toLowerCase().includes("rate") && typeof value === "number") return `${value}%`;
  if (typeof value === "number") return new Intl.NumberFormat("en-GB").format(value);
  return String(value ?? "0");
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
      line = word;
    }
    if (line) lines.push(line);
    lines.push("");
  }
  while (lines.at(-1) === "") lines.pop();
  return lines;
}

function drawFittedText(page: PDFPage, text: string, x: number, y: number, maxWidth: number, font: PDFFont, size: number, color: PdfColor) {
  let nextSize = size;
  while (nextSize > 6 && font.widthOfTextAtSize(text, nextSize) > maxWidth) nextSize -= 0.5;
  page.drawText(text, { x, y, size: nextSize, font, color });
}

function drawHeader(input: {
  page: PDFPage;
  logo: PDFImage;
  fonts: FontSet;
  reportCode: string;
  period: string;
  navy: PdfColor;
  gold: PdfColor;
  white: PdfColor;
}) {
  const { page, logo, fonts, reportCode, period, navy, gold, white } = input;
  page.drawRectangle({ x: 0, y: 735, width: pageSize[0], height: 107, color: navy });
  page.drawRectangle({ x: 0, y: 728, width: pageSize[0], height: 7, color: gold });
  page.drawImage(logo, { x: 42, y: 754, width: 62, height: 62 });
  page.drawText("LIGHT ENCOUNTER TABERNACLE WORLDWIDE", { x: 122, y: 791, size: 14, font: fonts.bold, color: white });
  page.drawText("Executive Ministry Performance Report", { x: 122, y: 770, size: 10.2, font: fonts.bold, color: gold });
  page.drawText("Governance | Operations | Ministry Impact | Risk Review", { x: 122, y: 754, size: 8.3, font: fonts.sans, color: white });
  page.drawRectangle({ x: 401, y: 768, width: 146, height: 45, color: white, opacity: 0.11, borderColor: gold, borderWidth: 0.7 });
  drawFittedText(page, reportCode, 414, 794, 120, fonts.bold, 8, gold);
  drawFittedText(page, period, 414, 777, 120, fonts.bold, 10.5, white);
}

function drawFooter(page: PDFPage, fonts: FontSet, pageNumber: number, navy: PdfColor, gold: PdfColor, muted: PdfColor) {
  page.drawLine({ start: { x: marginX, y: 66 }, end: { x: pageSize[0] - marginX, y: 66 }, thickness: 0.7, color: gold });
  page.drawText("LETW Executive Report - confidential to authorized leadership", { x: marginX, y: 47, size: 8, font: fonts.bold, color: navy });
  page.drawText("Generated from permission-controlled LETW SharePoint records.", { x: marginX, y: 34, size: 7.2, font: fonts.sans, color: muted });
  page.drawText(`Page ${pageNumber}`, { x: pageSize[0] - 86, y: 47, size: 8, font: fonts.bold, color: navy });
}

function drawMetricCard(input: {
  page: PDFPage;
  fonts: FontSet;
  x: number;
  y: number;
  width: number;
  label: string;
  value: string;
  navy: PdfColor;
  blue: PdfColor;
  gold: PdfColor;
  light: PdfColor;
}) {
  const { page, fonts, x, y, width, label, value, navy, blue, gold, light } = input;
  page.drawRectangle({ x, y, width, height: 56, color: light, borderColor: rgb(0.78, 0.84, 0.92), borderWidth: 0.6 });
  page.drawRectangle({ x, y: y + 52, width, height: 4, color: gold });
  drawFittedText(page, value, x + 10, y + 27, width - 20, fonts.bold, 15, navy);
  drawFittedText(page, label, x + 10, y + 12, width - 20, fonts.sans, 7.5, blue);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const report = await prisma.monthlyMinistryReport.findUnique({ where: { id } });
    if (!report) throw new ApiError(404, "Monthly report not found.");
    await requireLeadershipGovernanceScopeAccess(user.id, report);

    const [workspace, unit, generator] = await Promise.all([
      report.workspaceId ? prisma.workspace.findUnique({ where: { id: report.workspaceId }, select: { name: true } }) : null,
      report.organizationUnitId ? prisma.organizationUnit.findUnique({ where: { id: report.organizationUnitId }, select: { name: true, type: true, countryCode: true } }) : null,
      prisma.user.findUnique({ where: { id: report.generatedById }, select: { name: true, email: true } })
    ]);

    const pdf = await PDFDocument.create();
    const fonts: FontSet = {
      sans: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      serif: await pdf.embedFont(StandardFonts.TimesRomanBold)
    };
    const logo = await pdf.embedPng(await readFile(path.join(process.cwd(), "public", "letw-logo.png")));
    const navy = rgb(0.043, 0.106, 0.239);
    const blue = rgb(0.039, 0.239, 0.514);
    const gold = rgb(0.831, 0.686, 0.216);
    const ink = rgb(0.071, 0.102, 0.157);
    const muted = rgb(0.38, 0.42, 0.48);
    const light = rgb(0.94, 0.973, 1);
    const white = rgb(1, 1, 1);
    const source = recordFrom(report.sourceSnapshot);
    const executive = recordFrom(source.executive);
    const metrics = recordFrom(report.metrics);
    const risks = listFrom(report.risks);
    const operatingHighlights = listFrom(source.operatingHighlights);
    const recommendations = listFrom(source.recommendations);
    const riskRegister = Array.isArray(source.riskRegister) ? source.riskRegister.map(recordFrom) : [];
    const assurance = listFrom(source.assurance);
    const period = String(executive.periodLabel ?? `${report.year}-${String(report.month).padStart(2, "0")}`);
    const scope = String(
      executive.scopeLabel ??
        (unit ? `${unit.name} - ${unit.type.toLowerCase()}${unit.countryCode ? ` (${unit.countryCode})` : ""}` : workspace?.name ?? "LETW organization")
    );
    const reportCode = `LETW-RPT-${report.year}-${String(report.month).padStart(2, "0")}-${report.id.slice(-6).toUpperCase()}`;

    let pageNumber = 1;
    let page = pdf.addPage(pageSize);
    drawHeader({ page, logo, fonts, reportCode, period, navy, gold, white });
    drawFooter(page, fonts, pageNumber, navy, gold, muted);
    page.drawImage(logo, { x: 190, y: 296, width: 216, height: 216, opacity: 0.035 });
    let y = 690;

    const addPage = () => {
      pageNumber += 1;
      page = pdf.addPage(pageSize);
      drawHeader({ page, logo, fonts, reportCode, period, navy, gold, white });
      drawFooter(page, fonts, pageNumber, navy, gold, muted);
      page.drawImage(logo, { x: 190, y: 296, width: 216, height: 216, opacity: 0.035 });
      y = 690;
    };
    const ensureSpace = (height: number) => {
      if (y - height < 86) addPage();
    };
    const drawSectionTitle = (title: string, subtitle?: string) => {
      ensureSpace(42);
      page.drawText(title, { x: marginX, y, size: 12.5, font: fonts.bold, color: navy });
      if (subtitle) page.drawText(subtitle, { x: marginX, y: y - 15, size: 8.2, font: fonts.sans, color: muted });
      page.drawLine({ start: { x: marginX, y: y - 23 }, end: { x: pageSize[0] - marginX, y: y - 23 }, thickness: 0.5, color: gold });
      y -= subtitle ? 44 : 34;
    };
    const drawParagraph = (text: string, size = 9.2, color = ink) => {
      for (const line of wrapByWidth(text, fonts.sans, size, contentWidth)) {
        ensureSpace(18);
        if (!line) {
          y -= 8;
          continue;
        }
        page.drawText(line, { x: marginX, y, size, font: fonts.sans, color });
        y -= size + 4.5;
      }
    };
    const drawBullets = (items: string[], empty: string) => {
      const rows = items.length ? items : [empty];
      for (const item of rows) {
        for (const [index, line] of wrapByWidth(item, fonts.sans, 8.8, contentWidth - 16).entries()) {
          ensureSpace(17);
          page.drawText(index === 0 ? "-" : " ", { x: marginX, y, size: 9, font: fonts.bold, color: gold });
          page.drawText(line, { x: marginX + 14, y, size: 8.8, font: fonts.sans, color: ink });
          y -= 13.5;
        }
      }
      y -= 6;
    };

    page.drawText("EXECUTIVE REPORT PACK", { x: marginX, y, size: 9.5, font: fonts.bold, color: gold });
    drawFittedText(page, report.title, marginX, y - 28, 338, fonts.serif, 22, navy);
    page.drawRectangle({ x: 402, y: y - 72, width: 145, height: 74, color: light, borderColor: gold, borderWidth: 0.7 });
    page.drawText("STATUS", { x: 417, y: y - 22, size: 7, font: fonts.bold, color: blue });
    page.drawText(report.status, { x: 417, y: y - 40, size: 11, font: fonts.bold, color: navy });
    page.drawText("PREPARED BY", { x: 417, y: y - 57, size: 7, font: fonts.bold, color: blue });
    drawFittedText(page, generator?.name ?? generator?.email ?? "LETW Admin", 417, y - 68, 112, fonts.bold, 7.4, navy);
    y -= 102;

    page.drawRectangle({ x: marginX, y: y - 84, width: contentWidth, height: 84, color: white, borderColor: rgb(0.78, 0.84, 0.92), borderWidth: 0.7 });
    page.drawRectangle({ x: marginX, y: y - 8, width: contentWidth, height: 8, color: navy });
    const meta = [
      ["Scope", scope],
      ["Period", period],
      ["Generated", formatDate(report.createdAt)],
      ["Finalized", report.finalizedAt ? formatDate(report.finalizedAt) : "Not finalized"]
    ];
    meta.forEach(([label, value], index) => {
      const x = marginX + 18 + (index % 2) * 238;
      const rowY = y - 31 - Math.floor(index / 2) * 31;
      page.drawText(label.toUpperCase(), { x, y: rowY + 11, size: 6.7, font: fonts.bold, color: blue });
      drawFittedText(page, value, x, rowY - 1, 200, fonts.bold, 9.4, navy);
    });
    y -= 114;

    drawSectionTitle("Executive Summary", "Board-style overview of impact, performance, and leadership attention.");
    drawParagraph(report.summary, 9.6);
    if (executive.conclusion) drawParagraph(`Management conclusion: ${String(executive.conclusion)}`, 9, muted);

    drawSectionTitle("Performance Dashboard", "High-level ministry, people, governance, and operating indicators.");
    const preferredMetrics = [
      "events",
      "services",
      "attendance",
      "soulsWon",
      "baptisms",
      "followUpsCompleted",
      "followUpCompletionRate",
      "givingReceipts",
      "givingAmountCents",
      "activeProjects",
      "overdueProjects",
      "documentsAdded",
      "decisions"
    ];
    const metricEntries = preferredMetrics
      .filter((key) => Object.prototype.hasOwnProperty.call(metrics, key))
      .map((key) => [key, metrics[key]] as const)
      .slice(0, 12);
    metricEntries.forEach(([key, value], index) => {
      if (index % 3 === 0) ensureSpace(64);
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = marginX + col * 166;
      const cardY = y - row * 68;
      drawMetricCard({ page, fonts, x, y: cardY - 56, width: 152, label: humanize(key), value: formatMetric(key, value), navy, blue, gold, light });
    });
    y -= Math.ceil(metricEntries.length / 3) * 68 + 8;

    drawSectionTitle("Operating Highlights", "What happened this month and what it means for leadership.");
    drawBullets(operatingHighlights, "No operating highlights were stored for this report.");

    drawSectionTitle("Risk Register", "Items that require governance attention, owner assignment, or follow-up.");
    if (riskRegister.length) {
      for (const row of riskRegister) {
        ensureSpace(54);
        page.drawRectangle({ x: marginX, y: y - 42, width: contentWidth, height: 42, color: rgb(1, 0.985, 0.94), borderColor: gold, borderWidth: 0.5 });
        drawFittedText(page, `${String(row.severity ?? "Medium")} risk`, marginX + 12, y - 16, 96, fonts.bold, 8.3, navy);
        drawFittedText(page, String(row.risk ?? ""), marginX + 118, y - 16, 330, fonts.bold, 8.4, ink);
        drawFittedText(page, String(row.action ?? "Review in leadership meeting."), marginX + 118, y - 31, 350, fonts.sans, 7.5, muted);
        y -= 52;
      }
    } else {
      drawBullets(risks, "No critical risks were detected from available LETW records.");
    }

    drawSectionTitle("Recommendations", "Suggested management actions for the next review cycle.");
    drawBullets(recommendations, "Continue monitoring attendance, follow-up, projects, documents, and governance decisions.");

    drawSectionTitle("Source Assurance", "How the report was compiled.");
    drawBullets(
      assurance.length ? assurance : ["Generated from LETW SharePoint authorized records.", "Figures reflect the records available at report generation time."],
      "No source assurance notes were recorded."
    );

    ensureSpace(76);
    page.drawRectangle({ x: marginX, y: y - 58, width: contentWidth, height: 58, color: light, borderColor: rgb(0.78, 0.84, 0.92), borderWidth: 0.7 });
    page.drawText("Leadership sign-off", { x: marginX + 14, y: y - 18, size: 9.5, font: fonts.bold, color: navy });
    page.drawLine({ start: { x: marginX + 136, y: y - 34 }, end: { x: marginX + 298, y: y - 34 }, thickness: 0.6, color: navy });
    page.drawText("Reviewed by", { x: marginX + 181, y: y - 48, size: 7, font: fonts.sans, color: muted });
    page.drawLine({ start: { x: marginX + 324, y: y - 34 }, end: { x: marginX + 474, y: y - 34 }, thickness: 0.6, color: navy });
    page.drawText("Date", { x: marginX + 388, y: y - 48, size: 7, font: fonts.sans, color: muted });

    const pdfBytes = await pdf.save();
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="LETW-executive-report-${report.year}-${String(report.month).padStart(2, "0")}.pdf"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
