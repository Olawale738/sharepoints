import { DepartmentKind, OrganizationUnitType } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { normalizeEmail } from "@/lib/email-policy";
import { prisma } from "@/lib/prisma";

export const ORGANIZATION_IMPORT_TEMPLATE = [
  [
    "row_type",
    "type",
    "name",
    "email",
    "department",
    "parent_code",
    "code",
    "country_code",
    "department_kind",
    "description",
    "category",
    "position",
    "membership_number",
    "digital_id_location",
    "phone",
    "city",
    "country",
    "membership_status",
    "organization_unit_code",
    "ministry_interests",
    "skills",
    "photo_url"
  ].join(","),
  [
    "UNIT",
    "COUNTRY",
    "Nigeria",
    "",
    "",
    "LETW",
    "LETW-NG",
    "NG",
    "",
    "LETW Nigeria national structure",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    ""
  ].join(","),
  [
    "DEPARTMENT",
    "",
    "Media",
    "",
    "",
    "",
    "",
    "",
    "MINISTRY_UNIT",
    "Media and production team",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    ""
  ].join(","),
  [
    "MINISTRY",
    "",
    "Prayer Ministry",
    "",
    "",
    "",
    "",
    "",
    "",
    "Prayer and intercession ministry",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    ""
  ].join(","),
  [
    "MEMBER",
    "",
    "Example Member",
    "example@letw.org",
    "Media",
    "",
    "",
    "",
    "",
    "Worker",
    "Usher",
    "LETW-0001",
    "LETTW Worldwide",
    "+44 0000 000000",
    "London",
    "United Kingdom",
    "ACTIVE",
    "LETW-GB",
    "Ushering; Prayer",
    "Hospitality; Media",
    "https://example.com/member-photo.jpg"
  ].join(",")
].join("\n");

type ImportRow = Record<string, string>;

type ImportSummary = {
  units: number;
  departments: number;
  ministries: number;
  invitations: number;
  memberProfiles: number;
  userUpdates: number;
  skipped: Array<{ row: number; reason: string }>;
};

const starterDepartments: Array<{ name: string; kind: DepartmentKind; description: string }> = [
  { name: "Administration", kind: DepartmentKind.DEPARTMENT, description: "Office, admin, records, and coordination." },
  { name: "Pastoral Care", kind: DepartmentKind.DEPARTMENT, description: "Care, counselling, welfare, and follow-up oversight." },
  { name: "Finance", kind: DepartmentKind.DEPARTMENT, description: "Finance, stewardship, budgets, and reporting." },
  { name: "Media", kind: DepartmentKind.MINISTRY_UNIT, description: "Sound, video, projection, livestream, and digital media." },
  { name: "Choir", kind: DepartmentKind.MINISTRY_UNIT, description: "Music, worship, and rehearsal coordination." },
  { name: "Ushers", kind: DepartmentKind.MINISTRY_UNIT, description: "Welcoming, seating, and service flow." },
  { name: "Protocol", kind: DepartmentKind.MINISTRY_UNIT, description: "Guest care, order, and official hosting." },
  { name: "Prayer", kind: DepartmentKind.MINISTRY_UNIT, description: "Prayer, intercession, and spiritual support." },
  { name: "Evangelism", kind: DepartmentKind.MINISTRY_UNIT, description: "Outreach, missions, and soul-winning follow-up." },
  { name: "Children", kind: DepartmentKind.MINISTRY_UNIT, description: "Children church and safeguarding-aware ministry." },
  { name: "Youth", kind: DepartmentKind.MINISTRY_UNIT, description: "Youth discipleship, service, and activities." },
  { name: "Welfare", kind: DepartmentKind.MINISTRY_UNIT, description: "Member support, benevolence, and welfare checks." },
  { name: "Leader", kind: DepartmentKind.CATEGORY, description: "Leadership category for organization access." },
  { name: "Moderator", kind: DepartmentKind.CATEGORY, description: "Moderator category for operational oversight." },
  { name: "Worker", kind: DepartmentKind.CATEGORY, description: "Approved worker and volunteer category." },
  { name: "Member", kind: DepartmentKind.CATEGORY, description: "Ordinary active member category." }
];

const starterMinistries = [
  "Prayer Ministry",
  "Choir and Worship",
  "Media Ministry",
  "Evangelism and Outreach",
  "Welfare Ministry",
  "Children Ministry",
  "Youth Ministry",
  "Protocol Ministry",
  "Ushering Ministry",
  "Follow Up and New Converts",
  "Pastoral Care"
];

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(csv: string) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    return {
      lineNumber: index + 2,
      row: Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]?.trim() ?? ""])) as ImportRow
    };
  });
}

