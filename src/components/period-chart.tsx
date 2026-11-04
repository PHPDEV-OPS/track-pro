"use client";

import { format } from "date-fns";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayStat } from "@/lib/queries";
import { tooltipText } from "@/lib/heatmap";

/** One bar per day for the Week and Month views (spec 0004 AC-2), colored by heat level. */
export default function PeriodChart({
  days,
  view,
  selected,
  onSelectDay,
}: {
  days: DayStat[];
  view: "week" | "month";
  selected: string | null;
  onSelectDay: (date: string) => void;
}) {
  const data = days.map((d) => {
    const date = new Date(`${d.date}T12:00:00`);
    return { ...d, hours: d.minutes / 60, tick: view === "week" ? format(date, "EEE") : format(date, "d") };
  });

  return (
    <div>
      <div className="h-56 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -16 }} accessibilityLayer={false}>
            <XAxis
              dataKey="tick"
              tickLine={false}
              axisLine={false}
              interval={view === "month" ? 2 : 0}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(h: number) => `${h}h`}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "color-mix(in srgb, var(--accent) 14%, transparent)" }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d) return null;
                return (
                  <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
                    {tooltipText(d)}
                    {d.sessions > 0 && <span className="text-muted"> in {d.sessions} {d.sessions === 1 ? "session" : "sessions"}</span>}
                  </div>
                );
              }}
            />
            <Bar
              dataKey="hours"
              radius={[4, 4, 0, 0]}
              minPointSize={2}
              className="cursor-pointer"
              onClick={(_, i) => {
                const d = data[i];
                if (d && !d.future) onSelectDay(d.date);
              }}
            >
              {data.map((d) => (
                <Cell
                  key={d.date}
                  fill={d.future ? "transparent" : `var(--heat-${d.level})`}
                  stroke={selected === d.date ? "var(--accent)" : undefined}
                  strokeWidth={selected === d.date ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* The chart is visual only; these buttons give keyboard and screen reader users the same days. */}
      <ul className="sr-only focus-within:not-sr-only focus-within:mt-2 focus-within:flex focus-within:flex-wrap focus-within:gap-1 focus-within:text-xs">
        {/* Shown while a keyboard user is inside the list, so focus is never invisible. */}
        {days
          .filter((d) => !d.future)
          .map((d) => (
            <li key={d.date}>
              <button type="button" aria-pressed={selected === d.date} onClick={() => onSelectDay(d.date)}>
                {tooltipText(d)}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
