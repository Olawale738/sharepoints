import { deliverPendingNotifications } from "@/lib/notification-delivery";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return Response.json(await deliverPendingNotifications());
}
