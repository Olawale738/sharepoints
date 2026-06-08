import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    email?: string;
    token?: string;
  }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  const { email, token } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(145deg,#f8f6f0_0%,#ddf3ea_48%,#f4e7c5_100%)] px-4 py-10">
      <ResetPasswordForm email={email ?? ""} token={token ?? ""} />
    </main>
  );
}
