import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";

const translateSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  targetLanguage: z.enum(["en", "yo", "fr"])
});

const languageNames = {
  en: "English",
  yo: "Yoruba",
  fr: "French"
} as const;

export async function POST(request: Request) {
  try {
    await requireUser();
    const parsed = translateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid translation request.");
    if (!process.env.OPENAI_API_KEY) {
      throw new ApiError(503, "Translation requires OPENAI_API_KEY.");
    }
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TRANSLATION_MODEL ?? "gpt-5-mini",
        instructions:
          `Translate the user's text into ${languageNames[parsed.data.targetLanguage]}. ` +
          "Preserve names, scripture references, formatting, and meaning. Return only the translation.",
        input: parsed.data.text
      })
    });
    const body = (await response.json().catch(() => null)) as
      | {
          output_text?: string;
          output?: Array<{ content?: Array<{ text?: string }> }>;
          error?: { message?: string };
        }
      | null;
    if (!response.ok || !body) {
      throw new ApiError(502, body?.error?.message ?? "Translation service failed.");
    }
    const translation =
      body.output_text ??
      body.output
        ?.flatMap((item) => item.content ?? [])
        .map((item) => item.text ?? "")
        .join("")
        .trim() ??
      "";
    if (!translation) throw new ApiError(502, "The translation service returned an empty response.");
    return ok({ translation, targetLanguage: parsed.data.targetLanguage });
  } catch (error) {
    return handleRouteError(error);
  }
}
