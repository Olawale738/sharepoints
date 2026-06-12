import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";
import { ensureBuiltInWorkspaceTemplates } from "@/lib/workspace-templates";

const templateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  channels: z.array(z.string().trim().min(2).max(60)).max(20),
  folders: z.array(z.string().trim().min(1).max(120)).max(30)
});

export async function GET() {
  try {
    await requireUser();
    await ensureBuiltInWorkspaceTemplates();
    const templates = await prisma.workspaceTemplate.findMany({
      where: { enabled: true },
      orderBy: [{ system: "desc" }, { name: "asc" }]
    });
    return ok({ templates });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const parsed = templateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid workspace template.");
    const template = await prisma.workspaceTemplate.create({
      data: {
        name: parsed.data.name,
        category: parsed.data.category.toUpperCase(),
        description: parsed.data.description ?? null,
        definition: { channels: parsed.data.channels, folders: parsed.data.folders },
        createdById: user.id
      }
    });
    return ok({ template }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
