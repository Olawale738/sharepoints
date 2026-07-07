import { createHmac, timingSafeEqual } from "crypto";

export type WhatsAppMode = "TEXT" | "TEMPLATE";

export type WhatsAppDeliveryResult = {
  sent: boolean;
  skipped: boolean;
  phone?: string;
  messageId?: string;
  error?: string;
  statusCode?: number;
};

export function normalizeWhatsAppPhone(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const countryCode = (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "").replace(/\D/g, "");
  let digits = trimmed.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  } else {
    digits = digits.replace(/\D/g, "");
    if (digits.startsWith("00")) {
      digits = digits.slice(2);
    } else if (digits.startsWith("0") && countryCode) {
      digits = `${countryCode}${digits.slice(1)}`;
    }
  }

  if (!/^\d{8,15}$/.test(digits)) return null;
  return digits;
}

export function getWhatsAppConfig() {
  return {
    configured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    token: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION ?? "v20.0",
    defaultCountryCodeConfigured: Boolean(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE),
    fallbackTemplateName: process.env.WHATSAPP_TEMPLATE_NAME,
    fallbackTemplateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en",
    templateHasBodyParams: process.env.WHATSAPP_TEMPLATE_HAS_BODY_PARAMS !== "false"
  };
}

function getWhatsAppError(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string } }).error;
  if (!error) return null;
  return [
    error.message,
    error.code ? `code ${error.code}` : null,
    error.error_subcode ? `subcode ${error.error_subcode}` : null,
    error.fbtrace_id ? `trace ${error.fbtrace_id}` : null
  ]
    .filter(Boolean)
    .join(" - ");
}

function getWhatsAppMessageId(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const messages = (payload as { messages?: Array<{ id?: string }> }).messages;
  return messages?.[0]?.id;
}

export function buildWhatsAppTextBody(title: string, body: string, href?: string | null) {
  const origin = (process.env.AUTH_URL ?? "https://sharepoints.letw.org").replace(/\/$/, "");
  const link = href ? `${origin}${href.startsWith("/") ? href : `/${href}`}` : null;
  return [title, "", body, link ? `Open in LETW: ${link}` : null].filter(Boolean).join("\n").slice(0, 3900);
}

export async function sendWhatsAppMessage(input: {
  phone: string;
  title: string;
  body: string;
  href?: string | null;
  mode: WhatsAppMode;
  templateName?: string | null;
  templateLanguage?: string | null;
}): Promise<WhatsAppDeliveryResult> {
  const config = getWhatsAppConfig();

  if (!config.configured || !config.token || !config.phoneNumberId) {
    return { sent: false, skipped: true, phone: input.phone, error: "WhatsApp provider is not configured." };
  }

  const templateName = input.templateName || config.fallbackTemplateName;
  const templateLanguage = input.templateLanguage || config.fallbackTemplateLanguage;
  if (input.mode === "TEMPLATE" && !templateName) {
    return {
      sent: false,
      skipped: true,
      phone: input.phone,
      error: "WhatsApp template mode selected, but no template name was provided."
    };
  }

  const payload =
    input.mode === "TEMPLATE"
      ? {
          messaging_product: "whatsapp",
          to: input.phone,
          type: "template",
          template: {
            name: templateName,
            language: { code: templateLanguage },
            ...(config.templateHasBodyParams
              ? {
                  components: [
                    {
                      type: "body",
                      parameters: [
                        { type: "text", text: input.title.slice(0, 512) },
                        { type: "text", text: input.body.slice(0, 1024) }
                      ]
                    }
                  ]
                }
              : {})
          }
        }
      : {
          messaging_product: "whatsapp",
          to: input.phone,
          type: "text",
          text: {
            preview_url: true,
            body: buildWhatsAppTextBody(input.title, input.body, input.href)
          }
        };

  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = (await response.json().catch(() => null)) as unknown;

  return {
    sent: response.ok,
    skipped: false,
    phone: input.phone,
    statusCode: response.status,
    messageId: response.ok ? getWhatsAppMessageId(body) : undefined,
    error: response.ok ? undefined : getWhatsAppError(body) ?? `WhatsApp request failed with HTTP ${response.status}.`
  };
}

export function verifyWhatsAppWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true;
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = Buffer.from(`sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`);
  const actual = Buffer.from(signatureHeader);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
