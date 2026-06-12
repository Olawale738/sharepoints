import { prisma } from "@/lib/prisma";
import { isOnlyOfficeConfigured } from "@/lib/onlyoffice";
import { isRealtimeConfigured } from "@/lib/realtime";
import { isS3Configured } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({
      status: "healthy",
      database: "connected",
      storage: isS3Configured() ? "configured" : "local-only",
      realtime: isRealtimeConfigured() ? "configured" : "fallback",
      documentEditing: isOnlyOfficeConfigured() ? "configured" : "disabled",
      notifications: process.env.CRON_SECRET ? "scheduled" : "manual",
      responseTimeMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return Response.json(
      {
        status: "unhealthy",
        database: "disconnected",
        error: error instanceof Error ? error.message : "Database health check failed.",
        checkedAt: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}
