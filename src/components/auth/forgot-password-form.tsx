"use client";

import Image from "next/image";
import Link from "next/link";
import { KeyRound, Loader2, Mail } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ForgotPasswordResponse = {
  message?: string;
  resetUrl?: string;
  error?: string;
};

export function ForgotPasswordForm() {
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    setResetUrl("");
    setError("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: String(formData.get("email"))
      })
    });
    const data = (await response.json()) as ForgotPasswordResponse;

    setIsSubmitting(false);

    if (!response.ok) {
      setError(data.error ?? "Password reset request failed.");
      return;
    }

    setMessage(data.message ?? "If this invited LETW account exists, a password reset link has been sent.");
    setResetUrl(data.resetUrl ?? "");
  }

  return (
    <div className="w-full max-w-md rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
      <div className="mb-6 text-center">
        <Image
          src="/letw-logo.png"
          alt="LETW logo"
          width={180}
          height={180}
          className="mx-auto h-24 w-auto object-contain"
          priority
        />
        <p className="text-sm font-semibold uppercase text-moss">LETW</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Reset password</h1>
      </div>

      <form className="space-y-4" method="post" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Invited LETW email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="person@letw.org" required />
        </div>

        {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
        {message ? <p className="rounded-md bg-mint/60 px-3 py-2 text-sm text-ink/80">{message}</p> : null}
        {resetUrl ? (
          <div className="space-y-2 rounded-md border border-moss/20 bg-moss/5 p-3 text-sm text-ink/70">
            <p className="font-medium text-ink">Local development reset link</p>
            <Link className="break-all text-moss hover:underline" href={resetUrl}>
              {resetUrl}
            </Link>
          </div>
        ) : null}

        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink/60">
        Remembered it?{" "}
        <Link className="font-medium text-moss hover:underline" href="/login">
          Sign in
        </Link>
      </p>

      <p className="mt-4 flex items-start gap-2 rounded-md bg-paper px-3 py-2 text-xs text-ink/60">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-moss" />
        Only invited @letw.org accounts can receive password reset links.
      </p>
    </div>
  );
}
