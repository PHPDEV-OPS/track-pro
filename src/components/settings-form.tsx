"use client";

import { useEffect, useTransition } from "react";
import { useTheme } from "next-themes";
import { updateSettings } from "@/actions/settings";
import { THEMES, type Theme } from "@/lib/themes";

const THEME_LABEL: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
  matrix: "Matrix",
  cyberpunk: "Cyberpunk",
};

/** Pushes the saved theme into next-themes once, so a new device picks up the account theme. */
export function ThemeSync({ theme }: { theme: string }) {
  const { setTheme, theme: current } = useTheme();
  useEffect(() => {
    if (current !== theme && (THEMES as readonly string[]).includes(theme)) setTheme(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
  return null;
}

export function SettingsForm({
  clockStyle,
  theme,
  timezone,
}: {
  clockStyle: "DIGITAL" | "WALL_CLOCK";
  theme: string;
  timezone: string;
}) {
  const { setTheme, theme: active } = useTheme();
  const [pending, start] = useTransition();
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [
    timezone,
  ];

  return (
    <div className="space-y-8">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Clock style</legend>
        {(["DIGITAL", "WALL_CLOCK"] as const).map((c) => (
          <label key={c} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="clock"
              defaultChecked={clockStyle === c}
              onChange={() => start(() => updateSettings({ clockStyle: c }))}
            />
            {c === "DIGITAL" ? "Digital stopwatch" : "Wall clock"}
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Theme</legend>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={(active ?? theme) === t}
              onClick={() => {
                setTheme(t);
                start(() => updateSettings({ theme: t }));
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                (active ?? theme) === t ? "border-accent text-accent" : "border-border"
              }`}
            >
              {THEME_LABEL[t]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Timezone</span>
        <select
          defaultValue={timezone}
          onChange={(e) => start(() => updateSettings({ timezone: e.target.value }))}
          className="block w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2"
        >
          {zones.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
        <span className="text-xs text-muted">Decides which day a session counts toward on the grid.</span>
      </label>
      {pending && <p className="text-xs text-muted">Saving...</p>}
    </div>
  );
}

/** Detects the browser timezone on first visit and stores it if the account still has the UTC default. */
export function TimezoneDetect({ timezone }: { timezone: string }) {
  useEffect(() => {
    if (timezone !== "UTC") return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && detected !== "UTC") void updateSettings({ timezone: detected });
  }, [timezone]);
  return null;
}
