"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MusicLink } from "@/db/schema";
import { volumeToGain } from "@/lib/ambient";
import { spotifyUri } from "@/lib/music";

// The official YouTube and Spotify players, driven by the focus session (spec 0005).
// The players are never covered or restyled; hints sit below them.

type Status = "loading" | "ready" | "blocked" | "unplayable";
type Controller = { play: () => void; pause: () => void; setVolume?: (v: number) => void; isPlaying: () => boolean; destroy: () => void };

/* eslint-disable @typescript-eslint/no-explicit-any -- the two vendor APIs ship without types */
const apis = new Map<string, Promise<any>>();

function youtubeApi(): Promise<any> {
  if (!apis.has("yt")) {
    apis.set(
      "yt",
      new Promise((resolve, reject) => {
        const w = window as any;
        if (w.YT?.Player) return resolve(w.YT);
        const prev = w.onYouTubeIframeAPIReady;
        w.onYouTubeIframeAPIReady = () => {
          prev?.();
          resolve(w.YT);
        };
        const s = Object.assign(document.createElement("script"), { src: "https://www.youtube.com/iframe_api", async: true });
        s.onerror = () => {
          apis.delete("yt");
          reject(new Error("youtube api"));
        };
        document.head.appendChild(s);
      }),
    );
  }
  return apis.get("yt")!;
}

function spotifyApi(): Promise<any> {
  if (!apis.has("sp")) {
    apis.set(
      "sp",
      new Promise((resolve, reject) => {
        const w = window as any;
        w.onSpotifyIframeApiReady = (api: any) => resolve(api);
        const s = Object.assign(document.createElement("script"), { src: "https://open.spotify.com/embed/iframe-api/v1", async: true });
        s.onerror = () => {
          apis.delete("sp");
          reject(new Error("spotify api"));
        };
        document.head.appendChild(s);
      }),
    );
  }
  return apis.get("sp")!;
}

const subscribeOnline = (fn: () => void) => {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
};

const FADE_MS = 1000;
const DUCK = { level: 0.2, ms: 4000 };

