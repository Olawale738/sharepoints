import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export const runtime = "nodejs";

function money(amountCents: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amountCents / 100);
}

function shortDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(value);
}

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    const url = new URL(request.url);
    const year = Number(url.searchParams.get("year") ?? new Date().getUTCFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new ApiError(422, "Invalid statement year.");
    }
    const isAdmin = await hasAnyWorkspaceAdminRole(actor.id);
    const targetUserId = url.searchParams.get("userId") ?? actor.id;
    if (!isAdmin && targetUserId !== actor.id) {
      throw new ApiError(403, "You cannot download another member's donor statement.");
    }
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, email: true, memberProfile: { select: { membershipNumber: true } } }
    });
    if (!targetUser) throw new ApiError(404, "Member not found.");

    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const receipts = await prisma.givingReceipt.findMany({
      where: {
        status: "ACTIVE",
        receivedAt: { gte: start, lt: end },
        OR: [
          { userId: targetUserId },
          ...(targetUser.email ? [{ donorEmail: targetUser.email.toLowerCase() }] : [])
        ]
      },
      orderBy: { receivedAt: "asc" }
    });
    const currency = receipts[0]?.currency ?? "GBP";
    const total = receipts.reduce((sum, receipt) => sum + receipt.amountCents, 0);

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const navy = rgb(0.043, 0.106, 0.239);
    const gold = rgb(0.831, 0.686, 0.216);
    const ink = rgb(0.071, 0.102, 0.157);
    const light = rgb(0.952, 0.973, 1);
    const sans = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const logoBytes = await readFile(path.join(process.cwd(), "public", "letw-logo.png"));
    const logo = await pdf.embedPng(logoBytes);

    page.drawRectangle({ x: 0, y: 735, width: 595, height: 107, color: navy });
    page.drawRectangle({ x: 0, y: 728, width: 595, height: 7, color: gold });
    page.drawImage(logo, { x: 42, y: 754, width: 62, height: 62 });
    page.drawText("LIGHT ENCOUNTER TABERNACLE WORLDWIDE", { x: 122, y: 789, size: 14, font: bold, color: rgb(1, 1, 1) });
    page.drawText("Annual donor statement", { x: 122, y: 768, size: 10, font: bold, color: gold });
    page.drawText(String(year), { x: 506, y: 785, size: 18, font: bold, color: gold });

    page.drawText(targetUser.name ?? targetUser.email ?? "LETW Member", { x: 48, y: 682, size: 24, font: bold, color: navy });
    page.drawText(`Member no: ${targetUser.memberProfile?.membershipNumber ?? "Pending"}`, { x: 50, y: 657, size: 10, font: bold, color: ink });
    page.drawRectangle({ x: 390, y: 636, width: 142, height: 58, color: light, borderColor: gold, borderWidth: 0.7 });
    page.drawText("TOTAL GIVING", { x: 408, y: 672, size: 8, font: bold, color: navy });
    page.drawText(money(total, currency), { x: 408, y: 650, size: 17, font: bold, color: navy });

    page.drawText("Date", { x: 50, y: 598, size: 8, font: bold, color: navy });
    page.drawText("Fund", { x: 135, y: 598, size: 8, font: bold, color: navy });
    page.drawText("Receipt", { x: 315, y: 598, size: 8, font: bold, color: navy });
    page.drawText("Amount", { x: 472, y: 598, size: 8, font: bold, color: navy });
    page.drawLine({ start: { x: 48, y: 589 }, end: { x: 532, y: 589 }, thickness: 0.8, color: gold });

    let y = 568;
    receipts.slice(0, 24).forEach((receipt) => {
      page.drawText(shortDate(receipt.receivedAt), { x: 50, y, size: 8.5, font: sans, color: ink });
      page.drawText(receipt.fund.slice(0, 28), { x: 135, y, size: 8.5, font: sans, color: ink });
      page.drawText(receipt.receiptNumber, { x: 315, y, size: 8.5, font: sans, color: ink });
      page.drawText(money(receipt.amountCents, receipt.currency), { x: 472, y, size: 8.5, font: bold, color: ink });
      y -= 18;
    });
    if (receipts.length > 24) {
      page.drawText(`${receipts.length - 24} additional receipt(s) are stored in LETW.`, { x: 50, y: y - 10, size: 9, font: sans, color: ink });
    }
    if (!receipts.length) {
      page.drawText("No active giving receipts were found for this year.", { x: 50, y: 568, size: 10, font: sans, color: ink });
    }

    page.drawText("This statement is generated from QR-verifiable LETW giving receipt records.", { x: 50, y: 84, size: 9, font: sans, color: ink });
    page.drawText("Light Encounter Tabernacle Worldwide | letw.org", { x: 50, y: 62, size: 9, font: bold, color: navy });

    const pdfBytes = await pdf.save();
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="LETW-donor-statement-${year}.pdf"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
