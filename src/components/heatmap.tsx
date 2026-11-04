"use client";

import { useState } from "react";
import { format } from "date-fns";
import { tooltipText, toWeeks, type Cell } from "@/lib/heatmap";

const LEVEL_CLASS = ["bg-heat-0", "bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4"] as const;
const ROW_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

/**
 * The contribution style grid, rows Monday first (spec 0004 AC-3). With `heading` it renders as its
 * own panel (landing page); without, it is bare for the history panel. Future days are inert.
 */
export function Heatmap({
  cells,
  heading,
  onSelectDay,
  selected,
}: {
  cells: (Cell & { future?: boolean })[];
  heading?: string;
  onSelectDay?: (date: string) => void;
  selected?: string | null;
}) {
  const weeks = toWeeks(cells);
  const [tip, setTip] = useState<string>("Hover or focus a day");

  // Month label above the first week that contains the 1st (or the first column).
  const monthLabels = weeks.map((w, i) => {
    const first = w.find(Boolean);
    if (!first) return "";
    const d = new Date(`${first.date}T12:00:00`);
    const prev = i > 0 ? weeks[i - 1].find(Boolean) : null;
    const prevMonth = prev ? new Date(`${prev.date}T12:00:00`).getMonth() : -1;
    return i === 0 || d.getMonth() !== prevMonth ? format(d, "MMM") : "";
  });

  const grid = (
    <>
      {/* One grid: cells stretch to fill the width, never below 10 px; narrower screens scroll. */}
      <div className="overflow-x-auto pb-1">
        <div
          className="grid gap-[3px]"
          style={{ gridTemplateColumns: `auto repeat(${weeks.length}, minmax(10px, 1fr))`, minWidth: weeks.length * 13 + 32 }}
        >
          {monthLabels.map((m, i) => (
            <span
              key={`m${i}`}
              aria-hidden
              className="h-4 overflow-visible whitespace-nowrap text-[10px] leading-4 text-muted"
              style={{ gridColumn: i + 2, gridRow: 1 }}
            >
              {m}
            </span>
          ))}
          {ROW_LABELS.map((l, i) => (
            <span key={`r${i}`} aria-hidden className="pr-1 text-[10px] leading-none text-muted" style={{ gridColumn: 1, gridRow: i + 2 }}>
              {l}
            </span>
          ))}
          {weeks.map((w, wi) =>
            w.map((cell, di) => {
              const at = { gridColumn: wi + 2, gridRow: di + 2 };
              if (!cell) return null;
              if (cell.future)
                return <span key={cell.date} aria-hidden style={at} className="aspect-square rounded-[3px] bg-heat-0 opacity-40" />;
              const text = tooltipText(cell);
              return (
                <button
                  key={cell.date}
                  type="button"
                  style={at}
                  aria-label={text}
                  aria-pressed={onSelectDay ? selected === cell.date : undefined}
                  title={text}
                  onMouseEnter={() => setTip(text)}
                  onFocus={() => setTip(text)}
                  onClick={() => onSelectDay?.(cell.date)}
                  className={`aspect-square rounded-[3px] hover:ring-1 hover:ring-foreground ${LEVEL_CLASS[cell.level]} ${
                    selected === cell.date ? "ring-2 ring-accent" : ""
                  }`}
                />
              );
            }),
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <p aria-live="polite">{tip}</p>
        <p className="flex items-center gap-1" aria-hidden>
          Less
          {LEVEL_CLASS.map((c) => (
            <span key={c} className={`size-3 rounded-[3px] ${c}`} />
          ))}
          More
        </p>
      </div>
    </>
  );

  if (!heading) return grid;
  return (
    <section aria-label={heading} className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{heading}</h2>
      {grid}
    </section>
  );
}
