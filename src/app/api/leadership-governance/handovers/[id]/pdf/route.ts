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
  script: PDFFont;
};

const pageSize: [number, number] = [595, 842];
const marginX = 50;
const contentWidth = pageSize[0] - marginX * 2;

function listFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") return value ? [value] : [];
  return [];
}

function formatDate(value?: Date | null) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(value);
}

function wrapByWidth(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  const words = text.trim().split(/\s+/).filter(Boolean);
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
  handoverCode: string;
  status: string;
  navy: PdfColor;
  gold: PdfColor;
  white: PdfColor;
}) {
  const { page, logo, fonts, handoverCode, status, navy, gold, white } = input;
  page.drawRectangle({ x: 0, y: 735, width: pageSize[0], height: 107, color: navy });
  page.drawRectangle({ x: 0, y: 728, width: pageSize[0], height: 7, color: gold });
  page.drawImage(logo, { x: 42, y: 754, width: 62, height: 62 });
  page.drawText("LIGHT ENCOUNTER TABERNACLE WORLDWIDE", { x: 122, y: 791, size: 14, font: fonts.bold, color: white });
  page.drawText("Leadership Handover Dossier", { x: 122, y: 770, size: 10.5, font: fonts.bold, color: gold });
  page.drawText("Duties | Documents | Pending Matters | Acceptance Record", { x: 122, y: 754, size: 8.2, font: fonts.sans, color: white });
  page.drawRectangle({ x: 398, y: 768, width: 150, height: 45, color: white, opacity: 0.11, borderColor: gold, borderWidth: 0.7 });
  drawFittedText(page, handoverCode, 412, 794, 120, fonts.bold, 8.2, gold);
  drawFittedText(page, status.replaceAll("_", " "), 412, 777, 120, fonts.bold, 9.5, white);
}

