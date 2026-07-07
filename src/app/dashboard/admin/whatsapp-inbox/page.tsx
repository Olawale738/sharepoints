import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { WhatsAppInboxPanel } from "@/components/dashboard/whatsapp-inbox-panel";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function WhatsAppInboxPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");

  return <WhatsAppInboxPanel />;
}