function nullable(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function splitList(value?: string) {
  return (value ?? "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function departmentKind(value?: string) {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "MINISTRY_UNIT") return DepartmentKind.MINISTRY_UNIT;
  if (normalized === "CATEGORY") return DepartmentKind.CATEGORY;
  return DepartmentKind.DEPARTMENT;
}

function unitType(value?: string) {
  const normalized = value?.trim().toUpperCase();
  if (normalized && normalized in OrganizationUnitType) return normalized as OrganizationUnitType;
  return OrganizationUnitType.BRANCH;
}

async function upsertDepartment(input: {
  name: string;
  kind: DepartmentKind;
  description?: string | null;
  actorId: string;
}) {
  return prisma.department.upsert({
    where: {
      name_kind: {
        name: input.name,
        kind: input.kind
      }
    },
    update: {
      description: input.description ?? undefined
    },
    create: {
      name: input.name,
      kind: input.kind,
      description: input.description,
      createdById: input.actorId
    }
  });
}

async function upsertMinistry(input: {
  name: string;
  description?: string | null;
  actorId: string;
}) {
  const existing = await prisma.ministry.findFirst({
    where: {
      workspaceId: null,
      name: input.name
    }
  });
  if (existing) {
    return prisma.ministry.update({
      where: { id: existing.id },
      data: {
        description: input.description ?? existing.description
      }
    });
  }
  return prisma.ministry.create({
    data: {
      name: input.name,
      description: input.description,
      createdById: input.actorId
    }
  });
}

async function findUnitByCode(code?: string | null) {
  const normalized = nullable(code);
  if (!normalized) return null;
  return prisma.organizationUnit.findUnique({ where: { code: normalized } });
}

export async function createLetwStarterOrganizationData(actorId: string) {
  const global = await prisma.organizationUnit.upsert({
    where: { code: "LETW" },
    update: {
      name: "Light Encounter Tabernacle Worldwide",
      active: true,
      description: "Global LETW organization root."
    },
    create: {
      type: OrganizationUnitType.GLOBAL,
      name: "Light Encounter Tabernacle Worldwide",
      code: "LETW",
      description: "Global LETW organization root.",
      createdById: actorId
    }
  });

  const units = [
    {
      parentId: global.id,
      type: OrganizationUnitType.COUNTRY,
      name: "United Kingdom",
      code: "LETW-GB",
      countryCode: "GB",
      description: "LETW United Kingdom."
    },
    {
      parentId: global.id,
      type: OrganizationUnitType.COUNTRY,
      name: "Nigeria",
      code: "LETW-NG",
      countryCode: "NG",
      description: "LETW Nigeria."
    },
    {
      parentId: global.id,
      type: OrganizationUnitType.REGION,
      name: "LETTW Worldwide",
      code: "LETW-WORLDWIDE",
      countryCode: null,
      description: "Worldwide member location for digital IDs."
    }
  ];

  let unitCount = 1;
  for (const unit of units) {
    await prisma.organizationUnit.upsert({
      where: { code: unit.code },
      update: {
        parentId: unit.parentId,
        type: unit.type,
        name: unit.name,
        countryCode: unit.countryCode,
        description: unit.description,
        active: true
      },
      create: {
        ...unit,
        createdById: actorId
      }
    });
    unitCount += 1;
  }

  for (const department of starterDepartments) {
    await upsertDepartment({ ...department, actorId });
  }

  for (const ministry of starterMinistries) {
    await upsertMinistry({
      name: ministry,
      description: `${ministry} for Light Encounter Tabernacle Worldwide.`,
      actorId
    });
  }

  await logActivity({
    userId: actorId,
    action: activityActions.organizationStarterDataApplied,
    targetId: global.id,
    metadata: {
      units: unitCount,
      departments: starterDepartments.length,
      ministries: starterMinistries.length
    }
  });

  return {
    units: unitCount,
    departments: starterDepartments.length,
    ministries: starterMinistries.length
  };
}

export async function importOrganizationCsv(csv: string, actorId: string): Promise<ImportSummary> {
  const rows = parseCsv(csv);
  const summary: ImportSummary = {
    units: 0,
    departments: 0,
    ministries: 0,
    invitations: 0,
    memberProfiles: 0,
    userUpdates: 0,
    skipped: []
  };

  for (const { row, lineNumber } of rows) {
    const rowType = row.row_type?.trim().toUpperCase();

    if (rowType === "UNIT") {
      const code = nullable(row.code);
      const name = nullable(row.name);
      if (!name || !code) {
        summary.skipped.push({ row: lineNumber, reason: "UNIT rows require name and code." });
        continue;
      }
      const parent = await findUnitByCode(row.parent_code);
      await prisma.organizationUnit.upsert({
        where: { code },
        update: {
          parentId: parent?.id ?? null,
          type: unitType(row.type),
          name,
          countryCode: nullable(row.country_code),
          description: nullable(row.description),
          active: true
        },
        create: {
          parentId: parent?.id ?? null,
          type: unitType(row.type),
          name,
          code,
          countryCode: nullable(row.country_code),
          description: nullable(row.description),
          createdById: actorId
        }
      });
      summary.units += 1;
      continue;
    }

    if (rowType === "DEPARTMENT") {
      const name = nullable(row.name);
      if (!name) {
        summary.skipped.push({ row: lineNumber, reason: "DEPARTMENT rows require name." });
        continue;
      }
      await upsertDepartment({
        name,
        kind: departmentKind(row.department_kind),
        description: nullable(row.description),
        actorId
      });
      summary.departments += 1;
      continue;
    }

    if (rowType === "MINISTRY") {
      const name = nullable(row.name);
      if (!name) {
        summary.skipped.push({ row: lineNumber, reason: "MINISTRY rows require name." });
        continue;
      }
      await upsertMinistry({
        name,
        description: nullable(row.description),
        actorId
      });
      summary.ministries += 1;
      continue;
    }

    if (rowType === "MEMBER") {
      const email = normalizeEmail(row.email);
      if (!email.endsWith("@letw.org")) {
        summary.skipped.push({ row: lineNumber, reason: "MEMBER rows require an invited @letw.org email." });
        continue;
      }

      await prisma.companyEmailInvitation.upsert({
        where: { email },
        update: {
          invitedById: actorId,
          revokedAt: null
        },
        create: {
          email,
          invitedById: actorId
        }
      });
      summary.invitations += 1;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) continue;

      const departmentName = nullable(row.department);
      const department = departmentName
        ? await prisma.department.findFirst({ where: { name: departmentName } })
        : null;
      const organizationUnit = await findUnitByCode(row.organization_unit_code);
      const membershipNumber = nullable(row.membership_number);
      const membershipConflict = membershipNumber
        ? await prisma.memberProfile.findFirst({
            where: {
              membershipNumber,
              userId: { not: user.id }
            },
            select: { id: true }
          })
        : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: nullable(row.name) ?? user.name,
          category: nullable(row.category) ?? user.category,
          departmentId: department?.id ?? undefined,
          image: nullable(row.photo_url) ?? undefined
        }
      });
      summary.userUpdates += 1;

      await prisma.memberProfile.upsert({
        where: { userId: user.id },
        update: {
          membershipNumber: membershipConflict ? undefined : membershipNumber,
          membershipStatus: nullable(row.membership_status) ?? "ACTIVE",
          phone: nullable(row.phone),
          city: nullable(row.city),
          country: nullable(row.country),
          organizationPosition: nullable(row.position),
          digitalIdLocation: nullable(row.digital_id_location) ?? "LETTW Worldwide",
          ministryInterests: splitList(row.ministry_interests),
          skills: splitList(row.skills),
          currentOrganizationUnitId: organizationUnit?.id ?? undefined
        },
        create: {
          userId: user.id,
          membershipNumber: membershipConflict ? null : membershipNumber,
          membershipStatus: nullable(row.membership_status) ?? "ACTIVE",
          phone: nullable(row.phone),
          city: nullable(row.city),
          country: nullable(row.country),
          organizationPosition: nullable(row.position),
          digitalIdLocation: nullable(row.digital_id_location) ?? "LETTW Worldwide",
          ministryInterests: splitList(row.ministry_interests),
          skills: splitList(row.skills),
          currentOrganizationUnitId: organizationUnit?.id ?? null
        }
      });
      summary.memberProfiles += 1;

      if (membershipConflict) {
        summary.skipped.push({
          row: lineNumber,
          reason: `Membership number ${membershipNumber} is already assigned to another member.`
        });
      }
      continue;
    }

    summary.skipped.push({ row: lineNumber, reason: `Unknown row_type "${row.row_type}".` });
  }

  await logActivity({
    userId: actorId,
    action: activityActions.organizationImportRun,
    metadata: {
      rows: rows.length,
      units: summary.units,
      departments: summary.departments,
      ministries: summary.ministries,
      invitations: summary.invitations,
      memberProfiles: summary.memberProfiles,
      skipped: summary.skipped.length
    }
  });

  return summary;
}
