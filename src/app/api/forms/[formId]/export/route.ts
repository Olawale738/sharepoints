import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ formId: string }>;
};

function csvCell(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { formId } = await context.params;
    const form = await prisma.workspaceForm.findUnique({
      where: { id: formId },
      include: {
        responses: {
          include: {
            respondent: {
              select: { name: true, email: true }
            }
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!form) {
      throw new ApiError(404, "Form not found.");
    }

    await requireWorkspacePermission(user.id, form.workspaceId, "canCreateAnnouncements");
    const fields = form.fields as Array<{ id: string; label: string }>;
    const header = ["Name", "Email", "Submitted", ...fields.map((field) => field.label)].map(csvCell).join(",");
    const rows = form.responses.map((response) => {
      const answers = response.answers as Record<string, unknown>;
      return [
        response.respondent.name ?? "",
        response.respondent.email ?? "",
        response.createdAt.toISOString(),
        ...fields.map((field) => answers[field.id] ?? "")
      ]
        .map(csvCell)
        .join(",");
    });

    return new Response([header, ...rows].join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${form.title.replace(/[^a-z0-9]+/gi, "-")}-responses.csv"`
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
