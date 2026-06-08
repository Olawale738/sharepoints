import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { RegisterForm } from "@/components/auth/register-form";

type RegisterPageProps = {
  searchParams: Promise<{ email?: string }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  const { email } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(145deg,#f8f6f0_0%,#ddf3ea_48%,#f4e7c5_100%)] px-4 py-10">
      <RegisterForm initialEmail={email ?? ""} />
    </main>
  );
}
