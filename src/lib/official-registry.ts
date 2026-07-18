import { prisma } from "@/lib/prisma";

export type OfficialSealKind =
  | "LETTER"
  | "CERTIFICATE"
  | "GIVING_RECEIPT"
  | "DIGITAL_ID"
  | "STUDENT_ID"
  | "MONTHLY_REPORT"
  | "HANDOVER"
  | "PASTOR_TRANSFER"
  | "OFFICIAL_CIRCULAR"
  | "DIGITAL_SIGNATURE"
  | "UNKNOWN";

export type OfficialSealResult = {
  found: boolean;
  kind: OfficialSealKind;
  recordId?: string | null;
  title: string;
  sealNumber?: string | null;
  status?: string | null;
  active: boolean;
  ownerName?: string | null;
  scope?: string | null;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  verificationUrl?: string | null;
  message: string;
  warning?: string | null;
};

function originFrom(input?: string | null) {
  return (input || process.env.AUTH_URL || "https://sharepoints.letw.org").replace(/\/$/, "");
}

export function normalizeOfficialCode(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    return decodeURIComponent(segments.at(-1) ?? "").trim();
  } catch {
    return trimmed.replace(/^https?:\/\/\S+\/([^/\s?#]+)(?:[?#].*)?$/i, "$1").trim();
  }
}

function certificateActive(input: { status: string; expiresAt?: Date | null; revokedAt?: Date | null }) {
  return input.status === "ACTIVE" && !input.revokedAt && (!input.expiresAt || input.expiresAt > new Date());
}

function letterActive(status: string) {
  return status === "ISSUED";
}

function reportSeal(report: { id: string; year: number; month: number }) {
  return `LETW-RPT-${report.year}-${String(report.month).padStart(2, "0")}-${report.id.slice(-6).toUpperCase()}`;
}

function handoverSeal(handover: { id: string; createdAt: Date }) {
  return `LETW-HO-${handover.createdAt.getUTCFullYear()}-${handover.id.slice(-6).toUpperCase()}`;
}

function reportActive(status: string) {
  return status === "FINAL" || status === "GENERATED";
}

function handoverActive(status: string) {
  return status !== "CANCELLED";
}

function pastorTransferActive(status: string) {
  return ["APPROVED", "ACTIVE", "COMPLETED"].includes(status);
}

function circularActive(input: { status: string; expiresAt?: Date | null; revokedAt?: Date | null }) {
  return input.status === "ISSUED" && !input.revokedAt && (!input.expiresAt || input.expiresAt > new Date());
}

function digitalIdActive(input: { status: string; expiresAt?: Date | null; revokedAt?: Date | null; deletedAt?: Date | null }) {
  return input.status === "ACTIVE" && !input.revokedAt && !input.deletedAt && (!input.expiresAt || input.expiresAt > new Date());
}

function signatureActive(status: string) {
  return status === "SIGNED";
}

function notFound(code: string): OfficialSealResult {
  return {
    found: false,
    kind: "UNKNOWN",
    title: "No LETW official record found",
    sealNumber: code || null,
    active: false,
    message: "This code was not found in the LETW official registry.",
    warning: "Do not accept this document as authentic unless LETW leadership confirms it."
  };
}

export async function lookupOfficialSeal(rawCode: string, origin?: string | null): Promise<OfficialSealResult> {
  const code = normalizeOfficialCode(rawCode);
  const baseUrl = originFrom(origin);
  if (!code) return notFound(code);

  const letter = await prisma.officialLetter.findFirst({
    where: { OR: [{ id: code }, { letterNumber: code }] },
    select: {
      id: true,
      letterNumber: true,
      letterType: true,
      title: true,
      recipientName: true,
      status: true,
      issuedAt: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true
    }
  });
  if (letter) {
    const active = letterActive(letter.status);
    return {
      found: true,
      kind: "LETTER",
      recordId: letter.id,
      title: letter.title,
      sealNumber: letter.letterNumber,
      status: letter.status,
      active,
      ownerName: active ? letter.recipientName : null,
      issuedAt: letter.issuedAt ?? letter.createdAt,
      revokedAt: letter.revokedAt,
      verificationUrl: `${baseUrl}/verify/letter/${letter.id}`,
      message: active
        ? "This official LETW letter is active in the registry."
        : "This official LETW letter is not active and must not be accepted.",
      warning: active ? null : "Revoked, draft, archived, deleted, or replaced letters are void."
    };
  }

  const certificate = await prisma.memberCertificationBadge.findFirst({
    where: { OR: [{ id: code }, { verifyToken: code }, { certificateNumber: code }] },
    select: {
      id: true,
      title: true,
      certificateNumber: true,
      verifyToken: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      revokedAt: true,
      userId: true,
      recipientName: true,
      recipientEmail: true,
      sealNumber: true,
      certificateCategory: true
    }
  });
  if (certificate) {
    const active = certificateActive(certificate);
    const owner = active && certificate.userId
      ? await prisma.user.findUnique({ where: { id: certificate.userId }, select: { name: true, email: true } })
      : null;
    return {
      found: true,
      kind: "CERTIFICATE",
      recordId: certificate.id,
      title: certificate.title,
      sealNumber: certificate.sealNumber ?? certificate.certificateNumber ?? `LETW-CERT-${certificate.id.slice(-8).toUpperCase()}`,
      status: certificate.status,
      active,
      ownerName: active ? owner?.name ?? owner?.email ?? certificate.recipientName ?? certificate.recipientEmail ?? null : null,
      issuedAt: certificate.issuedAt,
      expiresAt: certificate.expiresAt,
      revokedAt: certificate.revokedAt,
      verificationUrl: `${baseUrl}/verify/certificate/${certificate.verifyToken}`,
      message: active
        ? "This LETW certificate is active and verified."
        : "This LETW certificate is revoked, expired, inactive, or replaced.",
      warning: active ? null : "Do not accept inactive certificates."
    };
  }

  const receipt = await prisma.givingReceipt.findFirst({
    where: { OR: [{ id: code }, { qrToken: code }, { receiptNumber: code }] },
    select: {
      id: true,
      receiptNumber: true,
      qrToken: true,
      donorName: true,
      fund: true,
      status: true,
      receivedAt: true,
      revokedAt: true
    }
  });
  if (receipt) {
    const active = receipt.status === "ACTIVE";
    return {
      found: true,
      kind: "GIVING_RECEIPT",
      recordId: receipt.id,
      title: `Giving receipt - ${receipt.fund}`,
      sealNumber: receipt.receiptNumber,
      status: receipt.status,
      active,
      ownerName: active ? receipt.donorName : null,
      issuedAt: receipt.receivedAt,
      revokedAt: receipt.revokedAt,
      verificationUrl: `${baseUrl}/verify/giving/${receipt.qrToken}`,
      message: active ? "This giving receipt is active." : "This giving receipt is not valid.",
      warning: active ? null : "Void or revoked receipts must not be accepted."
    };
  }

  const card = await prisma.digitalMembershipCard.findFirst({
    where: { OR: [{ id: code }, { qrToken: code }, { cardNumber: code }, { organizationId: code }, { credentialId: code }] },
    select: {
      id: true,
      userId: true,
      qrToken: true,
      cardNumber: true,
      organizationId: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      revokedAt: true,
      deletedAt: true,
    }
  });
  if (card) {
    const active = digitalIdActive(card);
    const owner = active
      ? await prisma.user.findUnique({
          where: { id: card.userId },
          select: { name: true, email: true, memberProfile: { select: { organizationPosition: true } } }
        })
      : null;
    return {
      found: true,
      kind: "DIGITAL_ID",
      recordId: card.id,
      title: "LETW digital membership ID",
      sealNumber: card.organizationId,
      status: card.status,
      active,
      ownerName: active ? owner?.name ?? owner?.email ?? null : null,
      scope: active ? owner?.memberProfile?.organizationPosition ?? "LETW member" : null,
      issuedAt: card.issuedAt,
      expiresAt: card.expiresAt,
      revokedAt: card.revokedAt,
      verificationUrl: `${baseUrl}/verify/member/${card.qrToken}`,
      message: active ? "This LETW membership ID is active." : "This LETW membership ID is not active.",
      warning: active ? null : "Lost, revoked, suspended, deleted, or expired IDs must not be accepted."
    };
  }

  const student = await prisma.academicCandidate.findFirst({
    where: { OR: [{ id: code }, { studentIdNumber: code }] },
    select: {
      id: true,
      fullName: true,
      email: true,
      organization: true,
      programName: true,
      educationLevel: true,
      studentIdNumber: true,
      studentIdIssuedAt: true,
      studentIdExpiresAt: true,
      studentIdStatus: true,
      status: true
    }
  });
  if (student?.studentIdNumber) {
    const active =
      student.status === "ACTIVE" &&
      student.studentIdStatus === "ACTIVE" &&
      (!student.studentIdExpiresAt || student.studentIdExpiresAt > new Date());
    return {
      found: true,
      kind: "STUDENT_ID",
      recordId: student.id,
      title: "LETW student identity card",
      sealNumber: student.studentIdNumber,
      status: active ? "ACTIVE" : student.studentIdStatus,
      active,
      ownerName: active ? student.fullName : null,
      scope: active ? `${student.educationLevel} - ${student.programName}` : student.organization ?? "LETW School of Theology",
      issuedAt: student.studentIdIssuedAt,
      expiresAt: student.studentIdExpiresAt,
      verificationUrl: `${baseUrl}/verify/student-id/${student.id}`,
      message: active ? "This LETW student ID is active." : "This LETW student ID is not active.",
      warning: active ? null : "Expired, suspended, revoked, replaced, or inactive student IDs must not be accepted."
    };
  }

  const reportCodeMatch = /^LETW-RPT-(\d{4})-(\d{2})-([A-Z0-9]+)$/i.exec(code);
  const report = await prisma.monthlyMinistryReport.findFirst({
    where: reportCodeMatch
      ? {
          year: Number(reportCodeMatch[1]),
          month: Number(reportCodeMatch[2]),
          id: { endsWith: reportCodeMatch[3].toLowerCase() }
        }
      : { id: code },
    select: {
      id: true,
      title: true,
      status: true,
      year: true,
      month: true,
      finalizedAt: true,
      createdAt: true,
      organizationUnitId: true,
      workspaceId: true
    }
  });
  if (report) {
    const sealNumber = reportSeal(report);
    const active = reportActive(report.status);
    const [unit, workspace] = await Promise.all([
      report.organizationUnitId
        ? prisma.organizationUnit.findUnique({ where: { id: report.organizationUnitId }, select: { name: true, type: true } })
        : null,
      report.workspaceId ? prisma.workspace.findUnique({ where: { id: report.workspaceId }, select: { name: true } }) : null
    ]);
    return {
      found: true,
      kind: "MONTHLY_REPORT",
      recordId: report.id,
      title: report.title,
      sealNumber,
      status: report.status,
      active,
      scope: unit ? `${unit.name} - ${unit.type.toLowerCase()}` : workspace?.name ?? "LETW organization",
      issuedAt: report.finalizedAt ?? report.createdAt,
      verificationUrl: `${baseUrl}/verify/report/${report.id}`,
      message: active ? "This LETW report is registered." : "This LETW report is not in an active report status.",
      warning: active ? null : "Draft or archived reports should not be used as current official records."
    };
  }

  const handoverCodeMatch = /^LETW-HO-(\d{4})-([A-Z0-9]+)$/i.exec(code);
  const handover = await prisma.leadershipHandover.findFirst({
    where: handoverCodeMatch
      ? { id: { endsWith: handoverCodeMatch[2].toLowerCase() } }
      : { id: code },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      acceptedAt: true,
      completedAt: true,
      organizationUnitId: true,
      workspaceId: true
    }
  });
  if (handover) {
    const active = handoverActive(handover.status);
    const [unit, workspace] = await Promise.all([
      handover.organizationUnitId
        ? prisma.organizationUnit.findUnique({ where: { id: handover.organizationUnitId }, select: { name: true, type: true } })
        : null,
      handover.workspaceId ? prisma.workspace.findUnique({ where: { id: handover.workspaceId }, select: { name: true } }) : null
    ]);
    return {
      found: true,
      kind: "HANDOVER",
      recordId: handover.id,
      title: handover.title,
      sealNumber: handoverSeal(handover),
      status: handover.status,
      active,
      scope: unit ? `${unit.name} - ${unit.type.toLowerCase()}` : workspace?.name ?? "LETW organization",
      issuedAt: handover.completedAt ?? handover.acceptedAt ?? handover.createdAt,
      verificationUrl: `${baseUrl}/verify/handover/${handover.id}`,
      message: active ? "This LETW handover record is registered." : "This LETW handover has been cancelled.",
      warning: active ? null : "Cancelled handovers should not be relied upon."
    };
  }

  const transfer = await prisma.pastorTransferPosting.findFirst({
    where: { OR: [{ id: code }, { verifyToken: code }, { transferNumber: code }, { sealNumber: code }] },
    select: {
      id: true,
      transferNumber: true,
      sealNumber: true,
      verifyToken: true,
      title: true,
      pastorUserId: true,
      fromOrganizationUnitId: true,
      toOrganizationUnitId: true,
      fromWorkspaceId: true,
      toWorkspaceId: true,
      effectiveAt: true,
      handoverDueAt: true,
      status: true,
      approvedAt: true,
      completedAt: true,
      cancelledAt: true,
      createdAt: true
    }
  });
  if (transfer) {
    const active = pastorTransferActive(transfer.status);
    const [pastor, fromUnit, toUnit, fromWorkspace, toWorkspace] = await Promise.all([
      active ? prisma.user.findUnique({ where: { id: transfer.pastorUserId }, select: { name: true, email: true } }) : null,
      transfer.fromOrganizationUnitId
        ? prisma.organizationUnit.findUnique({ where: { id: transfer.fromOrganizationUnitId }, select: { name: true, type: true } })
        : null,
      transfer.toOrganizationUnitId
        ? prisma.organizationUnit.findUnique({ where: { id: transfer.toOrganizationUnitId }, select: { name: true, type: true } })
        : null,
      transfer.fromWorkspaceId ? prisma.workspace.findUnique({ where: { id: transfer.fromWorkspaceId }, select: { name: true } }) : null,
      transfer.toWorkspaceId ? prisma.workspace.findUnique({ where: { id: transfer.toWorkspaceId }, select: { name: true } }) : null
    ]);
    const fromScope = fromUnit ? `${fromUnit.name} - ${fromUnit.type.toLowerCase()}` : fromWorkspace?.name ?? "Not recorded";
    const toScope = toUnit ? `${toUnit.name} - ${toUnit.type.toLowerCase()}` : toWorkspace?.name ?? "Not recorded";
    return {
      found: true,
      kind: "PASTOR_TRANSFER",
      recordId: transfer.id,
      title: transfer.title,
      sealNumber: transfer.sealNumber,
      status: transfer.status,
      active,
      ownerName: active ? pastor?.name ?? pastor?.email ?? "Assigned pastor" : null,
      scope: active ? `${fromScope} to ${toScope}` : "Hidden unless active",
      issuedAt: transfer.approvedAt ?? transfer.createdAt,
      expiresAt: transfer.handoverDueAt,
      revokedAt: transfer.cancelledAt,
      verificationUrl: `${baseUrl}/verify/transfer/${transfer.verifyToken}`,
      message: active
        ? "This LETW pastor transfer/posting record is registered and accepted."
        : "This LETW pastor transfer/posting record is not active.",
      warning: active ? null : "Draft, pending, cancelled, or unknown transfer postings must not be accepted as current authority."
    };
  }

  const circular = await prisma.officialCircular.findFirst({
    where: { OR: [{ id: code }, { verifyToken: code }, { circularNumber: code }, { sealNumber: code }] },
    select: {
      id: true,
      circularNumber: true,
      sealNumber: true,
      verifyToken: true,
      title: true,
      summary: true,
      category: true,
      audienceLabel: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true
    }
  });
  if (circular) {
    const active = circularActive(circular);
    return {
      found: true,
      kind: "OFFICIAL_CIRCULAR",
      recordId: circular.id,
      title: circular.title,
      sealNumber: circular.sealNumber,
      status: circular.status,
      active,
      scope: active ? circular.audienceLabel : "Hidden unless active",
      issuedAt: circular.issuedAt ?? circular.createdAt,
      expiresAt: circular.expiresAt,
      revokedAt: circular.revokedAt,
      verificationUrl: `${baseUrl}/verify/circular/${circular.verifyToken}`,
      message: active
        ? "This LETW official circular is issued and active."
        : "This LETW official circular is not active.",
      warning: active ? null : "Draft, expired, replaced, revoked, or archived circulars should not be used as current instructions."
    };
  }

  const signature = await prisma.digitalSignature.findFirst({
    where: { OR: [{ id: code }, { verificationHash: code }] },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      title: true,
      signerName: true,
      status: true,
      signedAt: true,
      revokedAt: true,
      verificationHash: true
    }
  });
  if (signature) {
    const active = signatureActive(signature.status);
    return {
      found: true,
      kind: "DIGITAL_SIGNATURE",
      recordId: signature.id,
      title: signature.title,
      sealNumber: signature.verificationHash.slice(0, 24).toUpperCase(),
      status: signature.status,
      active,
      ownerName: active ? signature.signerName : null,
      scope: `${signature.targetType} - ${signature.targetId}`,
      issuedAt: signature.signedAt,
      revokedAt: signature.revokedAt,
      message: active ? "This LETW digital signature is signed and active." : "This LETW digital signature is not active.",
      warning: active ? null : "Requested or revoked signatures must not be treated as signed."
    };
  }

  return notFound(code);
}

