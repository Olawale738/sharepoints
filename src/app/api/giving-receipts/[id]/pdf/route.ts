import { readFile } from "fs/promises";
import path from "path";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export const runtime = "nodejs";

function money(amountCents: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amountCents / 100);
}

function dateText(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(value);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const receipt = await prisma.givingReceipt.findUnique({ where: { id } });
    if (!receipt) throw new ApiError(404, "Giving receipt not found.");
    const isAdmin = await hasAnyWorkspaceAdminRole(user.id);
    if (!isAdmin && receipt.userId !== user.id && receipt.issuedById !== user.id && receipt.donorEmail !== user.email?.toLowerCase()) {
      throw new ApiError(403, "You cannot download this giving receipt.");
    }

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const width = page.getWidth();
    const navy = rgb(0.043, 0.106, 0.239);
    const gold = rgb(0.831, 0.686, 0.216);
    const blue = rgb(0.039, 0.239, 0.514);
    const ink = rgb(0.071, 0.102, 0.157);
    const light = rgb(0.952, 0.973, 1);
    const sans = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const logoBytes = await readFile(path.join(process.cwd(), "public", "letw-logo.png"));
    const logo = await pdf.embedPng(logoBytes);
    const origin = new URL(request.url).origin;
    const verifyUrl = `${origin}/verify/giving/${receipt.qrToken}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 320,
      margin: 1,
      color: { dark: "#0B1B3D", light: "#FFFFFF" },
      errorCorrectionLevel: "H"
    });
    const qr = await pdf.embedPng(Buffer.from(qrDataUrl.split(",")[1] ?? "", "base64"));

    page.drawRectangle({ x: 0, y: 0, width, height: 842, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: 0, y: 735, width, height: 107, color: navy });
    page.drawRectangle({ x: 0, y: 728, width, height: 7, color: gold });
    page.drawImage(logo, { x: 42, y: 754, width: 62, height: 62 });
    page.drawText("LIGHT ENCOUNTER TABERNACLE WORLDWIDE", { x: 122, y: 789, size: 14, font: bold, color: rgb(1, 1, 1) });
    page.drawText("Official QR-verifiable giving receipt", { x: 122, y: 768, size: 10, font: bold, color: gold });
    page.drawText(receipt.status === "ACTIVE" ? "ACTIVE" : receipt.status, { x: 470, y: 785, size: 12, font: bold, color: gold });

    page.drawText("Giving Receipt", { x: 48, y: 682, size: 30, font: bold, color: navy });
    page.drawText(receipt.receiptNumber, { x: 50, y: 654, size: 11, font: bold, color: blue });
    page.drawRectangle({ x: 48, y: 505, width: 308, height: 116, color: light, borderColor: gold, borderWidth: 0.8 });
    const rows = [
      ["Donor", receipt.donorName],
      ["Amount", money(receipt.amountCents, receipt.currency)],
      ["Fund", receipt.fund],
      ["Received", dateText(receipt.receivedAt)],
      ["Method", receipt.paymentMethod ?? "Not specified"]
    ];
    rows.forEach(([label, value], index) => {
      const y = 590 - index * 20;
      page.drawText(label.toUpperCase(), { x: 66, y, size: 7, font: bold, color: blue });
      page.drawText(value.slice(0, 44), { x: 154, y, size: 10, font: bold, color: ink });
    });

    page.drawRectangle({ x: 385, y: 500, width: 150, height: 150, color: rgb(1, 1, 1), borderColor: gold, borderWidth: 1.1 });
    page.drawImage(qr, { x: 399, y: 514, width: 122, height: 122 });
    page.drawText("SCAN TO VERIFY", { x: 407, y: 484, size: 10, font: bold, color: navy });
    page.drawText("letw.org", { x: 438, y: 466, size: 8, font: bold, color: blue });

    page.drawText("This receipt is valid only when the QR verification page displays an ACTIVE status.", {
      x: 50,
      y: 424,
      size: 10,
      font: sans,
      color: ink
    });
    page.drawText("Annual donor statements can be produced from the LETW giving records for authorized members.", {
      x: 50,
      y: 405,
      size: 10,
      font: sans,
      color: ink
    });
    if (receipt.notes) {
      page.drawText(`Notes: ${receipt.notes.slice(0, 120)}`, { x: 50, y: 368, size: 9, font: sans, color: ink });
    }
    page.drawLine({ start: { x: 50, y: 147 }, end: { x: 242, y: 147 }, thickness: 0.8, color: navy });
    page.drawText("Authorized LETW finance/administration", { x: 50, y: 130, size: 8, font: bold, color: ink });
    page.drawText("Light Encounter Tabernacle Worldwide | letw.org", { x: 50, y: 62, size: 9, font: bold, color: navy });

    if (receipt.status !== "ACTIVE") {
      page.drawRectangle({ x: 118, y: 310, width: 360, height: 72, color: rgb(1, 1, 1), opacity: 0.78 });
      page.drawText("NOT VALID", { x: 195, y: 333, size: 38, font: bold, color: rgb(0.65, 0.28, 0.2) });
    }

    const pdfBytes = await pdf.save();
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${receipt.receiptNumber}.pdf"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
