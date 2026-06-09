"use client";

import { FormEvent, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MeetingPasscodeFormProps = {
  title: string;
  error?: string;
};

export function MeetingPasscodeForm({ title, error }: MeetingPasscodeFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [passcode, setPasscode] = useState("");

  function submitPasscode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!passcode.trim()) {
      return;
    }

    router.push(`${pathname}?passcode=${encodeURIComponent(passcode.trim())}`);
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
      <div className="mb-5 text-center">
        <KeyRound className="mx-auto h-8 w-8 text-moss" />
        <h1 className="mt-3 text-xl font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink/55">Enter the meeting passcode shared by the workspace admin.</p>
      </div>
      <form className="space-y-3" onSubmit={submitPasscode}>
        <Input
          inputMode="numeric"
          maxLength={12}
          placeholder="Meeting passcode"
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
        />
        {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
        <Button className="w-full" type="submit">
          <KeyRound className="h-4 w-4" />
          Join meeting
        </Button>
      </form>
    </div>
  );
}
