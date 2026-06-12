# LETW Enterprise Feature Setup

The application code includes the enterprise collaboration suite, but several
features depend on external services. Add these values in Vercel under
**Project Settings > Environment Variables**, then redeploy.

## 1. Realtime chat

Create an Ably application and copy its API key:

```text
ABLY_API_KEY=your-ably-api-key
```

The browser requests a short-lived, user-scoped token from LETW. It never
receives the server API key. Without Ably, chat remains usable with a slower
fallback refresh.

Documentation: https://ably.com/docs/getting-started/nextjs

## 2. Browser document editing

Run an OnlyOffice Document Server on a public HTTPS address, then set:

```text
ONLYOFFICE_DOCUMENT_SERVER_URL=https://office.example.org
ONLYOFFICE_JWT_SECRET=use-the-same-long-secret-configured-in-onlyoffice
```

The LETW file menu displays **Edit** for supported Office documents. OnlyOffice
downloads the authorized source through LETW and sends saved versions back to
the signed callback endpoint.

Documentation: https://api.onlyoffice.com/docs/docs-api/usage-api/doceditor/

## 3. Meeting transcription

Create an OpenAI API key and set:

```text
OPENAI_API_KEY=your-openai-api-key
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

Authorized meeting organizers can upload meeting audio. LETW stores the
transcript, creates a searchable summary, and extracts action items. A manual
transcript can also be pasted when no API key is configured.

Documentation: https://platform.openai.com/docs/guides/speech-to-text

## 4. Notifications and monitoring

Generate a long random value:

```text
CRON_SECRET=your-long-random-secret
```

The included Vercel Hobby-compatible schedule sends notification digests once
daily and performs a daily system check. Vercel Pro can use the following
faster schedules in `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/notifications", "schedule": "*/10 * * * *" },
    { "path": "/api/cron/monitor", "schedule": "*/15 * * * *" }
  ]
}
```

Vercel Hobby rejects schedules that run more than once per day.

Documentation: https://vercel.com/docs/cron-jobs/usage-and-pricing

## 5. Android and iOS

The Expo mobile shell is in `mobile/`.

```powershell
cd mobile
npm install
npx eas-cli@latest init
```

Replace `REPLACE_WITH_EXPO_PROJECT_ID` in `mobile/app.json`, set
`EXPO_PUBLIC_LETW_URL=https://sharepoints.letw.org`, and run:

```powershell
npx eas-cli@latest build --platform android
npx eas-cli@latest build --platform ios
```

The mobile app uses the normal invitation-only LETW login and registers its
Expo push token after authentication.

Documentation: https://docs.expo.dev/push-notifications/push-notifications-setup/

## 6. Existing required services

Keep these configured:

- Neon PostgreSQL through `DATABASE_URL`
- Cloudflare R2 through the `AWS_*` compatibility variables
- Resend through `RESEND_API_KEY` and `EMAIL_FROM`
- Auth.js through `AUTH_SECRET` and `AUTH_URL`

After adding or changing variables, redeploy the Vercel production deployment.
Check `/api/health` while signed in to confirm database, storage, realtime,
document editing, and notification status.
