import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  createLetwStarterOrganizationData,
  importOrganizationCsv,
  ORGANIZATION_IMPORT_TEMPLATE
} from "@/lib/organization-import";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

export const runtime = "nodejs";

const actionSchema = z.object({
  action: z.literal("BOOTSTRAP")
});

export async function GET() {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can download the organization import template.");
    return new Response(ORGANIZATION_IMPORT_TEMPLATE, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="letw-organization-import-template.csv"'
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can import organization data.");
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) throw new ApiError(422, "Upload a CSV file.");
      if (!file.name.toLowerCase().endsWith(".csv")) throw new ApiError(415, "Only CSV files are supported.");
      const csv = await file.text();
      const summary = await importOrganizationCsv(csv, user.id);
      return ok({ summary });
    }

    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid organization import request.");
    const summary = await createLetwStarterOrganizationData(user.id);
    return ok({ summary });
  } catch (error) {
    return handleRouteError(error);
  }
}
