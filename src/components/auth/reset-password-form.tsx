"use client";

import Image from "next/image";
import Link from "next/link";
import { KeyRound, Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ResetPasswordResponse = {
  message?: string;
  error?: string;
};

type ResetPasswordFormProps = {
  email: string;
  token: string;
};

export function ResetPasswordForm({ email, token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        token,
        password: String(formData.get("password")),
        confirmPassword: String(formData.get("confirmPassword"))
      })
    });
    const data = (await response.json()) as ResetPasswordResponse;

    setIsSubmitting(false);

    if (!response.ok) {
      setError(data.error ?? "Password reset failed.");
      return;
    }

    router.push("/login?reset=1");
    router.refresh();
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
        <h1 className="mt-2 text-2xl font-semibold text-ink">Choose new password</h1>
      </div>

      {email && token ? (
        <form className="space-y-4" method="post" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" value={email} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Change password
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">
            This reset link is missing information. Request a new password reset link.
          </p>
          <Button className="w-full" type="button" onClick={() => router.push("/forgot-password")}>
            Request new link
          </Button>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-ink/60">
        Back to{" "}
        <Link className="font-medium text-moss hover:underline" href="/login">
          sign in
        </Link>
      </p>
    </div>
  );
}
