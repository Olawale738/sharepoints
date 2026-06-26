import { CheckCircle2, QrCode } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ token: string }> };

export default async function AttendanceCheckInPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { token } = await params;
  const attendanceSession = await prisma.smartAttendanceSession.findUnique({
    where: { qrToken: token }
  });

  if (!attendanceSession || !attendanceSession.active) {
    return (
      <section className="mx-auto max-w-xl rounded-lg border border-ink/10 bg-white p-6 text-center">
        <QrCode className="mx-auto h-10 w-10 text-clay" />
        <h1 className="mt-4 text-2xl font-semibold">Attendance link is not active</h1>
        <p className="mt-2 text-sm text-ink/60">Ask the service, meeting, or event admin to re-open the QR attendance session.</p>
      </section>
    );
  }

  const displayName = session.user.name ?? session.user.email ?? "LETW member";
  const record = await prisma.smartAttendanceRecord.upsert({
    where: {
      sessionId_userId: {
        sessionId: attendanceSession.id,
        userId: session.user.id
      }
    },
    update: {
      displayName,
      email: session.user.email ?? null,
      checkedInAt: new Date()
    },
    create: {
      sessionId: attendanceSession.id,
      userId: session.user.id,
      displayName,
      email: session.user.email ?? null
    }
  });

  await logActivity({
    userId: session.user.id,
    action: activityActions.smartAttendanceCheckedIn,
    targetId: attendanceSession.id,
    metadata: { recordId: record.id, title: attendanceSession.title }
  });

  return (
    <section className="mx-auto max-w-xl rounded-lg border border-ink/10 bg-white p-6 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-moss" />
      <p className="mt-4 text-sm font-medium text-moss">Attendance confirmed</p>
      <h1 className="mt-2 text-2xl font-semibold">{attendanceSession.title}</h1>
      <p className="mt-2 text-sm text-ink/60">
        {displayName} was checked in at {record.checkedInAt.toLocaleString("en-GB")}.
      </p>
    </section>
  );
}
