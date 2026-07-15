import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";

import { prisma } from "@/lib/prisma";

export type ViewerWatermark = {
  displayName: string;
  email: string;
  letwId: string;
  stampedAt: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeFileName(value: string) {
  return value.replace(/"/g, "").replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").trim() || "LETW-document";
}

function base64(buffer: Buffer) {
  return buffer.toString("base64");
}

export function isPdfDocument(fileName: string, contentType: string) {
  return contentType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
}

export function isImageDocument(contentType: string) {
  return contentType.startsWith("image/");
}

export function isTextDocument(fileName: string, contentType: string) {
  return (
    contentType.startsWith("text/") ||
    /\.(txt|csv|md|json|xml|log)$/i.test(fileName)
  );
}

export async function getViewerWatermark(userId: string): Promise<ViewerWatermark> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      memberProfile: {
        select: {
          membershipNumber: true
        }
      }
    }
  });

  return {
    displayName: user?.name || user?.email || "LETW member",
    email: user?.email || "unknown email",
    letwId: user?.memberProfile?.membershipNumber || user?.id || userId,
    stampedAt: new Date().toISOString()
  };
}

export function watermarkText(watermark: ViewerWatermark) {
  return `${watermark.displayName} - ${watermark.email} - LETW ID ${watermark.letwId} - ${watermark.stampedAt}`;
}

export function protectedWatermarkHeaders(watermark: ViewerWatermark) {
  return {
    "X-LETW-Watermarked": "true",
    "X-LETW-Viewer": watermarkText(watermark),
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "private, no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0"
  };
}

export async function createWatermarkedPdf(input: {
  buffer: Buffer;
  fileName: string;
  watermark: ViewerWatermark;
}) {
  const pdf = await PDFDocument.load(input.buffer, { ignoreEncryption: true });
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const mark = `LETW PROTECTED - ${input.watermark.displayName} - ${input.watermark.email}`;
  const footer = `LETW protected copy | LETW ID: ${input.watermark.letwId} | ${input.watermark.stampedAt}`;

  for (const page of pages) {
    const { width, height } = page.getSize();
    const markSize = Math.max(14, Math.min(24, width / 28));
    page.drawText(mark, {
      x: width * 0.08,
      y: height * 0.52,
      size: markSize,
      font,
      color: rgb(0.04, 0.1, 0.24),
      opacity: 0.14,
      rotate: degrees(-31)
    });
    page.drawText(footer, {
      x: 28,
      y: 20,
      size: 8,
      font: regularFont,
      color: rgb(0.04, 0.1, 0.24),
      opacity: 0.82
    });
  }

  return Buffer.from(await pdf.save());
}

export function watermarkedHtmlShell(input: {
  title: string;
  watermark: ViewerWatermark;
  body: string;
}) {
  const mark = escapeHtml(watermarkText(input.watermark));
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    body { margin: 0; background: #f8fafc; color: #0b1b3d; font-family: Arial, sans-serif; }
    .letw-banner { position: sticky; top: 0; z-index: 50; background: #0b1b3d; color: #fff; border-bottom: 3px solid #d4af37; padding: 10px 16px; text-align: center; font: 700 13px Arial, sans-serif; }
    .letw-page { position: relative; min-height: 100vh; padding: 28px; }
    .letw-watermark { position: fixed; inset: 0; pointer-events: none; z-index: 20; opacity: .13; display: grid; grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 28px; transform: rotate(-24deg); padding: 48px; color: #0b1b3d; font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .letw-watermark span { border: 1px solid rgba(11,27,61,.25); border-radius: 8px; padding: 14px; text-align: center; background: rgba(255,255,255,.35); }
    .letw-content { position: relative; z-index: 10; max-width: 1080px; margin: 0 auto; background: #fff; border: 1px solid rgba(11,27,61,.14); border-radius: 8px; box-shadow: 0 18px 48px rgba(11,27,61,.10); padding: 24px; }
    .letw-content img, .letw-content iframe, .letw-content object { display: block; max-width: 100%; margin: 0 auto; border: 0; }
    .letw-content iframe, .letw-content object { width: 100%; min-height: 78vh; }
    pre { white-space: pre-wrap; word-break: break-word; font: 13px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; }
    @media print {
      .letw-content, .letw-watermark { display: none !important; }
      body::before { content: "LETW protected preview - printing is disabled. Request president-approved access."; display: block; padding: 48px; color: #0b1b3d; font: 700 20px Arial, sans-serif; }
    }
  </style>
</head>
<body>
  <div class="letw-banner">LETW protected preview - ${mark}</div>
  <div class="letw-watermark">${Array.from({ length: 12 }, () => `<span>LETW CONFIDENTIAL<br />${mark}</span>`).join("")}</div>
  <main class="letw-page">
    <section class="letw-content">${input.body}</section>
  </main>
</body>
</html>`;
}

export function watermarkedImagePreview(input: {
  fileName: string;
  contentType: string;
  buffer: Buffer;
  watermark: ViewerWatermark;
}) {
  const src = `data:${input.contentType};base64,${base64(input.buffer)}`;
  return watermarkedHtmlShell({
    title: input.fileName,
    watermark: input.watermark,
    body: `<h1>${escapeHtml(input.fileName)}</h1><img alt="${escapeHtml(input.fileName)}" src="${src}" />`
  });
}

export function watermarkedTextPreview(input: {
  fileName: string;
  text: string;
  watermark: ViewerWatermark;
}) {
  return watermarkedHtmlShell({
    title: input.fileName,
    watermark: input.watermark,
    body: `<h1>${escapeHtml(input.fileName)}</h1><pre>${escapeHtml(input.text)}</pre>`
  });
}

export function watermarkedDownloadHeaders(input: {
  fileName: string;
  contentType: string;
  bodyLength: number;
  disposition: "inline" | "attachment";
  watermark: ViewerWatermark;
}) {
  return {
    "Content-Type": input.contentType || "application/octet-stream",
    "Content-Length": String(input.bodyLength),
    "Content-Disposition": `${input.disposition}; filename="${safeFileName(input.fileName)}"`,
    ...protectedWatermarkHeaders(input.watermark)
  };
}
