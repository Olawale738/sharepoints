import { generateAiText, isAiTextConfigured } from "@/lib/ai-provider";
import { analyzeTranscript } from "@/lib/transcription";

export type MeetingSecretaryActionItem = {
  title: string;
  owner?: string | null;
  dueDate?: string | null;
};

export type MeetingSecretaryPack = {
  summary: string;
  decisions: string[];
  actionItems: MeetingSecretaryActionItem[];
  followUpDraft: string;
  risks: string[];
  attendanceInsight: string;
  generatedBy: "openai" | "anthropic" | "fallback";
};

type MeetingSecretaryInput = {
  title: string;
  workspaceName: string;
  description?: string | null;
  agenda?: string | null;
  notes?: string | null;
  actionItems?: string | null;
  transcript?: string | null;
  startsAt: Date;
  endsAt: Date;
  attendance: Array<{ displayName: string; joinedAt: Date; leftAt: Date | null; durationSec: number | null }>;
  rsvps: Array<{ status: string; user: { name: string | null; email: string | null } }>;
};

function compact(value?: string | null, max = 6000) {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function sourceText(input: MeetingSecretaryInput) {
  return [
    input.agenda ? `Agenda:\n${input.agenda}` : null,
    input.notes ? `Existing notes:\n${input.notes}` : null,
    input.actionItems ? `Existing action items:\n${input.actionItems}` : null,
    input.transcript ? `Transcript:\n${input.transcript}` : null
  ]
    .filter(Boolean)
    .join("\n\n");
}

function parseJsonPack(value: string) {
  const stripped = value.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const jsonText = stripped.startsWith("{") ? stripped : stripped.match(/\{[\s\S]*\}/)?.[0] ?? "";
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText) as Partial<MeetingSecretaryPack>;
  } catch {
    return null;
  }
}

function normalizePack(pack: Partial<MeetingSecretaryPack>, fallbackSummary: string, generatedBy: MeetingSecretaryPack["generatedBy"]) {
  const actionItems = Array.isArray(pack.actionItems)
    ? pack.actionItems
        .map((item) => ({
          title: compact(typeof item?.title === "string" ? item.title : "", 240),
          owner: typeof item?.owner === "string" ? compact(item.owner, 120) : null,
          dueDate: typeof item?.dueDate === "string" ? compact(item.dueDate, 80) : null
        }))
        .filter((item) => item.title)
        .slice(0, 15)
    : [];

  return {
    summary: compact(pack.summary, 2500) || fallbackSummary || "No meeting summary could be generated from the available notes.",
    decisions: Array.isArray(pack.decisions)
      ? pack.decisions.map((item) => compact(String(item), 300)).filter(Boolean).slice(0, 12)
      : [],
    actionItems,
    followUpDraft: compact(pack.followUpDraft, 2200),
    risks: Array.isArray(pack.risks) ? pack.risks.map((item) => compact(String(item), 280)).filter(Boolean).slice(0, 10) : [],
    attendanceInsight: compact(pack.attendanceInsight, 800),
    generatedBy
  };
}

function fallbackSecretary(input: MeetingSecretaryInput): MeetingSecretaryPack {
  const text = sourceText(input);
  const analysis = analyzeTranscript(text || input.description || input.title);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const decisions = lines
    .filter((line) => /(?:decided|decision|resolved|approved|agreed|concluded)/i.test(line))
    .slice(0, 10);
  const actionItems = analysis.actionItems.map((title) => ({ title }));
  const present = input.attendance.map((item) => item.displayName);
  const yes = input.rsvps.filter((item) => item.status === "YES").length;
  const maybe = input.rsvps.filter((item) => item.status === "MAYBE").length;
  const no = input.rsvps.filter((item) => item.status === "NO").length;

  return normalizePack(
    {
      summary: analysis.summary || compact(text, 1200),
      decisions,
      actionItems,
      attendanceInsight: present.length
        ? `${present.length} attendee check-in record${present.length === 1 ? "" : "s"} captured. RSVP count: ${yes} yes, ${maybe} maybe, ${no} no.`
        : `No live attendance check-in record captured. RSVP count: ${yes} yes, ${maybe} maybe, ${no} no.`,
      followUpDraft: `Hello everyone,\n\nThank you for attending ${input.title}. Please review the summary and complete the agreed action items before the next update.\n\nLETW`,
      risks: actionItems.length ? [] : ["No clear action items were detected. Confirm responsibilities manually."]
    },
    analysis.summary,
    "fallback"
  );
}

export async function generateMeetingSecretaryPack(input: MeetingSecretaryInput): Promise<MeetingSecretaryPack> {
  const text = sourceText(input);
  if (!isAiTextConfigured() || !text.trim()) {
    return fallbackSecretary(input);
  }

  const fallback = fallbackSecretary(input);
  try {
    const generated = await generateAiText({
      openAiModel: process.env.OPENAI_MEETING_SECRETARY_MODEL ?? process.env.OPENAI_ASSISTANT_MODEL ?? "gpt-5-mini",
      anthropicModel: process.env.ANTHROPIC_MEETING_SECRETARY_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
      instructions: [
        "You are LETW's AI Meeting Secretary.",
        "Use only the supplied meeting data. Do not invent attendees, decisions, or confidential facts.",
        "Return strict JSON only. Do not wrap it in markdown.",
        "Schema: { summary: string, decisions: string[], actionItems: [{ title: string, owner: string|null, dueDate: string|null }], followUpDraft: string, risks: string[], attendanceInsight: string }.",
        "Keep the tone professional, clear, and suitable for a church organization."
      ].join(" "),
      input: JSON.stringify({
        meeting: {
          title: input.title,
          workspaceName: input.workspaceName,
          description: input.description,
          startsAt: input.startsAt.toISOString(),
          endsAt: input.endsAt.toISOString()
        },
        attendance: input.attendance.map((item) => ({
          displayName: item.displayName,
          joinedAt: item.joinedAt.toISOString(),
          leftAt: item.leftAt?.toISOString() ?? null,
          durationSec: item.durationSec
        })),
        rsvps: input.rsvps.map((item) => ({
          status: item.status,
          name: item.user.name,
          email: item.user.email
        })),
        content: compact(text, 18000)
      }),
      maxTokens: 2500
    });
    const parsed = parseJsonPack(generated.text);
    if (!parsed) {
      return normalizePack({ summary: generated.text }, fallback.summary, generated.provider);
    }
    return normalizePack(parsed, fallback.summary, generated.provider);
  } catch {
    return fallback;
  }
}

export function renderMeetingSecretaryNotes(pack: MeetingSecretaryPack) {
  return [
    "AI Meeting Secretary",
    "",
    "Summary",
    pack.summary,
    "",
    "Decisions",
    ...(pack.decisions.length ? pack.decisions.map((item) => `- ${item}`) : ["- No explicit decisions captured."]),
    "",
    "Action items",
    ...(pack.actionItems.length
      ? pack.actionItems.map((item) => `- ${item.title}${item.owner ? ` (owner: ${item.owner})` : ""}${item.dueDate ? ` (due: ${item.dueDate})` : ""}`)
      : ["- No action items captured."]),
    "",
    "Attendance",
    pack.attendanceInsight || "No attendance insight generated.",
    "",
    "Risks and follow-up",
    ...(pack.risks.length ? pack.risks.map((item) => `- ${item}`) : ["- No risks detected."]),
    "",
    "Follow-up draft",
    pack.followUpDraft || "No follow-up draft generated."
  ].join("\n");
}
