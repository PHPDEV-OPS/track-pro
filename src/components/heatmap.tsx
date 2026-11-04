"use client";

import { useState } from "react";
import { format } from "date-fns";
import { tooltipText, toWeeks, type Cell } from "@/lib/heatmap";

const LEVEL_CLASS = ["bg-heat-0", "bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4"] as const;

export function Heatmap({
  cells,
  onSelectDay,
  selected,
}: {
  cells: Cell[];
  onSelectDay?: (date: string) => void;
  selected?: string | null;
}) {
  const weeks = toWeeks(cells);
  const [tip, setTip] = useState<string>("Hover a day");
  const total = cells.reduce((n, c) => n + c.minutes, 0);

  // Month label above the first week that contains the 1st (or the first column).
  const monthLabels = weeks.map((w, i) => {
    const first = w.find(Boolean);
    if (!first) return "";
    const d = new Date(`${first.date}T12:00:00`);
    const prev = i > 0 ? weeks[i - 1].find(Boolean) : null;
    const prevMonth = prev ? new Date(`${prev.date}T12:00:00`).getMonth() : -1;
    return i === 0 || d.getMonth() !== prevMonth ? format(d, "MMM") : "";
  });

  return (
    <section aria-label="Focus history, last 365 days" className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">
          {Math.round(total / 60)} hours focused in the last year
        </h2>
        <p className="text-xs text-muted" aria-live="polite">
          {tip}
        </p>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, 12px)` }}>
          {monthLabels.map((m, i) => (
            <span key={`m${i}`} className="h-4 overflow-visible whitespace-nowrap text-[10px] text-muted">
              {m}
            </span>
          ))}
          {weeks.map((w, wi) => (
            <div key={wi} className="col-start-auto grid gap-[3px]" style={{ gridColumn: wi + 1, gridRow: 2 }}>
              {Array.from({ length: 7 }, (_, di) => {
                const cell = w[di];
                if (!cell) return <span key={di} className="size-3" />;
                const text = tooltipText(cell);
                return (
                  <button
                    key={di}
                    type="button"
                    aria-label={text}
                    title={text}
                    onMouseEnter={() => setTip(text)}
                    onFocus={() => setTip(text)}
                    onClick={() => onSelectDay?.(cell.date)}
                    className={`size-3 rounded-[3px] outline-offset-2 hover:ring-1 hover:ring-foreground focus-visible:ring-2 focus-visible:ring-accent ${LEVEL_CLASS[cell.level]} ${
                      selected === cell.date ? "ring-2 ring-accent" : ""
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted">
        Less
        {LEVEL_CLASS.map((c) => (
          <span key={c} className={`size-3 rounded-[3px] ${c}`} />
        ))}
        More
      </div>
    </section>
  );
}
