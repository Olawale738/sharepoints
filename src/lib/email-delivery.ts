const resendFromPattern = /^(?:[^<>\r\n]+<[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>|[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+)$/;

export function hasEmailDeliveryConfig() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function getValidatedEmailFrom() {
  const from = process.env.EMAIL_FROM?.trim();

  if (!from) {
    return null;
  }

  if (!resendFromPattern.test(from)) {
    throw new Error('EMAIL_FROM must look like "no-reply@letw.org" or "LETW <no-reply@letw.org>".');
  }

  return from;
}
