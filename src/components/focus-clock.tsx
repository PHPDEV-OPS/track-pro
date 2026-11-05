"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Minimize2, Pause, Play, Square, WifiOff, X } from "lucide-react";
import {
  completeSession,
  discardSession,
  getActiveSession,
  pauseSession,
  resumeSession,
  startSession,
  type SessionDTO,
} from "@/actions/session";
import { ambient } from "@/lib/ambient";
import { createId } from "@/lib/id";
import {
  applyLocal,
  CONFLICT_TEXT,
  isNetworkError,
  loadQueue,
  recordOffset,
  replay,
  saveQueue,
  serverNow,
  type QueuedOp,
  type SendResult,
} from "@/lib/offline-queue";
import type { MusicLink } from "@/db/schema";
import { builtInOf, linkIdOf, type SoundChoice } from "@/lib/sounds";
import { elapsedSec, formatClock, formatLed, MIN_SAVE_SEC } from "@/lib/timer";
import { CompleteDialog } from "./complete-dialog";
import { MusicCard } from "./music-card";
import { SoundControl, useSoundSettings } from "./sound-control";
import { SegmentClock } from "./segment-clock";
import { WallClock } from "./wall-clock";

const STORE = "trackpro.session";
const PRESETS = [25, 50, 90];

function readLocal(): SessionDTO | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as SessionDTO) : null;
  } catch {
    return null;
  }
}

function writeLocal(s: SessionDTO | null) {
  try {
    if (s) localStorage.setItem(STORE, JSON.stringify(s));
    else localStorage.removeItem(STORE);
  } catch {
    /* storage can be unavailable; the server session is the source of truth */
  }
}

const subscribeAudio = (fn: () => void) => ambient().subscribe(fn);
const subscribeOnline = (fn: () => void) => {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
};

/** Sends one queued timer action to the server and classifies the outcome (spec 0003). */
async function send(op: QueuedOp): Promise<SendResult> {
  // An action queued while online is sent without its time, so the server stamps it as before (AC-8).
  const at = op.live ? undefined : op.at;
  try {
    if (op.op === "complete") {
      const r = await completeSession({ at, entryId: op.entryId!, notes: op.notes, imageUrl: op.imageUrl });
      return "conflict" in r ? { kind: "conflict", code: r.conflict } : { kind: "ok", session: null };
    }
    const r = await (op.op === "pause" ? pauseSession : resumeSession)({ at });
    if ("conflict" in r) return { kind: "conflict", code: r.conflict };
    recordOffset(r.serverTime);
    return { kind: "ok", session: r };
  } catch (e) {
    return isNetworkError(e) ? { kind: "network" } : { kind: "error" };
  }
}

