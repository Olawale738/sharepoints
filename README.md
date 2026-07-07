# LETW Collaboration

A production-ready MVP for `letw.org`: a custom SharePoint-style collaboration
platform with workspaces, folders, file libraries, role-based access, activity
logs, NextAuth authentication, PostgreSQL, Prisma, TailwindCSS, and AWS S3 file
storage.

## Stack

- Next.js App Router with TypeScript
- TailwindCSS
- Next.js route handlers for REST APIs
- PostgreSQL with Prisma ORM
- AWS S3 for private object storage and signed downloads
- NextAuth/Auth.js with email/password credentials

## Project Structure

```text
.
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   ├── files/
│   │   │   └── workspaces/
│   │   ├── dashboard/
│   │   ├── login/
│   │   ├── register/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   ├── lib/
│   └── types/
├── auth.ts
├── docker-compose.yml
├── next.config.mjs
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment file:

```bash
cp .env.example .env
```

3. Start PostgreSQL:

```bash
docker compose up -d postgres
```

4. Fill in `.env` with your Auth.js secret, email delivery credentials, and AWS
   S3/R2 bucket credentials.

5. Apply the database schema:

```bash
npm run prisma:migrate
```

6. Add demo data:

```bash
npm run seed
```

The seed creates the admin account from `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD`, plus a starter workspace named `LETW Central`. Keep the
seed password private and change it before using a shared environment.

7. Start the app:

```bash
npm run dev
```

The app runs at `http://localhost:3000`.

## Required Environment Variables

```bash
DATABASE_URL="postgresql://letw:letw_password@localhost:55432/letw_collab?schema=public"
AUTH_SECRET="replace-with-a-strong-random-secret"
AUTH_URL="http://localhost:3000"
SEED_ADMIN_EMAIL="president@letw.org"
SEED_ADMIN_PASSWORD="replace-with-a-private-admin-password"
RESEND_API_KEY=""
EMAIL_FROM="LETW <no-reply@letw.org>"
WHATSAPP_ACCESS_TOKEN=""
WHATSAPP_PHONE_NUMBER_ID=""
WHATSAPP_GRAPH_VERSION="v20.0"
WHATSAPP_DEFAULT_COUNTRY_CODE="234"
WHATSAPP_TEMPLATE_NAME=""
WHATSAPP_TEMPLATE_LANGUAGE="en"
WHATSAPP_TEMPLATE_HAS_BODY_PARAMS="true"
AWS_REGION="auto"
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_S3_BUCKET=""
AWS_S3_ENDPOINT=""
AWS_S3_PUBLIC_BASE_URL=""
AWS_S3_FORCE_PATH_STYLE="true"
MAX_UPLOAD_BYTES="52428800"
```

## Core Capabilities

- Register and sign in with email/password only, using an emailed invitation for an `@letw.org` address.
- Reset forgotten passwords with a short-lived email link for invited `@letw.org` accounts.
- Admins and assigned leaders create workspaces for teams or projects.
- Admins can see all workspaces, assign admin/leader/moderator/user roles, configure leader/moderator permissions, and delete any workspace.
- Admins can suspend, restore, revoke, and delete user access while preserving document and audit history.
- Join workspaces with a workspace ID and join code, receiving viewer access by default.
- Manage workspace members with admin, editor, and viewer roles.
- Create nested folders.
- Upload PDF, DOCX, image, spreadsheet, and general document files to S3.
- List, download, and delete files with backend-enforced permissions.
- Record audit activity for workspace creation, joins, folder creation, uploads,
  and deletes.

## REST API

- `GET /api/workspaces`
- `POST /api/workspaces`
- `POST /api/workspaces/:id/join`
- `GET /api/workspaces/:id/members`
- `PATCH /api/workspaces/:id/members/:memberId`
- `DELETE /api/workspaces/:id/members/:memberId`
- `GET /api/workspaces/:id/files`
- `GET /api/workspaces/:id/folders`
- `POST /api/workspaces/:id/folders`
- `POST /api/files/upload`
- `DELETE /api/files/:id`
- `GET /api/files/:id/download`
- `GET /api/profile`
- `PATCH /api/profile`
- `POST /api/auth/*`

## Security Notes

- API routes require an authenticated session for workspace, folder, and file
  operations.
- Registration and sign-in are restricted to active invitations for `@letw.org`
  email addresses.
- Google login is intentionally disabled. LETW access is email/password only for
  invited organization emails.
- Suspended, revoked, and deleted users cannot sign in. Existing sessions are
  removed when an admin changes a user's access status.
- Workspace creation is restricted to users who are admins or assigned leaders
  in at least one workspace.
- Workspace deletion is restricted to admins and removes the workspace database
  records plus stored file objects.
- Workspace membership is checked server-side on every resource access.
- Admins and editors can upload and delete files.
- Viewers can list and download files only.
- S3 objects are private by default. Downloads use short-lived signed URLs.
- Passwords are hashed with bcrypt before storage.
- Password reset tokens are stored hashed, expire after 60 minutes, and can only be used by active invited `@letw.org` accounts.

## Email Delivery

Invitation emails and forgot-password links use the `RESEND_API_KEY` and
`EMAIL_FROM` environment variables. In production, configure Resend before
inviting users or relying on password reset emails. In local development, the
invitation form copies the registration link if email delivery is not configured,
and the reset form shows a development reset link after a valid invited account
requests one.

## WhatsApp Broadcast Delivery

Admin notification broadcasts can send in-app, email, and WhatsApp messages.
For WhatsApp, configure Meta WhatsApp Cloud API variables in Vercel:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_VERSION`, for example `v20.0`
- `WHATSAPP_DEFAULT_COUNTRY_CODE`, for local phone numbers such as `234`
- Optional `WHATSAPP_TEMPLATE_NAME` and `WHATSAPP_TEMPLATE_LANGUAGE`

Use free-form WhatsApp text only when the member is inside the active WhatsApp
service window. For first-time or organization-initiated broadcasts, use an
approved WhatsApp template. The default template mode expects two body variables:
`{{1}}` for the title and `{{2}}` for the message body.

## Enterprise Collaboration Suite

- Ably WebSocket chat with scoped tokens and fallback refresh
- Forwarding across authorized channels, direct chats, and organization rooms
- OnlyOffice browser co-editing with signed save callbacks and file versions
- Upload-triggered workflow automation and approval actions
- Email digest, quiet-hour, priority, reminder, and Expo push preferences
- Complete JSON backups plus restorable files, folders, workspaces, and messages
- DLP scanning and download/share restrictions
- Searchable meeting transcripts, summaries, attendance, and action items
- Ministry, event, attendance, volunteer, follow-up, and resource-booking tools
- Safe admin role preview, workspace templates, health checks, and Playwright E2E tests
- Expo Android/iOS application shell in `mobile/`

External service activation is documented in
[`docs/ENTERPRISE_FEATURE_SETUP.md`](docs/ENTERPRISE_FEATURE_SETUP.md).
