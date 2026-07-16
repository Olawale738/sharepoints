export const CERTIFICATE_PRESET_VALUES = [
  "THEOLOGY_DEGREE",
  "MARRIAGE_COVENANT",
  "ORDINATION_MINISTRY",
  "BAPTISM_WATER",
  "MEMBERSHIP_COVENANT",
  "LEADERSHIP_APPOINTMENT",
  "TRAINING_COMPLETION"
] as const;

export type CertificatePreset = (typeof CERTIFICATE_PRESET_VALUES)[number];

export const CERTIFICATE_PRESET_OPTIONS: Array<{
  value: CertificatePreset;
  label: string;
  description: string;
  category: "MINISTRY" | "EDUCATION" | "MARRIAGE";
}> = [
  {
    value: "THEOLOGY_DEGREE",
    label: "Theology degree",
    description: "Academic certificate for theology awards, diplomas, BSc, MSc, and PhD.",
    category: "EDUCATION"
  },
  {
    value: "MARRIAGE_COVENANT",
    label: "Marriage certificate",
    description: "Holy matrimony certificate with couple, witnesses, officiant, and register details.",
    category: "MARRIAGE"
  },
  {
    value: "ORDINATION_MINISTRY",
    label: "Ordination certificate",
    description: "Ceremonial ministry ordination credential.",
    category: "MINISTRY"
  },
  {
    value: "BAPTISM_WATER",
    label: "Baptism certificate",
    description: "Water baptism certificate for member or candidate records.",
    category: "MINISTRY"
  },
  {
    value: "MEMBERSHIP_COVENANT",
    label: "Membership certificate",
    description: "Official LETW membership recognition certificate.",
    category: "MINISTRY"
  },
  {
    value: "LEADERSHIP_APPOINTMENT",
    label: "Leadership appointment",
    description: "Appointment and leadership confirmation certificate.",
    category: "MINISTRY"
  },
  {
    value: "TRAINING_COMPLETION",
    label: "Training completion",
    description: "Training, school, conference, and course completion certificate.",
    category: "MINISTRY"
  }
];

export const MINISTRY_CERTIFICATE_TYPES = [
  "Baptism Certificate",
  "Membership Certificate",
  "Training Completion Certificate",
  "Ordination Certificate",
  "Leadership Appointment Certificate",
  "Conference Certificate",
  "Volunteer Service Certificate"
] as const;

export const THEOLOGY_CERTIFICATE_TYPES = [
  "Certificate in Theology",
  "Diploma in Theology",
  "Advanced Diploma in Theology",
  "Bachelor of Science in Theology",
  "Master of Science in Theology",
  "Doctor of Philosophy in Theology"
] as const;

export const MARRIAGE_CERTIFICATE_TYPES = [
  "Marriage Certificate",
  "Certificate of Holy Matrimony",
  "Marriage Blessing Certificate",
  "Marriage Dedication Certificate"
] as const;

export function inferCertificatePreset(input: {
  certificatePreset?: string | null;
  certificateCategory?: string | null;
  title?: string | null;
}) {
  if (input.certificatePreset && CERTIFICATE_PRESET_VALUES.includes(input.certificatePreset as CertificatePreset)) {
    return input.certificatePreset as CertificatePreset;
  }

  const title = (input.title ?? "").toLowerCase();
  if (input.certificateCategory === "EDUCATION" || title.includes("theology") || title.includes("diploma") || title.includes("philosophy")) {
    return "THEOLOGY_DEGREE";
  }
  if (input.certificateCategory === "MARRIAGE" || title.includes("marriage") || title.includes("matrimony")) {
    return "MARRIAGE_COVENANT";
  }
  if (title.includes("ordination")) return "ORDINATION_MINISTRY";
  if (title.includes("baptism")) return "BAPTISM_WATER";
  if (title.includes("leadership") || title.includes("appointment")) return "LEADERSHIP_APPOINTMENT";
  if (title.includes("training") || title.includes("completion") || title.includes("conference")) return "TRAINING_COMPLETION";
  return "MEMBERSHIP_COVENANT";
}

export function certificatePresetDefaults(preset: CertificatePreset) {
  switch (preset) {
    case "THEOLOGY_DEGREE":
      return {
        certificateCategory: "EDUCATION",
        templateStyle: "ACADEMIC",
        templateAccent: "NAVY_GOLD",
        sealStyle: "EMBOSSED",
        signatureLayout: "DUAL",
        watermarkStrength: "STANDARD",
        secondSignatoryTitle: "Rector"
      } as const;
    case "MARRIAGE_COVENANT":
      return {
        certificateCategory: "MARRIAGE",
        templateStyle: "MARRIAGE_ELEGANT",
        templateAccent: "BURGUNDY_GOLD",
        sealStyle: "ROUND",
        signatureLayout: "DUAL",
        watermarkStrength: "STANDARD",
        secondSignatoryTitle: "Officiating Minister"
      } as const;
    case "ORDINATION_MINISTRY":
      return {
        certificateCategory: "MINISTRY",
        templateStyle: "ROYAL",
        templateAccent: "NAVY_GOLD",
        sealStyle: "EMBOSSED",
        signatureLayout: "DUAL",
        watermarkStrength: "STRONG",
        secondSignatoryTitle: "Registrar / Ministry Secretary"
      } as const;
    case "BAPTISM_WATER":
      return {
        certificateCategory: "MINISTRY",
        templateStyle: "MODERN",
        templateAccent: "BLUE_GOLD",
        sealStyle: "ROUND",
        signatureLayout: "DUAL",
        watermarkStrength: "SUBTLE",
        secondSignatoryTitle: "Baptism Coordinator"
      } as const;
    case "LEADERSHIP_APPOINTMENT":
      return {
        certificateCategory: "MINISTRY",
        templateStyle: "ROYAL",
        templateAccent: "GREEN_GOLD",
        sealStyle: "CHIP",
        signatureLayout: "DUAL",
        watermarkStrength: "STANDARD",
        secondSignatoryTitle: "General Secretary"
      } as const;
    case "TRAINING_COMPLETION":
      return {
        certificateCategory: "MINISTRY",
        templateStyle: "ACADEMIC",
        templateAccent: "BLUE_GOLD",
        sealStyle: "CHIP",
        signatureLayout: "DUAL",
        watermarkStrength: "SUBTLE",
        secondSignatoryTitle: "Training Director"
      } as const;
    case "MEMBERSHIP_COVENANT":
    default:
      return {
        certificateCategory: "MINISTRY",
        templateStyle: "CLASSIC",
        templateAccent: "NAVY_GOLD",
        sealStyle: "CHIP",
        signatureLayout: "DUAL",
        watermarkStrength: "STANDARD",
        secondSignatoryTitle: "Membership Secretary"
      } as const;
  }
}

export function certificatePresetDisplay(preset: CertificatePreset) {
  return CERTIFICATE_PRESET_OPTIONS.find((option) => option.value === preset) ?? CERTIFICATE_PRESET_OPTIONS[4];
}
