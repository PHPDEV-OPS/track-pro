"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Music, Volume2, VolumeX } from "lucide-react";
import { updateSettings } from "@/actions/settings";
import type { MusicLink } from "@/db/schema";
import {
  AMBIENT_SOUNDS,
  linkIdOf,
  musicChoice,
  SOUND_LABEL,
  type SoundChoice,
  type StoredSound,
} from "@/lib/sounds";

type Pending = { ambientSound?: StoredSound; ambientVolume?: number; musicLinkId?: string | null };

/** The stored pair for a picker value: a music link always travels with MUSIC (spec 0005). */
const toStored = (c: SoundChoice): Pick<Pending, "ambientSound" | "musicLinkId"> => {
  const id = linkIdOf(c);
  return id ? { ambientSound: "MUSIC", musicLinkId: id } : { ambientSound: c as StoredSound, musicLinkId: null };
};

/**
 * Sound choice and volume, updated optimistically. Saves are debounced; a failed save keeps
 * the latest values and retries once the browser is back online, with no error shown (spec 0002 AC-7).
 * If the picked music link was deleted elsewhere, the choice falls back to Off (spec 0005 AC-9).
 */
export function useSoundSettings(
  initialChoice: SoundChoice,
  initialVolume: number,
  onLinkGone?: (id: string) => void,
) {
  const [choice, setChoiceState] = useState(initialChoice);
  const [volume, setVolumeState] = useState(initialVolume);
  const pending = useRef<Pending>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const gone = useRef(onLinkGone);
  // Lets a save retry itself (the link fallback below) without the callback naming itself.
  const again = useRef<() => void>(() => {});
  useEffect(() => {
    gone.current = onLinkGone;
  });

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const data = pending.current;
    if (Object.keys(data).length === 0) return;
    pending.current = {};
    try {
      const res = await updateSettings(data);
      if (res && "error" in res && data.musicLinkId) {
        setChoiceState("OFF");
        gone.current?.(data.musicLinkId);
        pending.current = { ambientVolume: data.ambientVolume, ...pending.current, ambientSound: "OFF", musicLinkId: null };
        if (pending.current.ambientVolume === undefined) delete pending.current.ambientVolume;
        again.current();
      }
    } catch {
      // Keep it for the online retry below; newer changes made while this save was in flight win.
      pending.current = { ...data, ...pending.current };
    }
  }, []);

  useEffect(() => {
    again.current = () => void flush();
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

  const setChoice = useCallback(
    (c: SoundChoice) => {
      setChoiceState(c);
      queue(toStored(c), 0);
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

  return { choice, volume, setChoice, setVolume };
}

/** The picker: Off, the built in sounds, then the user's saved music links (spec 0005 AC-4). */
export function SoundSelect({
  choice,
  links,
  onChange,
  className = "",
  label = "Background sound",
}: {
  choice: SoundChoice;
  links: MusicLink[];
  onChange: (c: SoundChoice) => void;
  className?: string;
  label?: string;
}) {
  const known = !linkIdOf(choice) || links.some((l) => musicChoice(l.id) === choice);
  return (
    <select
      aria-label={label}
      value={known ? choice : "OFF"}
      onChange={(e) => onChange(e.target.value as SoundChoice)}
      className={`h-11 min-w-0 rounded-lg border border-border bg-background px-2 ${className}`}
    >
      {AMBIENT_SOUNDS.map((s) => (
        <option key={s} value={s}>
          {SOUND_LABEL[s]}
        </option>
      ))}
      {links.length > 0 && (
        <optgroup label="My music">
          {links.map((l) => (
            <option key={l.id} value={musicChoice(l.id)}>
              {l.title}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export function SoundControl({
  choice,
  links,
  volume,
  onChoice,
  onVolume,
  needsTap,
  onTap,
  children,
}: {
  choice: SoundChoice;
  links: MusicLink[];
  volume: number;
  onChoice: (c: SoundChoice) => void;
  onVolume: (v: number) => void;
  needsTap: boolean;
  onTap: () => void;
  /** The music card, when a link is picked. */
  children?: React.ReactNode;
}) {
  const off = choice === "OFF";
  const linkId = linkIdOf(choice);
  const spotify = links.find((l) => l.id === linkId)?.provider === "SPOTIFY";
  return (
    <div role="group" aria-label="Sound" className="flex flex-col items-center gap-3 border-t border-border pt-5">
      <div className="grid w-full grid-cols-[auto_minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
        {off ? (
          <VolumeX className="size-4 text-muted" aria-hidden />
        ) : linkId ? (
          <Music className="size-4 text-accent" aria-hidden />
        ) : (
          <Volume2 className="size-4 text-accent" aria-hidden />
        )}
        <SoundSelect choice={choice} links={links} onChange={onChoice} className="max-w-44" />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={volume}
          disabled={off || spotify}
          aria-label="Sound volume"
          aria-valuetext={`${volume}%`}
          aria-describedby={spotify ? "spotify-volume-hint" : undefined}
          onChange={(e) => onVolume(Number(e.target.value))}
          className="w-full min-w-0 accent-[var(--accent)] disabled:opacity-40"
        />
        <span className="w-9 text-right font-mono text-xs tabular-nums text-muted" aria-hidden>
          {volume}
        </span>
      </div>
      {spotify && (
        <p id="spotify-volume-hint" className="text-xs text-muted">
          Use Spotify&apos;s own volume.
        </p>
      )}
      {links.length < 5 && (
        <Link href="/settings#sound" className="text-xs text-muted underline-offset-4 hover:text-foreground hover:underline">
          {links.length ? "Add music" : "Add music from YouTube or Spotify"}
        </Link>
      )}
      {children}
      {needsTap && (
        <button
          type="button"
          onClick={onTap}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-accent px-4 text-sm text-accent"
        >
          <Volume2 className="size-4" aria-hidden /> Tap to resume sound
        </button>
      )}
    </div>
  );
}