export function FocusClock({
  userId,
  initialSession,
  clockStyle,
  initialChoice,
  musicLinks,
  initialVolume,
}: {
  userId: string;
  initialSession: SessionDTO | null;
  clockStyle: "DIGITAL" | "WALL_CLOCK";
  initialChoice: SoundChoice;
  musicLinks: MusicLink[];
  initialVolume: number;
}) {
  const [session, setSession] = useState<SessionDTO | null>(initialSession);
  // Start from the server's clock so the first render matches the server HTML (no hydration mismatch).
  const [now, setNow] = useState(() => (initialSession ? Date.parse(initialSession.serverTime) : Date.now()));
  const [mins, setMins] = useState("25");
  const [unit, setUnit] = useState<"min" | "hr">("min");
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [pending, startTransition] = useTransition();
  const chimed = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const [full, setFull] = useState(false);
  // Links deleted elsewhere drop out of the picker at once (spec 0005 AC-9).
  const [goneLinks, setGoneLinks] = useState<string[]>([]);
  const links = musicLinks.filter((l) => !goneLinks.includes(l.id));
  const { choice, volume, setChoice, setVolume } = useSoundSettings(initialChoice, initialVolume, (id) =>
    setGoneLinks((g) => [...g, id]),
  );
  const sound = builtInOf(choice);
  const musicLink = links.find((l) => l.id === linkIdOf(choice)) ?? null;
  const [duck, setDuck] = useState(0);
  const router = useRouter();
  // Audio can only start after a click in this tab (browser autoplay rules, AC-6).
  const audioOn = useSyncExternalStore(subscribeAudio, () => ambient().unlocked, () => false);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  // Offline timer actions (spec 0003): how many wait to sync, and whether the last replay hit a network failure.
  const [queued, setQueued] = useState(0);
  const [netFailed, setNetFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const replaying = useRef(false);
  const offline = !online || netFailed;

  // Display mode: the timer panel goes full screen with only the clock and what is playing, ready to
  // cast (Chrome "Cast tab") or move to a second screen. Controls hide until you move, tap or press a key.
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === panel.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const [chrome, setChrome] = useState(true);
  const chromeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wake = useCallback(() => {
    setChrome(true);
    clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => setChrome(false), 3000);
  }, []);
  useEffect(() => {
    if (!full) return;
    const id = setTimeout(wake, 0);
    return () => {
      clearTimeout(id);
      clearTimeout(chromeTimer.current);
    };
  }, [full, wake]);

  // Keep the screen awake while displaying; the browser drops the lock when the tab hides, so take it again.
  useEffect(() => {
    if (!full || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const take = () => {
      if (document.visibilityState === "visible") navigator.wakeLock.request("screen").then((l) => (lock = l), () => {});
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      document.removeEventListener("visibilitychange", take);
      void lock?.release();
    };
  }, [full]);

  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (panel.current?.requestFullscreen) panel.current.requestFullscreen().catch(() => {});
  }

  const apply = useCallback((s: SessionDTO | null) => {
    setSession(s);
    writeLocal(s);
  }, []);

  /** Replays queued actions in order; the server wins conflicts, with a notice (spec 0003 AC-2, AC-5). */
  const flush = useCallback(async (): Promise<void> => {
    if (replaying.current || loadQueue(userId).length === 0) return;
    replaying.current = true;
    let again = false;
    try {
      const out = await replay(userId, send);
      const left = loadQueue(userId).length;
      setQueued(left);
      setNetFailed(out.offline);
      if (out.conflicts.length) {
        setNotice(CONFLICT_TEXT[out.conflicts[out.conflicts.length - 1]]);
        try {
          const fresh = await getActiveSession();
          if (fresh) recordOffset(fresh.serverTime);
          if (loadQueue(userId).length === 0) apply(fresh);
        } catch {
          /* resync on the next trigger */
        }
      } else if (left === 0 && out.session !== undefined) {
        apply(out.session);
      }
      // Clicks made during the replay wait at the tail.
      again = !out.offline && loadQueue(userId).length > 0;
    } finally {
      replaying.current = false;
    }
    if (again) await flush();
  }, [userId, apply]);

  // Server is the source of truth; localStorage only fills in if the server had nothing (offline),
  // or while actions are still queued, since the server has not seen them yet.
  useEffect(() => {
    const pendingOps = loadQueue(userId).length;
    if (initialSession && !pendingOps) {
      recordOffset(initialSession.serverTime);
      writeLocal(initialSession);
      return;
    }
    const local = readLocal();
    const id = setTimeout(() => {
      setQueued(pendingOps);
      if (local || pendingOps) setSession(local);
      void flush();
    }, 0);
    return () => clearTimeout(id);
  }, [initialSession, userId, flush]);

  useEffect(() => {
    if (!musicLinks.length) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [musicLinks.length, router]);

  // Replay triggers: back online, and the tab becoming visible again (AC-2).
  useEffect(() => {
    const retry = () => {
      setNetFailed(false);
      void flush();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush]);

  /** Pause, resume and complete go through the queue: applied locally at once, synced in order (AC-1). */
  function act(op: Pick<QueuedOp, "op" | "entryId" | "notes" | "imageUrl">) {
    setError(null);
    setNotice(null);
    const q = loadQueue(userId);
    const next: QueuedOp = {
      ...op,
      at: new Date(serverNow()).toISOString(),
      live: navigator.onLine && q.length === 0,
    };
    apply(applyLocal(session, next));
    saveQueue(userId, [...q, next]);
    setQueued(q.length + 1);
    void flush();
  }

  const running = session?.status === "RUNNING";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  // The background sound follows the session: plays only while RUNNING (AC-3, AC-4).
  useEffect(() => {
    ambient().sync(running, sound, volume);
  }, [running, sound, volume, audioOn]);
  useEffect(() => () => ambient().sync(false, "OFF", 0), []);

  // Unlock on every Start and Resume, even with sound Off, so the target bell can ring later.
  function unlockAudio() {
    ambient().unlock();
  }

  useEffect(() => {
    if (full && !session && document.fullscreenElement) void document.exitFullscreen();
  }, [full, session]);

  const elapsed = session ? elapsedSec(session, now) : 0;
  const remaining = session ? session.targetSec - elapsed : 0;

  useEffect(() => {
    if (!session) {
      chimed.current = false;
      return;
    }
    if (remaining <= 0 && !chimed.current && running) {
      chimed.current = true;
      ambient().ring();
      setDuck((n) => n + 1);
    }
  }, [remaining, session, running]);

  useEffect(() => {
    if (!session) {
      document.title = "track-pro";
      return;
    }
    document.title = `${formatClock(remaining)} · track-pro`;
  }, [session, remaining]);

  function run(fn: () => Promise<SessionDTO | void>) {
    setError(null);
    startTransition(async () => {
      try {
        const next = await fn();
        if (next) {
          recordOffset(next.serverTime);
          apply(next);
        }
      } catch {
        setError("Something went wrong. Check your connection and try again.");
      }
    });
  }

  function start() {
    const n = Number(mins);
    const targetSec = Math.round(n * (unit === "hr" ? 3600 : 60));
    if (!Number.isFinite(n) || targetSec < 60 || targetSec > 12 * 3600) {
      setError("Pick a target between 1 minute and 12 hours.");
      return;
    }
    chimed.current = false;
    unlockAudio();
    run(() => startSession({ targetSec }));
  }

  const label = session
    ? remaining >= 0
      ? `${formatClock(remaining)} remaining`
      : `${formatClock(remaining)} overtime`
    : "No active session";

  function onDisplayKey(e: React.KeyboardEvent) {
    wake();
    // Browsers usually exit full screen on Esc themselves; this covers the ones that pass it to the page.
    if (e.key === "Escape" && !completing && document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (e.key !== " " || !session || completing || (e.target as HTMLElement).closest("button,input,select,textarea")) return;
    e.preventDefault();
    if (running) act({ op: "pause" });
    else {
      unlockAudio();
      act({ op: "resume" });
    }
  }

  const preview = Number(mins) * (unit === "hr" ? 3600 : 60) || 0;
  const clockText = formatClock(session ? remaining : preview);
  const progress = session ? Math.min(1, elapsed / session.targetSec) : 0;
  const status = !session
    ? "Ready"
    : session.status === "PAUSED"
      ? "Paused"
      : remaining < 0
        ? "Overtime"
        : "Focusing";
  const ctrl = "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm";

  return (
    <section
      ref={panel}
      aria-label="Focus timer"
      tabIndex={full ? -1 : undefined}
      onPointerMove={full ? wake : undefined}
      onPointerDown={full ? wake : undefined}
      onKeyDown={full ? onDisplayKey : undefined}
      className={
        full
          ? `relative flex flex-col items-center justify-center gap-8 bg-background px-6 pt-6 pb-32 outline-none ${chrome ? "" : "cursor-none"}`
          : "flex flex-col gap-6 rounded-xl border border-border bg-card p-4 sm:p-6 lg:sticky lg:top-6"
      }
    >
      {session && clockStyle === "WALL_CLOCK" ? (
        <div className="flex flex-col items-center">
          <WallClock
            elapsedSec={elapsed}
            targetSec={session.targetSec}
            label={label}
            className={full ? "w-[min(70vh,90vw)]" : "w-full max-w-[320px]"}
          />
          <p className={`mt-3 font-mono font-semibold tabular-nums ${full ? "text-5xl" : "text-3xl"}`} aria-hidden>
            {clockText}
          </p>
          <p className="mt-1 text-sm text-muted">{status}</p>
        </div>
      ) : (
        // The LED clock: always HH:MM:SS in the theme accent with a glow; idle shows the target, unlit.
        <div className={`led-halo mx-auto flex w-full flex-col items-center gap-5 ${full ? "max-w-[min(90vw,150vh)] py-10" : "py-6"}`}>
          <SegmentClock
            text={formatLed(session ? remaining : preview)}
            className={`w-full ${full ? "" : "max-w-[340px]"} ${session ? "led-glow text-accent" : "text-muted"} ${
              session?.status === "PAUSED" ? "opacity-60" : ""
            }`}
          />
          {/* A thin progress bar in place of the ring: full and glowing in overtime, dimmed while paused. */}
          <div className={`h-1.5 w-full overflow-hidden rounded-full bg-border ${full ? "max-w-[min(80vw,130vh)]" : "max-w-[300px]"}`} aria-hidden>
            <div
              className={`h-full rounded-full bg-accent transition-[width,opacity] duration-200 ease-out ${session ? "led-glow" : ""} ${
                session?.status === "PAUSED" ? "opacity-40" : ""
              }`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className={full ? "text-xl text-muted" : "text-sm text-muted"}>{status}</p>
          {full && session && (
            <p className="-mt-2 font-mono text-base tabular-nums text-muted">Target {formatLed(session.targetSec)}</p>
          )}
        </div>
      )}
      <p className="sr-only" role="timer" aria-live="off">
        {label}
      </p>

      {!session ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
          className="flex flex-col items-center gap-4"
        >
          <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Presets">
            {PRESETS.map((p) => {
              const on = unit === "min" && mins === String(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setUnit("min");
                    setMins(String(p));
                  }}
                  className={`h-11 rounded-full border px-4 text-sm ${
                    on ? "border-accent bg-accent-soft" : "border-border hover:border-accent"
                  }`}
                >
                  {p}m
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted" htmlFor="target">
              Target
            </label>
            <input
              id="target"
              inputMode="decimal"
              value={mins}
              onChange={(e) => setMins(e.target.value)}
              className="h-11 w-20 rounded-lg border border-border bg-background px-3 text-center font-mono"
            />
            <select
              aria-label="Unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as "min" | "hr")}
              className="h-11 rounded-lg border border-border bg-background px-2"
            >
              <option value="min">minutes</option>
              <option value="hr">hours</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={pending || offline || queued > 0}
            className={`${ctrl} w-full bg-accent font-semibold text-accent-fg disabled:opacity-60`}
          >
            <Play className="size-4" aria-hidden /> Start focus
          </button>
          {offline && <p className="text-xs text-muted">Needs a connection</p>}
        </form>
      ) : (
        // In display mode the controls float at the bottom and fade out after 3 s without input.
        <div
          className={
            full
              ? `fixed inset-x-0 bottom-8 mx-auto flex w-full max-w-sm flex-wrap items-center justify-center gap-2 px-4 transition-opacity duration-300 ${
                  chrome ? "opacity-100" : "pointer-events-none opacity-0"
                }`
              : "flex w-full max-w-sm flex-wrap items-center justify-center gap-2 self-center"
          }
        >
          <div className="flex min-w-[12rem] flex-1 gap-2">
          {running ? (
            <button
              type="button"
              onClick={() => act({ op: "pause" })}
              disabled={pending}
              className={`${ctrl} flex-1 border border-border`}
            >
              <Pause className="size-4" aria-hidden /> Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                act({ op: "resume" });
              }}
              disabled={pending}
              className={`${ctrl} flex-1 border border-border`}
            >
              <Play className="size-4" aria-hidden /> Resume
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (elapsed < MIN_SAVE_SEC) {
                if (confirm("Under a minute, so this won't be saved. Discard the session?")) {
                  run(async () => {
                    await discardSession();
                    apply(null);
                  });
                }
              } else setCompleting(true);
            }}
            disabled={pending}
            className={`${ctrl} flex-1 bg-accent font-semibold text-accent-fg`}
          >
            <Square className="size-4" aria-hidden /> Complete
          </button>
          </div>
          <div className="flex gap-2">
          {/* Discard stays off the display; it is one tap away when you exit. */}
          {!full && (
          <button
            type="button"
            aria-label="Discard session"
            title={offline ? "Needs a connection" : "Discard session"}
            disabled={pending || offline || queued > 0}
            onClick={() => {
              if (confirm("Discard this session without saving?")) {
                run(async () => {
                  await discardSession();
                  apply(null);
                });
              }
            }}
            className={`${ctrl} w-11 border border-border px-0 text-muted disabled:opacity-40`}
          >
            <X className="size-4" aria-hidden />
          </button>
          )}
          <button
            type="button"
            aria-label={full ? "Exit display mode" : "Enter display mode"}
            title={full ? "Exit display mode (Esc)" : "Display mode: just the clock, to cast or put on a second screen"}
            onClick={toggleFull}
            className={`${ctrl} w-11 border border-border px-0 text-muted`}
          >
            {full ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
          </button>
          </div>
        </div>
      )}
      {(offline || queued > 0) && (
        <p className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted">
            <WifiOff className="size-3.5" aria-hidden />
            {offline ? "Offline, will sync" : "Syncing..."}
          </span>
        </p>
      )}
      {notice && (
        <p role="status" className="text-center text-sm text-muted">
          {notice}
        </p>
      )}
      <SoundControl
        choice={choice}
        links={links}
        volume={volume}
        onChoice={(c) => {
          unlockAudio();
          setChoice(c);
        }}
        onVolume={setVolume}
        needsTap={running && sound !== "OFF" && !audioOn}
        onTap={() => unlockAudio()}
        display={full}
      >
        {musicLink && (
          <MusicCard
            link={musicLink}
            playing={running && !completing}
            volume={volume}
            duck={duck}
            className={full ? "fixed right-4 bottom-4 max-w-[360px] rounded-xl bg-card p-2" : ""}
          />
        )}
      </SoundControl>
      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
      {completing && session && (
        <CompleteDialog
          durationLabel={formatClock(elapsed)}
          offline={offline}
          onCancel={() => setCompleting(false)}
          onSave={async (v) => {
            setCompleting(false);
            act({ op: "complete", entryId: createId(), notes: v.notes, imageUrl: v.imageUrl });
          }}
        />
      )}
    </section>
  );
}
