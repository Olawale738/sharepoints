import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";

type SignableCertificate = {
  id: string;
  title: string;
  certificateNumber?: string | null;
  sealNumber?: string | null;
  verifyToken: string;
  recipientName?: string | null;
  recipientEmail?: string | null;
  userId?: string | null;
  educationLevel?: string | null;
  programName?: string | null;
  fieldOfStudy?: string | null;
  issuedAt?: Date | string | null;
};

export const THEOLOGY_CERTIFICATE_TYPES = [
  "Certificate in Theology",
  "Diploma in Theology",
  "Advanced Diploma in Theology",
  "Bachelor of Science in Theology",
  "Master of Science in Theology",
  "Doctor of Philosophy in Theology"
] as const;

export function certificatePrefix(category?: string | null) {
  return category === "EDUCATION" ? "LETW-THEO" : "LETW-CERT";
}

export function generateCertificateNumber(category?: string | null) {
  return `${certificatePrefix(category)}-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function generateSealNumber(category?: string | null) {
  return `${category === "EDUCATION" ? "LETW-ACA-SEAL" : "LETW-SEAL"}-${new Date().getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

export function certificateSignaturePayload(certificate: SignableCertificate) {
  return JSON.stringify({
    id: certificate.id,
    title: certificate.title,
    certificateNumber: certificate.certificateNumber ?? null,
    sealNumber: certificate.sealNumber ?? null,
    verifyToken: certificate.verifyToken,
    recipientName: certificate.recipientName ?? null,
    recipientEmail: certificate.recipientEmail ?? null,
    userId: certificate.userId ?? null,
    educationLevel: certificate.educationLevel ?? null,
    programName: certificate.programName ?? null,
    fieldOfStudy: certificate.fieldOfStudy ?? null,
    issuedAt: certificate.issuedAt ? new Date(certificate.issuedAt).toISOString() : null
  });
}

function signingSecret() {
  return process.env.CERTIFICATE_SIGNING_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "letw-local-certificate-signing-secret";
}

export function signCertificate(certificate: SignableCertificate) {
  const payload = certificateSignaturePayload(certificate);
  return createHmac("sha256", signingSecret()).update(payload).digest("hex");
}

export function certificateCredentialHash(certificate: SignableCertificate) {
  return createHash("sha256").update(certificateSignaturePayload(certificate)).digest("hex");
}

export function shortHash(value?: string | null, length = 18) {
  return (value || "").slice(0, length).toUpperCase();
}
