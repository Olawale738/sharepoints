import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LeadershipDocumentRoomPanel } from "@/components/dashboard/leadership-document-room-panel";
import { canViewLeadershipDocumentRoom, getLeadershipDocuments } from "@/lib/leadership-documents";
import { hasAnyWorkspacePermission } from "@/lib/rbac";

export default async function LeadershipDocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!(await canViewLeadershipDocumentRoom(session.user.id))) {
    redirect("/dashboard");
  }

  const [documents, canManage] = await Promise.all([
    getLeadershipDocuments(session.user.id),
    hasAnyWorkspacePermission(session.user.id, "canManageEvidenceVault")
  ]);

  return (
    <LeadershipDocumentRoomPanel
      canManage={canManage}
      initialDocuments={documents.map((document) => ({
        id: document.id,
        title: document.title,
        description: document.description,
        category: document.category,
        status: document.status,
        fileName: document.fileName,
        fileType: document.fileType,
        size: document.size,
        createdAt: document.createdAt.toISOString(),
        uploadedBy: document.uploadedBy
      }))}
    />
  );
}
