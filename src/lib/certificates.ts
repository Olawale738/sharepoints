type CertificateLike = {
  status: string;
  revokedAt?: Date | string | null;
  expiresAt?: Date | string | null;
};

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export function normalizeCertificateExpiry(value?: string | Date | null) {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) return null;

  const isMidnightUtc =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;

  if (!isMidnightUtc) return date;

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

export function certificateIsLive(certificate: CertificateLike, now = new Date()) {
  const expiresAt = asDate(certificate.expiresAt);
  const revokedAt = asDate(certificate.revokedAt);
  return Boolean(certificate.status === "ACTIVE" && !revokedAt && (!expiresAt || expiresAt > now));
}

export function certificatePublicStatus(certificate: CertificateLike, now = new Date()) {
  const expiresAt = asDate(certificate.expiresAt);
  if (certificateIsLive(certificate, now)) return "VALID";
  if (asDate(certificate.revokedAt)) return "REVOKED";
  if (expiresAt && expiresAt <= now) return "EXPIRED";
  return certificate.status || "INACTIVE";
}

export function restoredCertificateData(certificate: CertificateLike, now = new Date()) {
  const expiresAt = asDate(certificate.expiresAt);
  return {
    status: "ACTIVE",
    revokedAt: null,
    expiresAt: expiresAt && expiresAt <= now ? null : expiresAt
  };
}
