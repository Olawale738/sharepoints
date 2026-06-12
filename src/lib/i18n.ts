export const supportedLocales = ["en", "yo", "fr"] as const;
export type AppLocale = (typeof supportedLocales)[number];

const messages = {
  en: {
    calendar: "Calendar",
    analytics: "Analytics",
    operations: "People & Operations",
    admin: "Admin",
    profile: "Profile",
    workspaces: "Workspaces",
    protectedAccess: "Protected LETW access"
  },
  yo: {
    calendar: "Kalenda",
    analytics: "Ìtúpalẹ̀",
    operations: "Àwọn Ènìyàn àti Iṣẹ́",
    admin: "Alakoso",
    profile: "Profaili",
    workspaces: "Àwọn Aaye Iṣẹ́",
    protectedAccess: "Aaye LETW to ni aabo"
  },
  fr: {
    calendar: "Calendrier",
    analytics: "Analyses",
    operations: "Personnes et opérations",
    admin: "Administration",
    profile: "Profil",
    workspaces: "Espaces de travail",
    protectedAccess: "Accès LETW protégé"
  }
} as const;

export function normalizeLocale(value?: string | null): AppLocale {
  return supportedLocales.includes(value as AppLocale) ? (value as AppLocale) : "en";
}

export function appMessages(value?: string | null) {
  return messages[normalizeLocale(value)];
}
