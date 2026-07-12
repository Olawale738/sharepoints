import { ApiError } from "@/lib/api";

export type AiTextProvider = "openai" | "anthropic";

type GenerateAiTextInput = {
  instructions: string;
  input: string;
  temperature?: number;
  maxTokens?: number;
  openAiModel?: string;
  anthropicModel?: string;
};

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
  error?: { message?: string };
};

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string };
};

function providerPreference() {
  return (process.env.AI_PROVIDER ?? "auto").trim().toLowerCase();
}

function normalizedProvider(value: string): AiTextProvider | "auto" {
  if (value === "anthropic" || value === "claude") return "anthropic";
  if (value === "openai" || value === "openapi") return "openai";
  return "auto";
}

export function resolveAiTextProvider(): AiTextProvider | null {
  const preferred = normalizedProvider(providerPreference());
  if (preferred === "openai") return process.env.OPENAI_API_KEY ? "openai" : null;
  if (preferred === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function isAiTextConfigured() {
  return Boolean(resolveAiTextProvider());
}

function extractOpenAiOutput(body: OpenAiResponse) {
  return (
    body.output_text ??
    body.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text ?? "")
      .join("")
      .trim() ??
    ""
  );
}

function extractAnthropicOutput(body: AnthropicResponse) {
  return body.content
    ?.filter((item) => item.type === "text" || item.text)
    .map((item) => item.text ?? "")
    .join("")
    .trim() ?? "";
}

export async function generateAiText(input: GenerateAiTextInput) {
  const provider = resolveAiTextProvider();
  if (!provider) {
    throw new ApiError(503, "AI is not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
  }

  if (provider === "anthropic") {
    const model = input.anthropicModel ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": process.env.ANTHROPIC_VERSION ?? "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        max_tokens: input.maxTokens ?? 1600,
        temperature: input.temperature ?? 0.2,
        system: input.instructions,
        messages: [{ role: "user", content: input.input }]
      })
    });
    const body = (await response.json().catch(() => null)) as AnthropicResponse | null;
    if (!response.ok || !body) {
      throw new ApiError(502, body?.error?.message ?? "Claude service failed.");
    }
    const text = extractAnthropicOutput(body);
    if (!text) throw new ApiError(502, "Claude returned an empty answer.");
    return { text, provider, model };
  }

  const model = input.openAiModel ?? process.env.OPENAI_ASSISTANT_MODEL ?? "gpt-5-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions: input.instructions,
      input: input.input,
      temperature: input.temperature
    })
  });
  const body = (await response.json().catch(() => null)) as OpenAiResponse | null;
  if (!response.ok || !body) {
    throw new ApiError(502, body?.error?.message ?? "OpenAI service failed.");
  }
  const text = extractOpenAiOutput(body);
  if (!text) throw new ApiError(502, "OpenAI returned an empty answer.");
  return { text, provider, model };
}

