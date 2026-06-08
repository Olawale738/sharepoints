"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RegisterFormProps = {
  initialEmail?: string;
};

export function RegisterForm({ initialEmail = "" }: RegisterFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name")),
      email: String(formData.get("email")),
      password: String(formData.get("password"))
    };

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Could not create this account.");
      setIsSubmitting(false);
      return;
    }

    const result = await signIn("credentials", {
      email: payload.email,
      password: payload.password,
      redirect: false,
      callbackUrl: "/dashboard"
    });

    setIsSubmitting(false);

    if (result?.error) {
      router.push("/login");
      return;
    }

    router.push("/dashboard");
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
        <h1 className="mt-2 text-2xl font-semibold text-ink">Create account</h1>
        <p className="mt-2 text-sm text-ink/55">Registration is invitation-only.</p>
      </div>

      <form className="space-y-4" method="post" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={initialEmail}
            readOnly={Boolean(initialEmail)}
            className={initialEmail ? "bg-ink/[0.03] text-ink/70" : undefined}
            required
          />
          {initialEmail ? (
            <p className="text-xs text-ink/50">This registration link is tied to this invited email address.</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink/60">
        Already registered?{" "}
        <Link className="font-medium text-moss hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