function drawFooter(page: PDFPage, fonts: FontSet, pageNumber: number, navy: PdfColor, gold: PdfColor, muted: PdfColor) {
  page.drawLine({ start: { x: marginX, y: 66 }, end: { x: pageSize[0] - marginX, y: 66 }, thickness: 0.7, color: gold });
  page.drawText("LETW leadership transition record - confidential", { x: marginX, y: 47, size: 8, font: fonts.bold, color: navy });
  page.drawText("Do not include raw passwords. Use secure vault references only.", { x: marginX, y: 34, size: 7.2, font: fonts.sans, color: muted });
  page.drawText(`Page ${pageNumber}`, { x: pageSize[0] - 86, y: 47, size: 8, font: fonts.bold, color: navy });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const handover = await prisma.leadershipHandover.findUnique({ where: { id } });
    if (!handover) throw new ApiError(404, "Leadership handover not found.");
    await requireLeadershipGovernanceScopeAccess(user.id, {
      ...handover,
      participantIds: [handover.fromLeaderId, handover.toLeaderId]
    });

    const userIds = [handover.fromLeaderId, handover.toLeaderId, handover.createdById].filter(Boolean) as string[];
    const [workspace, unit, users] = await Promise.all([
      handover.workspaceId ? prisma.workspace.findUnique({ where: { id: handover.workspaceId }, select: { name: true } }) : null,
      handover.organizationUnitId ? prisma.organizationUnit.findUnique({ where: { id: handover.organizationUnitId }, select: { name: true, type: true, countryCode: true } }) : null,
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    ]);
    const names = new Map(users.map((row) => [row.id, row.name ?? row.email ?? "Unknown leader"]));
    const scope = unit ? `${unit.name} - ${unit.type.toLowerCase()}${unit.countryCode ? ` (${unit.countryCode})` : ""}` : workspace?.name ?? "Global LETW";
    const handoverCode = `LETW-HO-${handover.createdAt.getUTCFullYear()}-${handover.id.slice(-6).toUpperCase()}`;

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

    let pageNumber = 1;
    let page = pdf.addPage(pageSize);
    drawHeader({ page, logo, fonts, handoverCode, status: handover.status, navy, gold, white });
    drawFooter(page, fonts, pageNumber, navy, gold, muted);
    page.drawImage(logo, { x: 188, y: 294, width: 220, height: 220, opacity: 0.035 });
    let y = 690;

    const addPage = () => {
      pageNumber += 1;
      page = pdf.addPage(pageSize);
      drawHeader({ page, logo, fonts, handoverCode, status: handover.status, navy, gold, white });
      drawFooter(page, fonts, pageNumber, navy, gold, muted);
      page.drawImage(logo, { x: 188, y: 294, width: 220, height: 220, opacity: 0.035 });
      y = 690;
    };
    const ensureSpace = (height: number) => {
      if (y - height < 86) addPage();
    };
    const drawSection = (title: string, description?: string) => {
      ensureSpace(42);
      page.drawText(title, { x: marginX, y, size: 12.3, font: fonts.bold, color: navy });
      if (description) page.drawText(description, { x: marginX, y: y - 15, size: 8.2, font: fonts.sans, color: muted });
      page.drawLine({ start: { x: marginX, y: y - 23 }, end: { x: pageSize[0] - marginX, y: y - 23 }, thickness: 0.55, color: gold });
      y -= description ? 44 : 34;
    };
    const drawBullets = (items: string[], empty: string) => {
      const rows = items.length ? items : [empty];
      for (const item of rows) {
        for (const [index, line] of wrapByWidth(item, fonts.sans, 8.8, contentWidth - 18).entries()) {
          ensureSpace(17);
          page.drawText(index === 0 ? "-" : " ", { x: marginX, y, size: 9, font: fonts.bold, color: gold });
          page.drawText(line, { x: marginX + 14, y, size: 8.8, font: fonts.sans, color: ink });
          y -= 13.5;
        }
      }
      y -= 7;
    };

    page.drawText("FORMAL TRANSITION DOSSIER", { x: marginX, y, size: 9.5, font: fonts.bold, color: gold });
    drawFittedText(page, handover.title, marginX, y - 28, 335, fonts.serif, 22, navy);
    page.drawRectangle({ x: 396, y: y - 74, width: 151, height: 76, color: light, borderColor: gold, borderWidth: 0.7 });
    page.drawText("STATUS", { x: 411, y: y - 21, size: 7, font: fonts.bold, color: blue });
    drawFittedText(page, handover.status.replaceAll("_", " "), 411, y - 39, 114, fonts.bold, 10.3, navy);
    page.drawText("CREATED", { x: 411, y: y - 57, size: 7, font: fonts.bold, color: blue });
    page.drawText(formatDate(handover.createdAt), { x: 411, y: y - 70, size: 8.4, font: fonts.bold, color: navy });
    y -= 105;

    page.drawRectangle({ x: marginX, y: y - 98, width: contentWidth, height: 98, color: white, borderColor: rgb(0.78, 0.84, 0.92), borderWidth: 0.7 });
    page.drawRectangle({ x: marginX, y: y - 8, width: contentWidth, height: 8, color: navy });
    const meta = [
      ["Outgoing leader", names.get(handover.fromLeaderId) ?? "Unknown leader"],
      ["Incoming leader", handover.toLeaderId ? names.get(handover.toLeaderId) ?? "Unknown leader" : "Not assigned"],
      ["Scope", scope],
      ["Accepted", formatDate(handover.acceptedAt)],
      ["Completed", formatDate(handover.completedAt)],
      ["Prepared by", names.get(handover.createdById) ?? "LETW Admin"]
    ];
    meta.forEach(([label, value], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = marginX + 16 + col * 240;
      const rowY = y - 29 - row * 28;
      page.drawText(label.toUpperCase(), { x, y: rowY + 10, size: 6.5, font: fonts.bold, color: blue });
      drawFittedText(page, value, x, rowY - 2, 205, fonts.bold, 8.8, navy);
    });
    y -= 128;

    drawSection("Executive Purpose", "Why this transition exists and what leadership should know.");
    drawBullets([handover.reason ?? "No formal reason was entered."], "No formal reason was entered.");

    drawSection("Duties To Transfer", "Operational, pastoral, administrative, and leadership responsibilities.");
    drawBullets(listFrom(handover.duties), "No duties were listed.");

    drawSection("Documents And Records", "Files, folders, minutes, reports, and official records to hand over.");
    drawBullets(listFrom(handover.documents), "No documents were listed.");

    drawSection("Secure Asset References", "Password vault references only. Never write raw passwords in this document.");
    drawBullets(listFrom(handover.passwordAssets), "No secure asset references were listed.");

    drawSection("Pending Matters", "Open tasks, unresolved decisions, escalations, and next actions.");
    drawBullets(listFrom(handover.pendingTasks), "No pending matters were listed.");

    drawSection("Branch / Ministry Records", "Contacts, projects, issues, risks, pastoral notes summary, and operating context.");
    drawBullets(listFrom(handover.branchRecords), "No branch or ministry records were listed.");

    ensureSpace(118);
    page.drawRectangle({ x: marginX, y: y - 98, width: contentWidth, height: 98, color: light, borderColor: gold, borderWidth: 0.8 });
    page.drawText("Formal acceptance and sign-off", { x: marginX + 14, y: y - 18, size: 10, font: fonts.bold, color: navy });
    const signRows = [
      ["Outgoing leader", marginX + 14],
      ["Incoming leader", marginX + 181],
      ["LETW authority", marginX + 348]
    ];
    signRows.forEach(([label, x]) => {
      page.drawLine({ start: { x: Number(x), y: y - 58 }, end: { x: Number(x) + 132, y: y - 58 }, thickness: 0.7, color: navy });
      page.drawText(String(label), { x: Number(x) + 20, y: y - 73, size: 7.5, font: fonts.bold, color: muted });
      page.drawText("Date:", { x: Number(x), y: y - 88, size: 7.3, font: fonts.sans, color: muted });
    });
    page.drawImage(logo, { x: 274, y: y - 87, width: 44, height: 44, opacity: 0.85 });

    const pdfBytes = await pdf.save();
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${handoverCode}.pdf"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
