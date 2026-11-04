"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Maximize2, Minimize2, Pause, Play, Square, X } from "lucide-react";
import {
  completeSession,
  discardSession,
  pauseSession,
  resumeSession,
  startSession,
  type SessionDTO,
} from "@/actions/session";
import { ambient } from "@/lib/ambient";
import type { AmbientSound } from "@/lib/sounds";
import { elapsedSec, formatClock, MIN_SAVE_SEC } from "@/lib/timer";
import { CompleteDialog } from "./complete-dialog";
import { SoundControl, useSoundSettings } from "./sound-control";
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

function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.25);
      o.stop(ctx.currentTime + i * 0.25 + 0.6);
    });
  } catch {
    /* audio may be blocked until a user gesture */
  }
}

const subscribeAudio = (fn: () => void) => ambient().subscribe(fn);

export function FocusClock({
  initialSession,
  clockStyle,
  initialSound,
  initialVolume,
}: {
  initialSession: SessionDTO | null;
  clockStyle: "DIGITAL" | "WALL_CLOCK";
  initialSound: AmbientSound;
  initialVolume: number;
}) {
  const [session, setSession] = useState<SessionDTO | null>(initialSession);
  const [now, setNow] = useState(() => Date.now());
  const [mins, setMins] = useState("25");
  const [unit, setUnit] = useState<"min" | "hr">("min");
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [pending, startTransition] = useTransition();
  const chimed = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const [full, setFull] = useState(false);
  const { sound, volume, setSound, setVolume } = useSoundSettings(initialSound, initialVolume);
  // Audio can only start after a click in this tab (browser autoplay rules, AC-6).
  const audioOn = useSyncExternalStore(subscribeAudio, () => ambient().unlocked, () => false);

  // Focus mode: the timer panel goes full screen with a huge clock (good for recording).
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === panel.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (panel.current?.requestFullscreen) panel.current.requestFullscreen().catch(() => {});
  }

  const apply = useCallback((s: SessionDTO | null) => {
    setSession(s);
    writeLocal(s);
  }, []);

  // Server is the source of truth; localStorage only fills in if the server had nothing (offline).
  useEffect(() => {
    if (initialSession) writeLocal(initialSession);
    else {
      const local = readLocal();
      if (!local) return;
      const id = setTimeout(() => setSession(local), 0);
      return () => clearTimeout(id);
    }
  }, [initialSession]);

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

  function unlockAudio(s: AmbientSound = sound) {
    if (s !== "OFF") ambient().unlock();
  }

  const elapsed = session ? elapsedSec(session, now) : 0;
  const remaining = session ? session.targetSec - elapsed : 0;

  useEffect(() => {
    if (!session) {
      chimed.current = false;
      return;
    }
    if (remaining <= 0 && !chimed.current && running) {
      chimed.current = true;
      ambient().duck();
      chime();
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
        if (next) apply(next);
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

  return (
    <section
      ref={panel}
      aria-label="Focus timer"
      className={
        full
          ? "flex flex-col items-center justify-center bg-background p-6"
          : "rounded-xl border border-border bg-card p-6 sm:p-10"
      }
    >
      {!session ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
          className="mx-auto flex max-w-sm flex-col items-center gap-4"
        >
          <p className="font-mono text-[clamp(3.5rem,14vw,8rem)] leading-none tabular-nums text-muted">{formatClock(Number(mins) * (unit === "hr" ? 3600 : 60) || 0)}</p>
          <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setUnit("min");
                  setMins(String(p));
                }}
                className="rounded-full border border-border px-3 py-1 text-sm hover:border-accent"
              >
                {p}m
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="target">
              Target
            </label>
            <input
              id="target"
              inputMode="decimal"
              value={mins}
              onChange={(e) => setMins(e.target.value)}
              className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-center font-mono"
            />
            <select
              aria-label="Unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as "min" | "hr")}
              className="rounded-lg border border-border bg-background px-2 py-2"
            >
              <option value="min">minutes</option>
              <option value="hr">hours</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-medium text-accent-fg disabled:opacity-60"
          >
            <Play className="size-4" /> Start focus
          </button>
        </form>
      ) : (
        <div className="flex flex-col items-center gap-5">
          {clockStyle === "WALL_CLOCK" ? (
            <div className="flex flex-col items-center">
              <WallClock
                elapsedSec={elapsed}
                targetSec={session.targetSec}
                label={label}
                className={full ? "w-[min(75vh,90vw)]" : undefined}
              />
              <p className={`mt-3 font-mono tabular-nums ${full ? "text-5xl" : "text-3xl"}`} aria-hidden>
                {formatClock(remaining)}
              </p>
            </div>
          ) : (
            <p
              className={`font-mono font-semibold leading-none tracking-tight tabular-nums ${
                full ? "text-[min(24vw,45vh)]" : "text-[clamp(4.5rem,19vw,12rem)]"
              } ${remaining < 0 ? "text-accent" : ""}`}
              aria-hidden
            >
              {formatClock(remaining)}
            </p>
          )}
          <p className="sr-only" role="timer" aria-live="off">
            {label}
          </p>
          <p className="text-sm text-muted">
            {session.status === "PAUSED" ? "Paused" : remaining < 0 ? "Overtime, still counting" : "Focusing"}
          </p>
          <div className="flex gap-2">
            {running ? (
              <button
                type="button"
                onClick={() => run(pauseSession)}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2"
              >
                <Pause className="size-4" /> Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  unlockAudio();
                  run(resumeSession);
                }}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2"
              >
                <Play className="size-4" /> Resume
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
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg"
            >
              <Square className="size-4" /> Complete
            </button>
            <button
              type="button"
              aria-label="Discard session"
              onClick={() => {
                if (confirm("Discard this session without saving?")) {
                  run(async () => {
                    await discardSession();
                    apply(null);
                  });
                }
              }}
              className="rounded-lg border border-border p-2 text-muted"
            >
              <X className="size-4" />
            </button>
            <button
              type="button"
              aria-label={full ? "Exit focus mode" : "Enter focus mode"}
              title={full ? "Exit focus mode (Esc)" : "Focus mode"}
              onClick={toggleFull}
              className="rounded-lg border border-border p-2 text-muted"
            >
              {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          </div>
        </div>
      )}
      <SoundControl
        sound={sound}
        volume={volume}
        onSound={(s) => {
          unlockAudio(s);
          setSound(s);
        }}
        onVolume={setVolume}
        needsTap={running && sound !== "OFF" && !audioOn}
        onTap={() => unlockAudio()}
      />
      {error && (
        <p role="alert" className="mt-4 text-center text-sm text-danger">
          {error}
        </p>
      )}
      {completing && session && (
        <CompleteDialog
          durationLabel={formatClock(elapsed)}
          onCancel={() => setCompleting(false)}
          onSave={async (v) => {
            await completeSession({ notes: v.notes, imageUrl: v.imageUrl });
            setCompleting(false);
            apply(null);
          }}
        />
      )}
    </section>
  );
}
