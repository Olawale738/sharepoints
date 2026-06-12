import { prisma } from "@/lib/prisma";
import { isS3Configured } from "@/lib/storage";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const [users, workspaces, files, recentFailedLogins] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.workspace.count({ where: { deletedAt: null } }),
    prisma.file.count({ where: { deletedAt: null } }),
    prisma.securityEvent.count({
      where: {
        type: "LOGIN_FAILED",
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) }
      }
    })
  ]);
  const warnings = [
    !isS3Configured() ? "Cloud object storage is not configured." : null,
    recentFailedLogins >= 10 ? `${recentFailedLogins} failed logins occurred in the last 15 minutes.` : null
  ].filter(Boolean);
  return Response.json({
    status: warnings.length ? "warning" : "healthy",
    metrics: { users, workspaces, files, recentFailedLogins },
    warnings,
    checkedAt: new Date().toISOString()
  });
}
