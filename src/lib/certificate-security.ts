import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";

export { MARRIAGE_CERTIFICATE_TYPES, THEOLOGY_CERTIFICATE_TYPES } from "@/lib/certificate-presets";

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
  certificateCategory?: string | null;
  certificatePreset?: string | null;
  templateStyle?: string | null;
  templateAccent?: string | null;
  sealStyle?: string | null;
  signatureLayout?: string | null;
  watermarkStrength?: string | null;
  presidentSignatureUrl?: string | null;
  secondSignatoryName?: string | null;
  secondSignatoryTitle?: string | null;
  secondSignatorySignatureUrl?: string | null;
  spouseOneName?: string | null;
  spouseTwoName?: string | null;
  marriageDate?: Date | string | null;
  replacementOfId?: string | null;
  issuedAt?: Date | string | null;
};

export function certificatePrefix(category?: string | null) {
  if (category === "EDUCATION") return "LETW-THEO";
  if (category === "MARRIAGE") return "LETW-MARR";
  return "LETW-CERT";
}

export function generateCertificateNumber(category?: string | null) {
  return `${certificatePrefix(category)}-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function generateSealNumber(category?: string | null) {
  const prefix = category === "EDUCATION" ? "LETW-ACA-SEAL" : category === "MARRIAGE" ? "LETW-MARR-SEAL" : "LETW-SEAL";
  return `${prefix}-${new Date().getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`;
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
    certificateCategory: certificate.certificateCategory ?? null,
    certificatePreset: certificate.certificatePreset ?? null,
    educationLevel: certificate.educationLevel ?? null,
    programName: certificate.programName ?? null,
    fieldOfStudy: certificate.fieldOfStudy ?? null,
    templateStyle: certificate.templateStyle ?? null,
    templateAccent: certificate.templateAccent ?? null,
    sealStyle: certificate.sealStyle ?? null,
    signatureLayout: certificate.signatureLayout ?? null,
    watermarkStrength: certificate.watermarkStrength ?? null,
    presidentSignatureUrl: certificate.presidentSignatureUrl ?? null,
    secondSignatoryName: certificate.secondSignatoryName ?? null,
    secondSignatoryTitle: certificate.secondSignatoryTitle ?? null,
    secondSignatorySignatureUrl: certificate.secondSignatorySignatureUrl ?? null,
    spouseOneName: certificate.spouseOneName ?? null,
    spouseTwoName: certificate.spouseTwoName ?? null,
    marriageDate: certificate.marriageDate ? new Date(certificate.marriageDate).toISOString() : null,
    replacementOfId: certificate.replacementOfId ?? null,
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
