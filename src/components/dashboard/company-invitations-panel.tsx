"use client";

import { FormEvent, useMemo, useState } from "react";
import { Check, Copy, Loader2, MailPlus, Search, Send, ShieldX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type CompanyInvitation = {
  id: string;
  email: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  isAdminProtected?: boolean;
  invitedBy?: {
    name?: string | null;
    email?: string | null;
  } | null;
  acceptedBy?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

type CompanyInvitationsPanelProps = {
  invitations: CompanyInvitation[];
};

export function CompanyInvitationsPanel({ invitations: initialInvitations }: CompanyInvitationsPanelProps) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [revokingId, setRevokingId] = useState("");
  const [copyingId, setCopyingId] = useState("");
  const [resendingId, setResendingId] = useState("");
  const [query, setQuery] = useState("");

  const invitationStats = useMemo(
    () =>
      invitations.reduce(
        (stats, invitation) => {
          if (invitation.revokedAt) {
            return { ...stats, revoked: stats.revoked + 1 };
          }

          if (invitation.acceptedAt) {
            return { ...stats, accepted: stats.accepted + 1 };
          }

          return { ...stats, pending: stats.pending + 1 };
        },
        { pending: 0, accepted: 0, revoked: 0 }
      ),
    [invitations]
  );
  const filteredInvitations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return invitations;
    }

    return invitations.filter((invitation) =>
      [
        invitation.email,
        invitation.acceptedAt ? "accepted registered" : "",
        invitation.revokedAt ? "revoked" : "",
        !invitation.acceptedAt && !invitation.revokedAt ? "pending invited" : "",
        invitation.invitedBy?.name ?? "",
        invitation.invitedBy?.email ?? "",
        invitation.acceptedBy?.name ?? "",
        invitation.acceptedBy?.email ?? ""
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [invitations, query]);

  function inviteLink(email: string) {
    const path = `/register?email=${encodeURIComponent(email)}`;

    if (typeof window === "undefined") {
      return path;
    }

    return `${window.location.origin}${path}`;
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  }

  async function copyInviteLink(invitation: CompanyInvitation) {
    setCopyingId(invitation.id);
    await copyText(inviteLink(invitation.email));
    setStatus(`Registration link copied for ${invitation.email}.`);
    window.setTimeout(() => setCopyingId(""), 1600);
  }

  async function inviteCompanyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    setIsInviting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/company-invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(formData.get("email"))
      })
    });
    setIsInviting(false);

    const data = (await response.json().catch(() => null)) as {
      invitation?: CompanyInvitation;
      invitationUrl?: string;
      emailSent?: boolean;
      message?: string;
      error?: string;
    } | null;

    if (!response.ok || !data?.invitation) {
      setError(data?.error ?? "This email could not be invited.");
      return;
    }

    setInvitations((current) => {
      const withoutDuplicate = current.filter((invitation) => invitation.id !== data.invitation?.id);
      return [data.invitation as CompanyInvitation, ...withoutDuplicate];
    });
    form.reset();

    if (data.emailSent) {
      setStatus(data.message ?? `Invitation email sent to ${data.invitation.email}.`);
      return;
    }

    if (data.invitationUrl) {
      await copyText(data.invitationUrl);
      setStatus(
        `${data.invitation.email} can now register. Email delivery is not configured, so the invitation link was copied.`
      );
      return;
    }

    setStatus(data.message ?? `${data.invitation.email} can now register and use the service.`);
  }

  async function revokeInvitation(invitationId: string) {
    setError("");
    setStatus("");
    setRevokingId(invitationId);

    const response = await fetch(`/api/company-invitations/${invitationId}`, {
      method: "DELETE"
    });
    setRevokingId("");

    const data = (await response.json().catch(() => null)) as {
      invitation?: CompanyInvitation;
      error?: string;
    } | null;

    if (!response.ok || !data?.invitation) {
      setError(data?.error ?? "This access invitation could not be revoked.");
      return;
    }

    setInvitations((current) =>
      current.map((invitation) => (invitation.id === data.invitation?.id ? data.invitation as CompanyInvitation : invitation))
    );
    setStatus(`${data.invitation.email} can no longer use the service unless invited again.`);
  }

  async function resendInvitation(invitation: CompanyInvitation) {
    setError("");
    setStatus("");
    setResendingId(invitation.id);

    const response = await fetch(`/api/company-invitations/${invitation.id}/resend`, {
      method: "POST"
    });
    setResendingId("");

    const data = (await response.json().catch(() => null)) as {
      invitation?: CompanyInvitation;
      invitationUrl?: string;
      emailSent?: boolean;
      message?: string;
      error?: string;
    } | null;

    if (!response.ok || !data?.invitation) {
      setError(data?.error ?? "Invitation email could not be resent.");
      return;
    }

    if (data.invitationUrl && !data.emailSent) {
      await copyText(data.invitationUrl);
    }

    setStatus(data.message ?? `Invitation email resent to ${invitation.email}.`);
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <MailPlus className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Access invitations</h2>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-md border border-ink/10 bg-paper px-3 py-2">
            <p className="font-medium text-ink">{invitationStats.pending}</p>
            <p className="text-ink/50">Pending</p>
          </div>
          <div className="rounded-md border border-ink/10 bg-paper px-3 py-2">
            <p className="font-medium text-ink">{invitationStats.accepted}</p>
            <p className="text-ink/50">Registered</p>
          </div>
          <div className="rounded-md border border-ink/10 bg-paper px-3 py-2">
            <p className="font-medium text-ink">{invitationStats.revoked}</p>
            <p className="text-ink/50">Revoked</p>
          </div>
        </div>
      </div>
      <form className="mb-4 flex flex-col gap-2 sm:flex-row" onSubmit={inviteCompanyEmail}>
        <Input name="email" placeholder="person@letw.org" type="email" required />
        <Button className="shrink-0" type="submit" disabled={isInviting}>
          {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}
          Invite
        </Button>
      </form>
      {error ? <p className="mb-3 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
      {status ? <p className="mb-3 rounded-md bg-mint px-3 py-2 text-sm text-ink">{status}</p> : null}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
        <Input
          className="pl-9"
          placeholder="Search invited, registered, pending, or revoked users"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="space-y-3">
        {invitations.length === 0 ? <p className="text-sm text-ink/55">No access invitations yet.</p> : null}
        {invitations.length > 0 && filteredInvitations.length === 0 ? (
          <p className="rounded-md bg-paper px-3 py-4 text-sm text-ink/55">No invitations match that search.</p>
        ) : null}
        {filteredInvitations.map((invitation) => {
          const isRevoked = Boolean(invitation.revokedAt);
          const isAccepted = Boolean(invitation.acceptedAt);
          const showRevoke = !invitation.isAdminProtected;
          const canResend = !isRevoked && !isAccepted;

          return (
            <div key={invitation.id} className="rounded-md border border-ink/10 bg-paper p-3 text-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-ink">{invitation.email}</p>
                    <Badge className={isRevoked ? "bg-clay/10 text-clay" : isAccepted ? "bg-mint" : "bg-wheat"}>
                      {isRevoked ? "Revoked" : isAccepted ? "Accepted" : "Invited"}
                    </Badge>
                    {invitation.isAdminProtected ? <Badge className="bg-moss text-white">admin protected</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-ink/50">
                    Invited {formatDate(invitation.createdAt)}
                    {invitation.invitedBy ? ` by ${invitation.invitedBy.name ?? invitation.invitedBy.email}` : ""}
                  </p>
                  {invitation.acceptedAt ? (
                    <p className="mt-1 text-xs text-ink/50">
                      Accepted {formatDate(invitation.acceptedAt)}
                      {invitation.acceptedBy ? ` by ${invitation.acceptedBy.name ?? invitation.acceptedBy.email}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {canResend ? (
                    <Button
                      className="h-9"
                      variant="secondary"
                      disabled={resendingId === invitation.id}
                      onClick={() => resendInvitation(invitation)}
                    >
                      {resendingId === invitation.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Resend
                    </Button>
                  ) : null}
                  <Button
                    className="h-9"
                    variant="secondary"
                    disabled={isRevoked}
                    onClick={() => copyInviteLink(invitation)}
                  >
                    {copyingId === invitation.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    Copy link
                  </Button>
                  {showRevoke ? (
                    <Button
                      className="h-9"
                      variant="secondary"
                      disabled={isRevoked || revokingId === invitation.id}
                      onClick={() => revokeInvitation(invitation.id)}
                    >
                      {revokingId === invitation.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldX className="h-4 w-4" />
                      )}
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
