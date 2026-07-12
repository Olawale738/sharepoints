import { z } from "zod";

import { generateAiText, isAiTextConfigured } from "@/lib/ai-provider";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { localeEnglishName, supportedLocales } from "@/lib/i18n";

const translateSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  targetLanguage: z.enum(supportedLocales)
});

export async function POST(request: Request) {
  try {
    await requireUser();
    const parsed = translateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid translation request.");
    if (!isAiTextConfigured()) {
      throw new ApiError(503, "Translation requires OPENAI_API_KEY or ANTHROPIC_API_KEY.");
    }
    const generated = await generateAiText({
      openAiModel: process.env.OPENAI_TRANSLATION_MODEL ?? "gpt-5-mini",
      anthropicModel: process.env.ANTHROPIC_TRANSLATION_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
      instructions:
        `Translate the user's text into ${localeEnglishName(parsed.data.targetLanguage)}. ` +
        "Preserve names, scripture references, formatting, and meaning. Return only the translation.",
      input: parsed.data.text,
      maxTokens: 3000
    });
    const translation = generated.text;
    if (!translation) throw new ApiError(502, "The translation service returned an empty response.");
    return ok({ translation, targetLanguage: parsed.data.targetLanguage });
  } catch (error) {
    return handleRouteError(error);
  }
}
