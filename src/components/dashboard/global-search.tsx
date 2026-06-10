"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SearchResult = {
  type: string;
  title: string;
  detail: string;
  href: string;
};

function typeLabel(type: string) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  async function search(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setError("");
    setHasSearched(true);
    setIsSearching(true);
    const response = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`);
    setIsSearching(false);

    const data = (await response.json().catch(() => null)) as { results?: SearchResult[]; error?: string } | null;

    if (!response.ok || !data?.results) {
      setError(data?.error ?? "Search failed.");
      setResults([]);
      return;
    }

    setResults(data.results);
  }

  return (
    <div className="relative w-full max-w-xl">
      <form className="flex gap-2" onSubmit={search}>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <Input
            className="h-10 bg-white pl-9"
            placeholder="Search files, chats, tasks, members..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (!event.target.value.trim()) {
                setResults([]);
                setHasSearched(false);
                setError("");
              }
            }}
          />
        </div>
        <Button className="h-10 px-3" variant="secondary" disabled={isSearching} type="submit">
          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </form>

      {(hasSearched || error) && query.trim() ? (
        <div className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
          {error ? <p className="bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
          {!error && results.length === 0 ? <p className="px-3 py-4 text-sm text-ink/55">No results found.</p> : null}
          {results.length ? (
            <div className="max-h-96 divide-y divide-ink/10 overflow-y-auto">
              {results.map((result, index) => {
                const isApiLink = result.href.startsWith("/api/");

                const content = (
                  <div className="px-3 py-3 transition hover:bg-mint/35">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium text-ink">{result.title}</p>
                      <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-ink/55">
                        {typeLabel(result.type)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-ink/50">{result.detail}</p>
                  </div>
                );

                return isApiLink ? (
                  <a key={`${result.href}-${index}`} href={result.href} target="_blank" rel="noreferrer">
                    {content}
                  </a>
                ) : (
                  <Link key={`${result.href}-${index}`} href={result.href} onClick={() => setHasSearched(false)}>
                    {content}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
