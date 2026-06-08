import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(145deg,#f8f6f0_0%,#ddf3ea_48%,#f4e7c5_100%)] px-4 py-10">
      <LoginForm />
    </main>
  );
}
