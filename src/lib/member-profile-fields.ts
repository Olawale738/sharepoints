import type { MemberProfile, Prisma } from "@prisma/client";

export const memberEditableProfileFields = [
  { key: "phone", label: "Phone", type: "tel" },
  { key: "alternatePhone", label: "Alternate phone", type: "tel" },
  { key: "dateOfBirth", label: "Date of birth", type: "date" },
  { key: "gender", label: "Gender", type: "text" },
  { key: "maritalStatus", label: "Marital status", type: "text" },
  { key: "address", label: "Address", type: "long_text" },
  { key: "city", label: "City", type: "text" },
  { key: "country", label: "Country", type: "text" },
  { key: "occupation", label: "Occupation", type: "text" },
  { key: "employer", label: "Employer", type: "text" },
  { key: "emergencyContactName", label: "Emergency contact", type: "text" },
  { key: "emergencyContactPhone", label: "Emergency phone", type: "tel" },
  { key: "communicationPreference", label: "Communication preference", type: "text" },
  { key: "ministryInterests", label: "Ministry interests", type: "list" },
  { key: "skills", label: "Skills", type: "list" }
] as const;

export type MemberEditableProfileField = (typeof memberEditableProfileFields)[number]["key"];
const allowedFieldKeys = new Set<string>(memberEditableProfileFields.map((field) => field.key));

export function isMemberEditableProfileField(value: string): value is MemberEditableProfileField {
  return allowedFieldKeys.has(value);
}

function isoDate(value: Date | null | undefined) {
  return value?.toISOString().slice(0, 10) ?? "";
}

function jsonStringList(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function memberProfileAnswers(profile: MemberProfile | null) {
  return {
    phone: profile?.phone ?? "",
    alternatePhone: profile?.alternatePhone ?? "",
    dateOfBirth: isoDate(profile?.dateOfBirth),
    gender: profile?.gender ?? "",
    maritalStatus: profile?.maritalStatus ?? "",
    address: profile?.address ?? "",
    city: profile?.city ?? "",
    country: profile?.country ?? "",
    occupation: profile?.occupation ?? "",
    employer: profile?.employer ?? "",
    emergencyContactName: profile?.emergencyContactName ?? "",
    emergencyContactPhone: profile?.emergencyContactPhone ?? "",
    communicationPreference: profile?.communicationPreference ?? "",
    ministryInterests: jsonStringList(profile?.ministryInterests),
    skills: jsonStringList(profile?.skills)
  } satisfies Record<MemberEditableProfileField, string | string[]>;
}

type MemberProfileAnswerData = {
  phone?: string | null;
  alternatePhone?: string | null;
  dateOfBirth?: Date | null;
  gender?: string | null;
  maritalStatus?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  occupation?: string | null;
  employer?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  communicationPreference?: string | null;
  ministryInterests?: string[];
  skills?: string[];
};

export function profileUpdateFromAnswers(
  requiredFields: MemberEditableProfileField[],
  answers: Record<string, string | string[]>
) {
  const data: MemberProfileAnswerData = {};

  for (const field of requiredFields) {
    const value = answers[field];
    if (field === "dateOfBirth") {
      data.dateOfBirth = typeof value === "string" && value ? new Date(`${value}T00:00:00.000Z`) : null;
    } else if (field === "ministryInterests" || field === "skills") {
      data[field] = Array.isArray(value) ? value : [];
    } else {
      data[field] = typeof value === "string" && value.trim() ? value.trim() : null;
    }
  }

  return data;
}