export function MusicCard({
  link,
  playing,
  volume,
  duck,
  className = "",
}: {
  link: MusicLink;
  /** Session RUNNING and the Complete dialog closed (AC-5). */
  playing: boolean;
  volume: number;
  /** Increments when the target bell rings, to dip YouTube under it. */
  duck: number;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const ctl = useRef<Controller | null>(null);
  const want = useRef(playing);
  const level = useRef(0);
  const dip = useRef(1);
  const vol = useRef(volume);
  const fade = useRef<ReturnType<typeof setInterval>>(undefined);
  const check = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const youtube = link.provider === "YOUTUBE";

  const applyVolume = () => ctl.current?.setVolume?.(Math.round(100 * volumeToGain(vol.current) * level.current * dip.current));

  /** Plays or pauses; YouTube fades over a second, Spotify switches directly. */
  const drive = (on: boolean) => {
    const c = ctl.current;
    if (!c) return;
    clearInterval(fade.current);
    clearTimeout(check.current);
    if (!c.setVolume) {
      if (on) c.play();
      else c.pause();
    } else {
      if (on) c.play();
      const from = level.current;
      const to = on ? 1 : 0;
      const start = performance.now();
      fade.current = setInterval(() => {
        const t = Math.min(1, (performance.now() - start) / FADE_MS);
        level.current = from + (to - from) * t;
        applyVolume();
        if (t === 1) {
          clearInterval(fade.current);
          if (!on) c.pause();
        }
      }, 100);
    }
    // Started from code but nothing plays: the browser or Spotify blocked it (AC-7).
    if (on) check.current = setTimeout(() => !c.isPlaying() && setStatus((s) => (s === "unplayable" ? s : "blocked")), 2500);
  };

  // Build the player when the link is picked, and again after an offline load (AC-8).
  useEffect(() => {
    const el = box.current;
    if (!el || !navigator.onLine) return;
    let cancelled = false;
    const mount = document.createElement("div");
    el.replaceChildren(mount);
    const ready = () => {
      if (cancelled) return;
      setStatus("ready");
      applyVolume();
      if (want.current) drive(true);
    };

    if (youtube) {
      youtubeApi()
        .then((YT) => {
          if (cancelled) return;
          const video = link.kind === "VIDEO";
          let state = -1;
          const p = new YT.Player(mount, {
            host: "https://www.youtube-nocookie.com",
            width: "100%",
            height: "100%",
            videoId: video ? link.externalId : undefined,
            playerVars: {
              playsinline: 1,
              rel: 0,
              origin: location.origin,
              // Videos loop by playing themselves as a one item playlist; playlists loop below.
              ...(video ? { loop: 1, playlist: link.externalId } : { listType: "playlist", list: link.externalId }),
            },
            events: {
              onReady: () => {
                if (!video) p.setLoop(true);
                ready();
              },
              onStateChange: (e: { data: number }) => {
                state = e.data;
                if (state === YT.PlayerState.PLAYING) setStatus("ready");
              },
              onError: (e: { data: number }) => [100, 101, 150].includes(e.data) && setStatus("unplayable"),
              onAutoplayBlocked: () => setStatus("blocked"),
            },
          });
          ctl.current = {
            play: () => p.playVideo(),
            pause: () => p.pauseVideo(),
            setVolume: (v) => p.setVolume?.(v),
            isPlaying: () => state === YT.PlayerState.PLAYING,
            destroy: () => p.destroy(),
          };
        })
        .catch(() => !cancelled && setStatus("unplayable"));
    } else {
      const loadTimer = setTimeout(() => !cancelled && setStatus((s) => (s === "loading" ? "unplayable" : s)), 10000);
      spotifyApi()
        .then((API) => {
          if (cancelled) return;
          API.createController(mount, { uri: spotifyUri(link), width: "100%", height: 152 }, (c: any) => {
            if (cancelled) return c.destroy?.();
            el.querySelector("iframe")?.setAttribute("allow", "autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture");
            let started = false;
            let paused = true;
            const markPlaying = () => {
              started = true;
              paused = false;
              setStatus("ready");
            };
            c.addListener("ready", () => {
              clearTimeout(loadTimer);
              ready();
            });
            c.addListener("playback_started", markPlaying);
            c.addListener("playback_update", (e: { data?: { isPaused?: boolean } }) => {
              if (e.data?.isPaused === false) markPlaying();
              else if (e.data?.isPaused) paused = true;
            });
            ctl.current = {
              // play() starts the item; afterwards resume() continues where it was (AC-5).
              play: () => (started ? c.resume() : c.play()),
              pause: () => c.pause(),
              isPlaying: () => !paused,
              destroy: () => c.destroy?.(),
            };
          });
        })
        .catch(() => !cancelled && setStatus("unplayable"));
    }
    return () => {
      cancelled = true;
      clearInterval(fade.current);
      clearTimeout(check.current);
      try {
        ctl.current?.destroy();
      } catch {
        /* the vendor player may already be gone */
      }
      ctl.current = null;
      level.current = 0;
      setStatus("loading");
    };
    // drive and ready read refs only; rebuilding on them would restart the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link.id, attempt]);

  useEffect(() => {
    const retry = () => !ctl.current && setAttempt((n) => n + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);

  // Follow the session.
  useEffect(() => {
    want.current = playing;
    drive(playing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // The slider follows on the same curve as the built in sounds (spec 0002).
  useEffect(() => {
    vol.current = volume;
    applyVolume();
  }, [volume]);

  // Dip under the target bell, then come back (YouTube only; Spotify has no volume control).
  useEffect(() => {
    if (!duck || !youtube) return;
    dip.current = DUCK.level;
    applyVolume();
    const id = setTimeout(() => {
      dip.current = 1;
      applyVolume();
    }, DUCK.ms);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duck]);

  return (
    <div className={`w-full space-y-2 ${className}`}>
      <div
        ref={box}
        // A ring, not a border, so the player keeps its full size (YouTube needs at least 200 by 200).
        className={`w-full overflow-hidden rounded-lg ring-1 ring-border ${youtube ? "h-[200px]" : "h-[152px]"}`}
      />
      <p className="text-center text-xs text-muted" aria-live="polite">
        {!online
          ? "Music needs a connection."
          : status === "unplayable"
            ? youtube
              ? "This video can't play here. Pick another link in Settings."
              : "This can't play here. Pick another link in Settings."
            : status === "blocked"
              ? "Press play in the player."
              : !youtube
                ? "Log in to Spotify in this browser for full tracks."
                : ""}
      </p>
    </div>
  );
}
