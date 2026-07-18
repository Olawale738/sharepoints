import type { PDFDocument, PDFImage } from "pdf-lib";

import { detectedImageType } from "@/lib/profile-photo";

const MAX_PDF_IMAGE_BYTES = 8 * 1024 * 1024;

async function normalizeImageForPdf(body: Buffer) {
  const sharp = (await import("sharp")).default;
  return sharp(body, { failOn: "none" })
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}

export async function embedImageForPdf(pdf: PDFDocument, body: Buffer): Promise<PDFImage | null> {
  if (!body.length || body.length > MAX_PDF_IMAGE_BYTES) return null;

  const type = detectedImageType(body);
  try {
    if (type === "image/png") return await pdf.embedPng(body);
    if (type === "image/jpeg") return await pdf.embedJpg(body);
  } catch {
    // Fall through to normalization. Some uploaded JPEGs render in browsers but are rejected by pdf-lib.
  }

  try {
    const pngBody = await normalizeImageForPdf(body);
    return await pdf.embedPng(pngBody);
  } catch {
    return null;
  }
}
