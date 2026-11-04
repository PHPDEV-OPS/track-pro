export type SessionLike = {
  status: "RUNNING" | "PAUSED";
  accumulatedSec: number;
  lastResumedAt: Date | string | null;
};

/** Elapsed focus seconds, computed from timestamps so refresh and tab close never drift (AC-4). */
export function elapsedSec(s: SessionLike, now: number = Date.now()): number {
  if (s.status === "PAUSED" || !s.lastResumedAt) return s.accumulatedSec;
  const since = Math.max(0, now - new Date(s.lastResumedAt).getTime());
  return s.accumulatedSec + Math.floor(since / 1000);
}

/** Positive while counting down, negative once in overtime (AC-5). */
export function remainingSec(s: SessionLike & { targetSec: number }, now?: number): number {
  return s.targetSec - elapsedSec(s, now);
}

export function formatClock(totalSec: number): string {
  const sign = totalSec < 0 ? "+" : "";
  const abs = Math.abs(totalSec);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const sec = abs % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return `${sign}${h > 0 ? `${h}:` : ""}${mm}:${ss}`;
}

export const MIN_TARGET_SEC = 60;
export const MAX_TARGET_SEC = 12 * 3600;
export const MIN_SAVE_SEC = 60;
