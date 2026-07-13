import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, AlertTriangle, Building2, CheckCircle2, Gauge, ShieldAlert, TrendingUp } from "lucide-react";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { getBranchHealthScores } from "@/lib/branch-health";
import { hasAnyWorkspacePermission } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";

function scoreTone(score: number) {
  if (score >= 85) return "bg-mint text-moss";
  if (score >= 70) return "bg-wheat text-ink";
  if (score >= 40) return "bg-paper text-ink";
  return "bg-clay/10 text-clay";
}

function barWidth(value: number, max: number) {
  return `${Math.max(0, Math.min(100, Math.round((value / max) * 100)))}%`;
}

export default async function BranchHealthPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspacePermission(session.user.id, "canViewBranchCompliance"))) redirect("/dashboard");

  const health = await getBranchHealthScores();
  const cards = [
    { label: "Average score", value: health.overview.averageScore, detail: "Across active units", icon: Gauge },
    { label: "Excellent", value: health.overview.excellent, detail: "85 and above", icon: CheckCircle2 },
    { label: "Healthy", value: health.overview.healthy, detail: "70 to 84", icon: TrendingUp },
    { label: "Needs action", value: health.overview.urgent, detail: "Below 40", icon: AlertTriangle },
    { label: "Compliance gaps", value: health.overview.complianceGaps, detail: "Missing governance items", icon: ShieldAlert }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <Gauge className="h-4 w-4" />
              Branch health score
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">LETW network health board</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              A practical score for every country, region, branch, church, and ministry based on members, leaders, workspaces,
              attendance, projects, care cases, transfers, and document renewal risks.
            </p>
            <p className="mt-2 text-xs text-ink/45">Generated {formatDate(health.generatedAt)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin/branches">
              Branch dashboards
            </Link>
            <Link className="inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin">
              Admin center
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" key={card.label}>
              <Icon className="h-5 w-5 text-moss" />
              <p className="mt-3 text-2xl font-semibold text-ink">{card.value}</p>
              <p className="text-sm text-ink/55">{card.label}</p>
              <p className="mt-1 text-xs text-ink/45">{card.detail}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="flex flex-col gap-2 border-b border-ink/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Units ranked by risk</h2>
            <p className="text-xs text-ink/50">Lowest scores appear first so admin can act quickly.</p>
          </div>
          <Badge>{health.scores.length} active units</Badge>
        </div>
        <div className="divide-y divide-ink/10">
          {health.scores.map((item) => (
            <article className="grid gap-4 px-4 py-5 xl:grid-cols-[minmax(0,1fr)_24rem]" key={item.unit.id}>
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-ink">
                      <Building2 className="h-4 w-4 text-moss" />
                      {item.unit.name}
                    </p>
                    <p className="mt-1 text-xs text-ink/50">
                      {item.unit.type.toLowerCase()} {item.unit.code ? `- ${item.unit.code}` : ""}{" "}
                      {item.parent ? `- under ${item.parent.name}` : "- top level"}
                    </p>
                  </div>
                  <Badge className={scoreTone(item.score)}>{item.grade}</Badge>
                </div>

                <div className="mt-4 h-3 overflow-hidden rounded-full bg-paper">
                  <div className="h-full rounded-full bg-moss" style={{ width: `${item.score}%` }} />
                </div>
                <p className="mt-2 text-sm text-ink/60">Score: <span className="font-semibold text-ink">{item.score}/100</span></p>
                <div className="mt-3 rounded-md border border-ink/10 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">Compliance readiness</p>
                    <Badge className={item.compliance.score >= 80 ? "bg-mint" : item.compliance.score >= 60 ? "bg-wheat" : "bg-clay/10 text-clay"}>
                      {item.compliance.score}%
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink/50">
                    {item.compliance.passed}/{item.compliance.total} checks passed
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {item.compliance.checks.slice(0, 6).map((check) => (
                      <div className="flex items-start gap-2 rounded-md bg-paper px-2 py-2 text-xs" key={check.key}>
                        <span className={check.passed ? "mt-0.5 h-2 w-2 rounded-full bg-moss" : "mt-0.5 h-2 w-2 rounded-full bg-clay"} />
                        <span className={check.passed ? "text-ink/65" : "font-medium text-clay"}>{check.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-md bg-paper p-3">
                    <p className="font-semibold text-ink">{item.metrics.activeMembers}/{item.metrics.members}</p>
                    <p className="text-xs text-ink/50">active members</p>
                  </div>
                  <div className="rounded-md bg-paper p-3">
                    <p className="font-semibold text-ink">{item.metrics.leaders}</p>
                    <p className="text-xs text-ink/50">assigned leaders</p>
                  </div>
                  <div className="rounded-md bg-paper p-3">
                    <p className="font-semibold text-ink">{item.metrics.recentAttendanceRecords}</p>
                    <p className="text-xs text-ink/50">recent check-ins</p>
                  </div>
                  <div className="rounded-md bg-paper p-3">
                    <p className="font-semibold text-ink">{item.metrics.overdueProjects + item.metrics.pendingTransfers + item.metrics.renewalRisks}</p>
                    <p className="text-xs text-ink/50">open risks</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-ink/10 bg-paper p-3">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                    <Activity className="h-4 w-4 text-moss" />
                    Score breakdown
                  </p>
                  {[
                    ["Membership", item.breakdown.membershipScore, 20],
                    ["Leadership", item.breakdown.leadershipScore, 15],
                    ["Collaboration", item.breakdown.collaborationScore, 15],
                    ["Attendance", item.breakdown.attendanceScore, 15],
                    ["Projects", item.breakdown.projectScore, 15],
                    ["Care", item.breakdown.careScore, 10],
                    ["Governance", item.breakdown.governanceScore, 10]
                  ].map(([label, value, max]) => (
                    <div className="mb-2 last:mb-0" key={label as string}>
                      <div className="flex items-center justify-between text-xs text-ink/55">
                        <span>{label}</span>
                        <span>{value}/{max}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-moss" style={{ width: barWidth(value as number, max as number) }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-ink/10 bg-white p-3">
                  <p className="text-sm font-semibold text-ink">Recommended action</p>
                  {item.recommendations.length ? (
                    <ul className="mt-2 space-y-1 text-sm text-ink/60">
                      {item.recommendations.slice(0, 4).map((recommendation) => (
                        <li key={recommendation}>{recommendation}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-ink/55">This unit is currently healthy. Keep reviewing it monthly.</p>
                  )}
                </div>
              </div>
            </article>
          ))}
          {health.scores.length === 0 ? <p className="px-4 py-10 text-sm text-ink/55">No organization units found.</p> : null}
        </div>
      </section>
    </div>
  );
}