export async function officialSealRegistrySummary() {
  const [letters, certificates, receipts, cards, students, reports, handovers, transfers, circulars, signatures] = await Promise.all([
    prisma.officialLetter.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.memberCertificationBadge.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.givingReceipt.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.digitalMembershipCard.findMany({ orderBy: { issuedAt: "desc" }, take: 50 }),
    prisma.academicCandidate.findMany({ where: { studentIdNumber: { not: null } }, orderBy: { studentIdIssuedAt: "desc" }, take: 50 }),
    prisma.monthlyMinistryReport.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.leadershipHandover.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.pastorTransferPosting.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.officialCircular.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.digitalSignature.findMany({ orderBy: { createdAt: "desc" }, take: 50 })
  ]);
  const userIds = Array.from(new Set([...certificates.map((item) => item.userId), ...cards.map((item) => item.userId)].filter(Boolean))) as string[];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true }
      })
    : [];
  const usersById = new Map(users.map((user) => [user.id, user]));

  const records: OfficialSealResult[] = [
    ...letters.map((letter) => ({
      found: true,
      kind: "LETTER" as const,
      recordId: letter.id,
      title: letter.title,
      sealNumber: letter.letterNumber,
      status: letter.status,
      active: letterActive(letter.status),
      ownerName: letterActive(letter.status) ? letter.recipientName : null,
      issuedAt: letter.issuedAt ?? letter.createdAt,
      revokedAt: letter.revokedAt,
      verificationUrl: `/verify/letter/${letter.id}`,
      message: letterActive(letter.status) ? "Active letter" : "Inactive letter"
    })),
    ...certificates.map((certificate) => ({
      found: true,
      kind: "CERTIFICATE" as const,
      recordId: certificate.id,
      title: certificate.title,
      sealNumber: certificate.sealNumber ?? certificate.certificateNumber ?? `LETW-CERT-${certificate.id.slice(-8).toUpperCase()}`,
      status: certificate.status,
      active: certificateActive(certificate),
      ownerName: certificateActive(certificate)
        ? (certificate.userId ? usersById.get(certificate.userId)?.name ?? usersById.get(certificate.userId)?.email : null) ?? certificate.recipientName ?? certificate.recipientEmail ?? null
        : null,
      issuedAt: certificate.issuedAt,
      expiresAt: certificate.expiresAt,
      revokedAt: certificate.revokedAt,
      verificationUrl: `/verify/certificate/${certificate.verifyToken}`,
      message: certificateActive(certificate) ? "Active certificate" : "Inactive certificate"
    })),
    ...receipts.map((receipt) => ({
      found: true,
      kind: "GIVING_RECEIPT" as const,
      recordId: receipt.id,
      title: `Giving receipt - ${receipt.fund}`,
      sealNumber: receipt.receiptNumber,
      status: receipt.status,
      active: receipt.status === "ACTIVE",
      ownerName: receipt.status === "ACTIVE" ? receipt.donorName : null,
      issuedAt: receipt.receivedAt,
      revokedAt: receipt.revokedAt,
      verificationUrl: `/verify/giving/${receipt.qrToken}`,
      message: receipt.status === "ACTIVE" ? "Active receipt" : "Inactive receipt"
    })),
    ...cards.map((card) => ({
      found: true,
      kind: "DIGITAL_ID" as const,
      recordId: card.id,
      title: "LETW digital membership ID",
      sealNumber: card.organizationId,
      status: card.status,
      active: digitalIdActive(card),
      ownerName: digitalIdActive(card) ? usersById.get(card.userId)?.name ?? usersById.get(card.userId)?.email ?? null : null,
      issuedAt: card.issuedAt,
      expiresAt: card.expiresAt,
      revokedAt: card.revokedAt,
      verificationUrl: `/verify/member/${card.qrToken}`,
      message: digitalIdActive(card) ? "Active ID" : "Inactive ID"
    })),
    ...students.map((student) => {
      const active =
        student.status === "ACTIVE" &&
        student.studentIdStatus === "ACTIVE" &&
        (!student.studentIdExpiresAt || student.studentIdExpiresAt > new Date());
      return {
        found: true,
        kind: "STUDENT_ID" as const,
        recordId: student.id,
        title: "LETW student identity card",
        sealNumber: student.studentIdNumber,
        status: active ? "ACTIVE" : student.studentIdStatus,
        active,
        ownerName: active ? student.fullName : null,
        scope: active ? `${student.educationLevel} - ${student.programName}` : student.organization ?? "LETW School of Theology",
        issuedAt: student.studentIdIssuedAt,
        expiresAt: student.studentIdExpiresAt,
        verificationUrl: `/verify/student-id/${student.id}`,
        message: active ? "Active student ID" : "Inactive student ID"
      };
    }),
    ...reports.map((report) => ({
      found: true,
      kind: "MONTHLY_REPORT" as const,
      recordId: report.id,
      title: report.title,
      sealNumber: reportSeal(report),
      status: report.status,
      active: reportActive(report.status),
      issuedAt: report.finalizedAt ?? report.createdAt,
      verificationUrl: `/verify/report/${report.id}`,
      message: reportActive(report.status) ? "Active report" : "Inactive report"
    })),
    ...handovers.map((handover) => ({
      found: true,
      kind: "HANDOVER" as const,
      recordId: handover.id,
      title: handover.title,
      sealNumber: handoverSeal(handover),
      status: handover.status,
      active: handoverActive(handover.status),
      issuedAt: handover.completedAt ?? handover.acceptedAt ?? handover.createdAt,
      verificationUrl: `/verify/handover/${handover.id}`,
      message: handoverActive(handover.status) ? "Active handover" : "Inactive handover"
    })),
    ...transfers.map((transfer) => ({
      found: true,
      kind: "PASTOR_TRANSFER" as const,
      recordId: transfer.id,
      title: transfer.title,
      sealNumber: transfer.sealNumber,
      status: transfer.status,
      active: pastorTransferActive(transfer.status),
      issuedAt: transfer.approvedAt ?? transfer.createdAt,
      expiresAt: transfer.handoverDueAt,
      revokedAt: transfer.cancelledAt,
      verificationUrl: `/verify/transfer/${transfer.verifyToken}`,
      message: pastorTransferActive(transfer.status) ? "Active transfer/posting" : "Inactive transfer/posting"
    })),
    ...circulars.map((circular) => ({
      found: true,
      kind: "OFFICIAL_CIRCULAR" as const,
      recordId: circular.id,
      title: circular.title,
      sealNumber: circular.sealNumber,
      status: circular.status,
      active: circularActive(circular),
      scope: circular.audienceLabel,
      issuedAt: circular.issuedAt ?? circular.createdAt,
      expiresAt: circular.expiresAt,
      revokedAt: circular.revokedAt,
      verificationUrl: `/verify/circular/${circular.verifyToken}`,
      message: circularActive(circular) ? "Active circular" : "Inactive circular"
    })),
    ...signatures.map((signature) => ({
      found: true,
      kind: "DIGITAL_SIGNATURE" as const,
      recordId: signature.id,
      title: signature.title,
      sealNumber: signature.verificationHash.slice(0, 24).toUpperCase(),
      status: signature.status,
      active: signatureActive(signature.status),
      ownerName: signatureActive(signature.status) ? signature.signerName : null,
      issuedAt: signature.signedAt,
      revokedAt: signature.revokedAt,
      message: signatureActive(signature.status) ? "Signed" : "Not signed"
    }))
  ];

  return records.sort((first, second) => {
    const firstDate = first.issuedAt?.getTime() ?? 0;
    const secondDate = second.issuedAt?.getTime() ?? 0;
    return secondDate - firstDate;
  });
}
