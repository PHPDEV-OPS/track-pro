"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { updateSettings } from "@/actions/settings";
import { AMBIENT_SOUNDS, SOUND_LABEL, type AmbientSound } from "@/lib/sounds";

type Pending = { ambientSound?: AmbientSound; ambientVolume?: number };

/**
 * Sound choice and volume, updated optimistically. Saves are debounced; a failed save keeps
 * the latest values and retries once the browser is back online, with no error shown (AC-7).
 */
export function useSoundSettings(initialSound: AmbientSound, initialVolume: number) {
  const [sound, setSoundState] = useState(initialSound);
  const [volume, setVolumeState] = useState(initialVolume);
  const pending = useRef<Pending>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const data = pending.current;
    if (Object.keys(data).length === 0) return;
    pending.current = {};
    try {
      await updateSettings(data);
    } catch {
      // Keep it for the online retry below; newer changes made while this save was in flight win.
      pending.current = { ...data, ...pending.current };
    }
  }, []);

  useEffect(() => {
    const retry = () => void flush();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [flush]);

  const queue = useCallback(
    (data: Pending, delay: number) => {
      pending.current = { ...pending.current, ...data };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [flush],
  );

  useEffect(() => () => void flush(), [flush]);

  const setSound = useCallback(
    (s: AmbientSound) => {
      setSoundState(s);
      queue({ ambientSound: s }, 0);
    },
    [queue],
  );
  const setVolume = useCallback(
    (v: number) => {
      setVolumeState(v);
      queue({ ambientVolume: v }, 400);
    },
    [queue],
  );

  return { sound, volume, setSound, setVolume };
}

export function SoundControl({
  sound,
  volume,
  onSound,
  onVolume,
  needsTap,
  onTap,
}: {
  sound: AmbientSound;
  volume: number;
  onSound: (s: AmbientSound) => void;
  onVolume: (v: number) => void;
  needsTap: boolean;
  onTap: () => void;
}) {
  const off = sound === "OFF";
  return (
    <div role="group" aria-label="Sound" className="mx-auto mt-6 flex max-w-md flex-col items-center gap-3">
      <div className="flex w-full flex-wrap items-center justify-center gap-3 text-sm">
        {off ? (
          <VolumeX className="size-4 text-muted" aria-hidden />
        ) : (
          <Volume2 className="size-4 text-accent" aria-hidden />
        )}
        <select
          aria-label="Background sound"
          value={sound}
          onChange={(e) => onSound(e.target.value as AmbientSound)}
          className="rounded-lg border border-border bg-background px-2 py-1.5"
        >
          {AMBIENT_SOUNDS.map((s) => (
            <option key={s} value={s}>
              {SOUND_LABEL[s]}
            </option>
          ))}
        </select>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={volume}
          disabled={off}
          aria-label="Sound volume"
          aria-valuetext={`${volume}%`}
          onChange={(e) => onVolume(Number(e.target.value))}
          className="w-32 accent-[var(--accent)] disabled:opacity-40"
        />
        <span className="w-9 text-right font-mono text-xs tabular-nums text-muted" aria-hidden>
          {volume}
        </span>
      </div>
      {needsTap && (
        <button
          type="button"
          onClick={onTap}
          className="inline-flex items-center gap-2 rounded-full border border-accent px-3 py-1 text-sm text-accent"
        >
          <Volume2 className="size-4" aria-hidden /> Tap to resume sound
        </button>
      )}
    </div>
  );
}
