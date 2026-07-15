import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function ExternalGuestPortalPage({ params }: PageProps) {
  const { token } = await params;
  const now = new Date();
  const guest = await prisma.externalGuestAccess.findUnique({ where: { token } });

  if (!guest || guest.revokedAt || guest.status !== "ACTIVE" || guest.expiresAt <= now) {
    return (
      <main className="min-h-screen bg-paper px-6 py-12">
        <section className="mx-auto max-w-xl rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
          <Badge className="bg-clay/10 text-clay">Unavailable</Badge>
          <h1 className="mt-4 text-2xl font-semibold text-ink">Guest access is not active</h1>
          <p className="mt-2 text-sm leading-6 text-ink/60">This secure LETW guest link is expired, revoked, or invalid. Please contact the LETW administrator who invited you.</p>
          <Link className="mt-5 inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium text-ink hover:bg-mint/40" href="/login">
            LETW sign in
          </Link>
        </section>
      </main>
    );
  }

  await prisma.externalGuestAccess.update({
    where: { id: guest.id },
    data: { lastViewedAt: now }
  }).catch(() => null);

  const [workspace, file] = await Promise.all([
    guest.workspaceId
      ? prisma.workspace.findFirst({ where: { id: guest.workspaceId, deletedAt: null }, select: { id: true, name: true, description: true } })
      : null,
    guest.fileId
      ? prisma.file.findFirst({ where: { id: guest.fileId, deletedAt: null }, select: { id: true, fileName: true, fileType: true, size: true } })
      : null
  ]);

  return (
    <main className="min-h-screen bg-paper px-6 py-12">
      <section className="mx-auto max-w-3xl rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-semibold text-moss">
          <ShieldCheck className="h-4 w-4" />
          LETW secure external guest portal
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-ink">Welcome, {guest.name}</h1>
        <p className="mt-2 text-sm leading-6 text-ink/60">
          This portal gives temporary, limited access only to the information explicitly approved by LETW. It does not open
          the full collaboration system.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Info label="Guest email" value={guest.email} />
          <Info label="Guest type" value={guest.guestType} />
          <Info label="Organization" value={guest.organization ?? "Not provided"} />
          <Info label="Expires" value={formatDate(guest.expiresAt)} />
        </div>

        <div className="mt-5 rounded-lg border border-ink/10 bg-paper p-4">
          <p className="text-xs font-semibold uppercase text-ink/50">Purpose</p>
          <p className="mt-2 text-sm leading-6 text-ink/70">{guest.purpose}</p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-ink/10 p-4">
            <p className="text-xs font-semibold uppercase text-ink/50">Workspace scope</p>
            <p className="mt-2 font-medium text-ink">{workspace?.name ?? "Specific file only"}</p>
            {workspace?.description ? <p className="mt-1 text-sm text-ink/55">{workspace.description}</p> : null}
          </div>
          <div className="rounded-lg border border-ink/10 p-4">
            <p className="text-xs font-semibold uppercase text-ink/50">Document scope</p>
            <p className="mt-2 font-medium text-ink">{file?.fileName ?? "No document preview attached"}</p>
            {file ? (
              <Link className="mt-3 inline-flex h-10 items-center rounded-md bg-moss px-4 text-sm font-medium text-white hover:bg-[#185747]" href={`/api/guest/${token}/file`} target="_blank">
                Open protected preview
              </Link>
            ) : null}
          </div>
        </div>

        <p className="mt-6 rounded-md bg-mint px-4 py-3 text-xs leading-5 text-moss">
          Security note: this link can be revoked any time. It expires automatically and does not grant login, chat, workspace
          membership, download authority, or access to other LETW records.
        </p>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink/10 bg-paper p-3">
      <p className="text-xs font-semibold uppercase text-ink/50">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
