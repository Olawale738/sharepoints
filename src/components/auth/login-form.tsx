"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") ?? "/dashboard";
  const resetSuccessful = searchParams?.get("reset") === "1";
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      email: String(formData.get("email")),
      password: String(formData.get("password")),
      otp: String(formData.get("otp") ?? ""),
      redirect: false,
      callbackUrl
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError("Email or password is incorrect.");
      return;
    }

    router.push(callbackUrl);
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
        <h1 className="mt-2 text-2xl font-semibold text-ink">Sign in</h1>
      </div>

      <form className="space-y-4" method="post" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password">Password</Label>
            <Link className="text-sm font-medium text-moss hover:underline" href="/forgot-password">
              Forgot password?
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="otp">Authenticator code</Label>
          <Input
            id="otp"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="Only if two-factor authentication is enabled"
          />
        </div>
        {resetSuccessful ? (
          <p className="rounded-md bg-mint/60 px-3 py-2 text-sm text-ink/80">
            Password changed. Sign in with your new password.
          </p>
        ) : null}
        {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink/60">
        Have an invitation?{" "}
        <Link className="font-medium text-moss hover:underline" href="/register">
          Create an account
        </Link>
      </p>
    </div>
  );
}
