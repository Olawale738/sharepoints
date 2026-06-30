import { collectSystemMonitorSnapshot, notifyAdminsOfMonitorWarnings } from "@/lib/system-monitoring";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const snapshot = await collectSystemMonitorSnapshot();
  const notification = await notifyAdminsOfMonitorWarnings(snapshot.warnings);
  return Response.json({ ...snapshot, notification });
}
