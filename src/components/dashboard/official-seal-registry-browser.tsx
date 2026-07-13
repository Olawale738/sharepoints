"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, ShieldCheck } from "lucide-react";

import { SealRegistryActions } from "@/components/dashboard/seal-registry-actions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type OfficialSealRecord = {
  kind: string;
  recordId?: string | null;
  title: string;
  sealNumber?: string | null;
  status?: string | null;
  active: boolean;
  ownerName?: string | null;
  message: string;
  verificationUrl?: string | null;
  issuedAt?: string | null;
};

export function OfficialSealRegistryBrowser({ records }: { records: OfficialSealRecord[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("ALL");
  const [status, setStatus] = useState("ALL");

  const kinds = useMemo(() => Array.from(new Set(records.map((record) => record.kind))).sort(), [records]);
  const visibleRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return records.filter((record) => {
      const matchesKind = kind === "ALL" || record.kind === kind;
      const matchesStatus =
        status === "ALL" ||
        (status === "ACTIVE" && record.active) ||
        (status === "INACTIVE" && !record.active);
      const haystack = [
        record.title,
        record.kind,
        record.status ?? "",
        record.sealNumber ?? "",
        record.ownerName ?? "",
        record.message
      ]
        .join(" ")
        .toLowerCase();

      return matchesKind && matchesStatus && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [kind, query, records, status]);

  return (
    <section className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
      <div className="space-y-3 border-b border-ink/10 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Official registry search</h2>
          <Badge>{visibleRecords.length} shown</Badge>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_12rem_10rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
            <Input
              className="bg-white pl-9"
              placeholder="Search seal number, owner, title, type, status..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-moss"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="ALL">All types</option>
            {kinds.map((item) => (
              <option key={item} value={item}>
                {item.toLowerCase().replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-moss"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">All status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>
      <div className="divide-y divide-ink/10">
        {visibleRecords.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No official records match that search.</p> : null}
        {visibleRecords.map((record, index) => (
          <div
            className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_12rem_9rem_8rem_8rem]"
            key={`${record.kind}-${record.sealNumber}-${index}`}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-ink">{record.title}</p>
                <Badge className={record.active ? "bg-mint" : "bg-clay/10 text-clay"}>
                  {record.active ? "active" : "not accepted"}
                </Badge>
              </div>
              <p className="mt-1 break-words font-mono text-xs text-ink/55">{record.sealNumber ?? "No seal number"}</p>
              <p className="mt-1 text-xs text-ink/45">
                {record.ownerName ?? "No public holder"} - {record.message}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink/40">Type</p>
              <p className="mt-1 text-sm font-medium text-ink">{record.kind.toLowerCase().replaceAll("_", " ")}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink/40">Status</p>
              <p className="mt-1 text-sm font-medium text-ink">{record.status ?? "registered"}</p>
            </div>
            <div className="flex flex-col gap-2 lg:items-end">
              <p className="text-xs text-ink/45">{record.issuedAt ? formatDate(record.issuedAt) : "No date"}</p>
              {record.verificationUrl ? (
                <Link
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-ink/10 bg-paper px-3 text-xs font-medium text-ink hover:bg-mint/40"
                  href={record.verificationUrl}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verify
                </Link>
              ) : null}
            </div>
            <SealRegistryActions active={record.active} kind={record.kind} recordId={record.recordId} />
          </div>
        ))}
      </div>
    </section>
  );
}
