import { createHmac, timingSafeEqual } from "node:crypto";

import { SignJWT } from "jose";

export function isOnlyOfficeConfigured() {
  return Boolean(process.env.ONLYOFFICE_DOCUMENT_SERVER_URL && process.env.ONLYOFFICE_JWT_SECRET);
}

export function onlyOfficeServerUrl() {
  return process.env.ONLYOFFICE_DOCUMENT_SERVER_URL?.replace(/\/$/, "") ?? "";
}

function secretBytes() {
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  if (!secret) throw new Error("ONLYOFFICE_JWT_SECRET is not configured.");
  return new TextEncoder().encode(secret);
}

export async function signOnlyOfficeConfig(config: Record<string, unknown>) {
  return new SignJWT(config)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secretBytes());
}

export function onlyOfficeCallbackSignature(fileId: string) {
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  if (!secret) throw new Error("ONLYOFFICE_JWT_SECRET is not configured.");
  return createHmac("sha256", secret).update(fileId).digest("hex");
}

export function verifyOnlyOfficeCallbackSignature(fileId: string, signature: string) {
  const expected = Buffer.from(onlyOfficeCallbackSignature(fileId));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function onlyOfficeDocumentType(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["doc", "docx", "odt", "rtf", "txt"].includes(extension)) return "word";
  if (["xls", "xlsx", "ods", "csv"].includes(extension)) return "cell";
  if (["ppt", "pptx", "odp"].includes(extension)) return "slide";
  return null;
}
