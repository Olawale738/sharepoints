import QRCode from "qrcode";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { isOperationsManager } from "@/lib/operations";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ registrationId: string }> };

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { registrationId } = await context.params;
    const kind = new URL(request.url).searchParams.get("kind") === "certificate" ? "certificate" : "badge";
    const registration = await prisma.eventRegistration.findUnique({ where: { id: registrationId } });
    if (!registration) throw new ApiError(404, "Ticket not found.");
    if (registration.userId !== user.id && !(await isOperationsManager(user.id))) {
      throw new ApiError(403, "You cannot print this ticket.");
    }
    const [event, configuration] = await Promise.all([
      prisma.churchEvent.findUnique({ where: { id: registration.eventId } }),
      prisma.eventTicketConfiguration.findUnique({ where: { eventId: registration.eventId } })
    ]);
    if (!event || !configuration) throw new ApiError(404, "Event configuration not found.");
    if (kind === "badge" && !configuration.badgeEnabled) throw new ApiError(403, "Badges are disabled for this event.");
    if (kind === "certificate" && !configuration.certificateEnabled) {
      throw new ApiError(403, "Certificates are disabled for this event.");
    }
    if (kind === "certificate" && registration.status !== "CHECKED_IN") {
      throw new ApiError(409, "Certificates are available after event check-in.");
    }

    const qr = await QRCode.toDataURL(registration.qrToken, { margin: 1, width: 220 });
    await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: kind === "badge" ? { badgePrintedAt: new Date() } : { certificateIssuedAt: new Date() }
    });
    const title = kind === "badge" ? "Event Badge" : "Certificate of Attendance";
    const main =
      kind === "badge"
        ? `<div class="badge"><div class="brand">LETW.org</div><h1>${escapeHtml(registration.displayName)}</h1><p>${escapeHtml(event.title)}</p><p>${new Date(event.startsAt).toLocaleDateString("en-GB")}</p><img src="${qr}" alt="Ticket QR code"><strong>${escapeHtml(registration.ticketCode)}</strong></div>`
        : `<div class="certificate"><div class="brand">LETW.org</div><p class="eyebrow">Certificate of Attendance</p><h1>${escapeHtml(registration.displayName)}</h1><p>has participated in</p><h2>${escapeHtml(event.title)}</h2><p>${new Date(event.startsAt).toLocaleDateString("en-GB")}${event.location ? ` · ${escapeHtml(event.location)}` : ""}</p><div class="line"></div><strong>Light Encounter Tabernacle Worldwide</strong></div>`;

    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
        *{box-sizing:border-box}body{margin:0;background:#f4f1e9;color:#102a27;font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center}
        .badge,.certificate{background:#fff;border:2px solid #1f6f5b;box-shadow:0 16px 50px #102a2720;text-align:center}
        .badge{width:360px;padding:28px}.certificate{width:min(900px,92vw);padding:70px 60px}
        .brand{color:#1f6f5b;font-weight:700;letter-spacing:.08em}.eyebrow{text-transform:uppercase;letter-spacing:.2em;color:#1f6f5b}
        h1{font-size:36px;margin:22px 0 10px}h2{font-size:28px}p{color:#536763}img{display:block;width:150px;height:150px;margin:22px auto}
        .line{height:1px;background:#cfa64b;width:220px;margin:50px auto 16px}
        @media print{body{background:#fff}.badge,.certificate{box-shadow:none}button{display:none}}
      </style></head><body>${main}<script>window.addEventListener("load",()=>window.print())</script></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
