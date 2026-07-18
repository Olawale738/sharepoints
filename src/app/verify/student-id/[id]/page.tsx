import Image from "next/image";
import { notFound } from "next/navigation";
import { GraduationCap, ShieldAlert, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";

type PageContext = {
  params: Promise<{ id: string }>;
};

function studentIdStatus(candidate: { studentIdNumber?: string | null; studentIdStatus?: string | null; studentIdExpiresAt?: Date | null }) {
  if (!candidate.studentIdNumber) return "PENDING";
  if (candidate.studentIdStatus && candidate.studentIdStatus !== "ACTIVE") return candidate.studentIdStatus;
  if (candidate.studentIdExpiresAt && candidate.studentIdExpiresAt <= new Date()) return "EXPIRED";
  return "ACTIVE";
}

function displayDate(value?: string | Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default async function StudentIdVerificationPage(context: PageContext) {
  const { id } = await context.params;
  const candidate = await prisma.academicCandidate.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      photoUrl: true,
      organization: true,
      programName: true,
      educationLevel: true,
      fieldOfStudy: true,
      studyMode: true,
      admissionDate: true,
      graduationDate: true,
      studentIdNumber: true,
      studentIdIssuedAt: true,
      studentIdExpiresAt: true,
      studentIdStatus: true
    }
  });

  if (!candidate || !candidate.studentIdNumber) notFound();

  const status = studentIdStatus(candidate);
  const active = status === "ACTIVE";
  const candidatePhotoSrc = candidate.photoUrl
    ? candidate.photoUrl.startsWith("/api/certificates/assets/")
      ? `/api/academic-candidates/${candidate.id}/student-id-photo`
      : candidate.photoUrl
    : null;

  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <section className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-[#d4af37]/35 bg-white shadow-soft">
        <div className="bg-[#0b1b3d] px-6 py-7 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white p-2">
                <Image alt="LETW logo" className="h-full w-full object-contain" height={96} src="/letw-logo.png" width={96} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">Light Encounter Tabernacle Worldwide</p>
                <h1 className="mt-2 text-2xl font-semibold">Student ID Verification Portal</h1>
                <p className="mt-1 text-sm text-white/70">Live confirmation from the LETW academic register.</p>
              </div>
            </div>
            <Badge className={active ? "border-white/20 bg-white/10 text-white" : "bg-clay text-white"}>
              {active ? "active student id" : status.toLowerCase()}
            </Badge>
          </div>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_15rem]">
          <div>
            <div className={`rounded-lg border p-4 ${active ? "border-moss/20 bg-mint text-moss" : "border-clay/20 bg-clay/10 text-clay"}`}>
              <div className="flex items-start gap-3">
                {active ? <ShieldCheck className="mt-0.5 h-5 w-5" /> : <ShieldAlert className="mt-0.5 h-5 w-5" />}
                <div>
                  <p className="text-sm font-semibold">{active ? "This Student ID is active." : "Do not accept this Student ID as active."}</p>
                  <p className="mt-1 text-xs leading-5">
                    Status: {status}. {candidate.studentIdExpiresAt ? `Expiry: ${displayDate(candidate.studentIdExpiresAt)}.` : "No expiry date is set."}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-start gap-3">
              <GraduationCap className="mt-1 h-6 w-6 text-moss" />
              <div>
                <p className="text-sm font-semibold text-ink">Official academic identity</p>
                <p className="mt-1 text-sm text-ink/60">
                  This page confirms the student identity number, academic program, issue date, and current status.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-paper p-3">
                <p className="text-xs uppercase tracking-wide text-ink/45">Student name</p>
                <p className="mt-1 font-semibold text-ink">{candidate.fullName}</p>
              </div>
              <div className="rounded-md bg-paper p-3">
                <p className="text-xs uppercase tracking-wide text-ink/45">Student ID number</p>
                <p className="mt-1 break-all font-mono font-semibold text-ink">{candidate.studentIdNumber}</p>
              </div>
              <div className="rounded-md bg-paper p-3">
                <p className="text-xs uppercase tracking-wide text-ink/45">Program</p>
                <p className="mt-1 font-semibold text-ink">{candidate.programName}</p>
              </div>
              <div className="rounded-md bg-paper p-3">
                <p className="text-xs uppercase tracking-wide text-ink/45">Level</p>
                <p className="mt-1 font-semibold text-ink">{candidate.educationLevel}</p>
              </div>
              <div className="rounded-md bg-paper p-3">
                <p className="text-xs uppercase tracking-wide text-ink/45">Field of study</p>
                <p className="mt-1 font-semibold text-ink">{candidate.fieldOfStudy}</p>
              </div>
              <div className="rounded-md bg-paper p-3">
                <p className="text-xs uppercase tracking-wide text-ink/45">Study mode</p>
                <p className="mt-1 font-semibold text-ink">{candidate.studyMode ?? "Not set"}</p>
              </div>
              <div className="rounded-md bg-paper p-3">
                <p className="text-xs uppercase tracking-wide text-ink/45">Issued</p>
                <p className="mt-1 font-semibold text-ink">{displayDate(candidate.studentIdIssuedAt)}</p>
              </div>
              <div className="rounded-md bg-paper p-3">
                <p className="text-xs uppercase tracking-wide text-ink/45">Expires</p>
                <p className="mt-1 font-semibold text-ink">{displayDate(candidate.studentIdExpiresAt)}</p>
              </div>
            </div>
          </div>

          <aside className="rounded-xl border border-[#d4af37]/35 bg-[#f8fbff] p-4 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#0b1b3d]">Candidate photograph</p>
            <div className="mx-auto flex h-56 w-44 items-center justify-center overflow-hidden rounded-xl border-2 border-[#d4af37]/55 bg-white p-1">
              {candidatePhotoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={candidate.fullName} className="h-full w-full object-contain" src={candidatePhotoSrc} />
              ) : (
                <GraduationCap className="h-10 w-10 text-ink/30" />
              )}
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#d4af37]">LETW Academic Register</p>
            <p className="mt-1 text-lg font-semibold text-[#0b1b3d]">{candidate.organization?.trim() || "LETW School of Theology"}</p>
            <p className="mt-3 break-all font-mono text-xs text-ink/50">{candidate.id}</p>
          </aside>
        </div>
      </section>
    </main>
  );
}
