import { createAutomaticOrganizationBackup } from "@/lib/system-monitoring";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await createAutomaticOrganizationBackup(false);
    return Response.json({
      status: result.skipped ? "skipped" : "completed",
      backup: {
        id: result.backup.id,
        status: result.backup.status,
        size: result.backup.size,
        checksum: result.backup.checksum,
        createdAt: result.backup.createdAt,
        completedAt: result.backup.completedAt
      }
    });
  } catch (error) {
    return Response.json(
      {
        status: "failed",
        error: error instanceof Error ? error.message : "Automatic backup failed."
      },
      { status: 500 }
    );
  }
}
