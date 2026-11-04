"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PeriodStats } from "@/lib/queries";
import { VIEWS, type View } from "@/lib/periods";
import { Heatmap } from "./heatmap";
import { SessionsList } from "./sessions-list";

// Recharts only loads for Week and Month, so the default Year view pays nothing for it (spec 0004).
const PeriodChart = dynamic(() => import("./period-chart"), {
  ssr: false,
  loading: () => <div className="h-56" aria-hidden />,
});

const VIEW_LABEL: Record<View, string> = { week: "Week", month: "Month", year: "Year" };

function hm(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** The history column: view tabs, period arrows, stats row, chart or heatmap, sessions list (spec 0006 AC-5). */
export function History({ stats }: { stats: PeriodStats }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [day, setDay] = useState<string | null>(null);

  function go(view: View, period?: string | null) {
    const q = new URLSearchParams({ view });
    if (period) q.set("period", period);
    setDay(null);
    start(() => router.push(`${path}?${q}`, { scroll: false }));
  }

  const change = stats.change;
  const changeText = !change
    ? "No change"
    : "upFromZero" in change
      ? "Up from 0"
      : `${change.pct > 0 ? "+" : ""}${change.pct}%`;
  const changeHint = stats.view === "year" ? "vs last year" : `vs last ${stats.view}`;
  const toggleDay = (d: string) => setDay((cur) => (cur === d ? null : d));

  return (
    <section aria-labelledby="history-title" className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 id="history-title" className="sr-only">
        Focus history
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="History range" className="inline-flex rounded-lg border border-border p-1">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={stats.view === v}
              onClick={() => stats.view !== v && go(v)}
              className={`h-11 rounded-md px-4 text-sm ${stats.view === v ? "bg-accent-soft font-semibold" : "text-muted hover:text-foreground"}`}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Previous ${stats.view}`}
            disabled={!stats.prevKey || pending}
            onClick={() => go(stats.view, stats.prevKey)}
            className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <p className="min-w-36 text-center text-sm font-semibold" aria-live="polite">
            {stats.label}
          </p>
          <button
            type="button"
            aria-label={`Next ${stats.view}`}
            disabled={!stats.nextKey || pending}
            onClick={() => go(stats.view, stats.nextKey)}
            className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className={`space-y-5 transition-opacity duration-150 ${pending ? "opacity-50" : ""}`} aria-busy={pending}>
        {pending && <p className="sr-only">Loading</p>}
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Focused", hm(stats.totalSec)],
            ["Daily average", hm(stats.averageSec)],
            ["Sessions", String(stats.sessions)],
            [changeHint, changeText],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col-reverse">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="font-mono text-xl font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>

        {stats.view === "year" ? (
          <Heatmap cells={stats.days} selected={day} onSelectDay={toggleDay} />
        ) : (
          <PeriodChart days={stats.days} view={stats.view} selected={day} onSelectDay={toggleDay} />
        )}

        <SessionsList view={stats.view} period={stats.key} day={day} onClearDay={() => setDay(null)} />
      </div>
    </section>
  );
}
