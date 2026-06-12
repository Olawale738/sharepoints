function summarizeTranscript(text: string) {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  return sentences.slice(0, 6).join(" ").slice(0, 1800);
}

function extractActionItems(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidates = lines.filter((line) =>
    /(?:action|todo|follow up|will|must|assign|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i.test(line)
  );
  return Array.from(new Set(candidates)).slice(0, 20);
}

export async function transcribeAudio(file: File) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured. Paste a manual transcript instead.");
  }

  const form = new FormData();
  form.append("file", file, file.name || "meeting-audio.webm");
  form.append("model", process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe");
  form.append("response_format", "json");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form
  });
  const result = (await response.json()) as { text?: string; error?: { message?: string } };
  if (!response.ok || !result.text) {
    throw new Error(result.error?.message ?? "Meeting transcription failed.");
  }
  return result.text;
}

export function analyzeTranscript(text: string) {
  return {
    summary: summarizeTranscript(text),
    actionItems: extractActionItems(text)
  };
}
