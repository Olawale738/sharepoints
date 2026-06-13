export const supportedLocales = ["en", "yo", "fr", "ha", "ig", "es", "pt", "sw", "de"] as const;
export type AppLocale = (typeof supportedLocales)[number];

export const localeOptions: ReadonlyArray<{
  value: AppLocale;
  label: string;
  englishName: string;
}> = [
  { value: "en", label: "English", englishName: "English" },
  { value: "yo", label: "Yorùbá", englishName: "Yoruba" },
  { value: "fr", label: "Français", englishName: "French" },
  { value: "ha", label: "Hausa", englishName: "Hausa" },
  { value: "ig", label: "Igbo", englishName: "Igbo" },
  { value: "es", label: "Español", englishName: "Spanish" },
  { value: "pt", label: "Português", englishName: "Portuguese" },
  { value: "sw", label: "Kiswahili", englishName: "Swahili" },
  { value: "de", label: "Deutsch", englishName: "German" }
];

type AppMessages = {
  aiAssistant: string;
  requiredForms: string;
  calendar: string;
  analytics: string;
  operations: string;
  admin: string;
  profile: string;
  signOut: string;
  workspaces: string;
  protectedAccess: string;
  protectedAccessDescription: string;
};

const messages: Record<AppLocale, AppMessages> = {
  en: {
    aiAssistant: "AI Assistant",
    requiredForms: "Required forms",
    calendar: "Calendar",
    analytics: "Analytics",
    operations: "People & Operations",
    admin: "Admin",
    profile: "Profile",
    signOut: "Sign out",
    workspaces: "Workspaces",
    protectedAccess: "Protected LETW access",
    protectedAccessDescription: "@letw.org accounts must be invited before they can use the service."
  },
  yo: {
    aiAssistant: "Olùrànlọ́wọ́ AI",
    requiredForms: "Fọ́ọ̀mù dandan",
    calendar: "Kálẹ́ńdà",
    analytics: "Ìtúpalẹ̀",
    operations: "Àwọn ènìyàn àti iṣẹ́",
    admin: "Alákóso",
    profile: "Prófaili",
    signOut: "Jáde",
    workspaces: "Àwọn ibi iṣẹ́",
    protectedAccess: "Ìwọlé LETW tó ní ààbò",
    protectedAccessDescription: "Àwọn àkọọlẹ̀ @letw.org gbọ́dọ̀ gba ìpè kí wọ́n tó lè lo iṣẹ́ náà."
  },
  fr: {
    aiAssistant: "Assistant IA",
    requiredForms: "Formulaires requis",
    calendar: "Calendrier",
    analytics: "Analyses",
    operations: "Personnes et opérations",
    admin: "Administration",
    profile: "Profil",
    signOut: "Déconnexion",
    workspaces: "Espaces de travail",
    protectedAccess: "Accès LETW protégé",
    protectedAccessDescription: "Les comptes @letw.org doivent être invités avant de pouvoir utiliser le service."
  },
  ha: {
    aiAssistant: "Mataimakin AI",
    requiredForms: "Fom ɗin da ake buƙata",
    calendar: "Kalanda",
    analytics: "Bincike",
    operations: "Mutane da ayyuka",
    admin: "Mai gudanarwa",
    profile: "Bayanan martaba",
    signOut: "Fita",
    workspaces: "Wuraren aiki",
    protectedAccess: "Samun LETW mai kariya",
    protectedAccessDescription: "Dole ne a gayyaci asusun @letw.org kafin su iya amfani da sabis ɗin."
  },
  ig: {
    aiAssistant: "Onye enyemaka AI",
    requiredForms: "Fọm achọrọ",
    calendar: "Kalenda",
    analytics: "Nchịkọta",
    operations: "Ndị mmadụ na ọrụ",
    admin: "Onye nchịkwa",
    profile: "Profaịlụ",
    signOut: "Pụọ",
    workspaces: "Ebe ọrụ",
    protectedAccess: "Nchedo ohere LETW",
    protectedAccessDescription: "A ga-akpọrịrị akaụntụ @letw.org òkù tupu ha enwee ike iji ọrụ ahụ."
  },
  es: {
    aiAssistant: "Asistente de IA",
    requiredForms: "Formularios obligatorios",
    calendar: "Calendario",
    analytics: "Análisis",
    operations: "Personas y operaciones",
    admin: "Administración",
    profile: "Perfil",
    signOut: "Cerrar sesión",
    workspaces: "Espacios de trabajo",
    protectedAccess: "Acceso LETW protegido",
    protectedAccessDescription: "Las cuentas @letw.org deben recibir una invitación antes de usar el servicio."
  },
  pt: {
    aiAssistant: "Assistente de IA",
    requiredForms: "Formulários obrigatórios",
    calendar: "Calendário",
    analytics: "Análises",
    operations: "Pessoas e operações",
    admin: "Administração",
    profile: "Perfil",
    signOut: "Sair",
    workspaces: "Espaços de trabalho",
    protectedAccess: "Acesso LETW protegido",
    protectedAccessDescription: "As contas @letw.org devem ser convidadas antes de poderem usar o serviço."
  },
  sw: {
    aiAssistant: "Msaidizi wa AI",
    requiredForms: "Fomu zinazohitajika",
    calendar: "Kalenda",
    analytics: "Takwimu",
    operations: "Watu na shughuli",
    admin: "Usimamizi",
    profile: "Wasifu",
    signOut: "Ondoka",
    workspaces: "Nafasi za kazi",
    protectedAccess: "Ufikiaji wa LETW uliolindwa",
    protectedAccessDescription: "Akaunti za @letw.org lazima zialikwe kabla ya kutumia huduma."
  },
  de: {
    aiAssistant: "KI-Assistent",
    requiredForms: "Pflichtformulare",
    calendar: "Kalender",
    analytics: "Analysen",
    operations: "Personen und Abläufe",
    admin: "Verwaltung",
    profile: "Profil",
    signOut: "Abmelden",
    workspaces: "Arbeitsbereiche",
    protectedAccess: "Geschützter LETW-Zugang",
    protectedAccessDescription: "@letw.org-Konten müssen eingeladen werden, bevor sie den Dienst nutzen können."
  }
};

export function normalizeLocale(value?: string | null): AppLocale {
  return supportedLocales.includes(value as AppLocale) ? (value as AppLocale) : "en";
}

export function appMessages(value?: string | null) {
  return messages[normalizeLocale(value)];
}

export function localeEnglishName(locale: AppLocale) {
  return localeOptions.find((option) => option.value === locale)?.englishName ?? "English";
}
