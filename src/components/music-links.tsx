"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { addMusicLink, deleteMusicLink, renameMusicLink } from "@/actions/music";
import type { MusicLink } from "@/db/schema";
import { defaultTitle } from "@/lib/music";

const ERRORS = {
  INVALID_URL: "That link isn't a YouTube or Spotify playlist, album, track or video.",
  LIMIT: "You can save up to 5 links.",
  DUPLICATE: "Already saved.",
  NOT_FOUND: "That link was already removed.",
} as const;

/** Saved YouTube and Spotify links in Settings: add, rename and delete (spec 0005 AC-1 to AC-3). */
export function MusicLinks({ links }: { links: MusicLink[] }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const full = links.length >= 5;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">My music</h3>
      {links.length === 0 ? (
        <p className="text-sm text-muted">No links yet. Paste a playlist, album, track or video below.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {links.map((l) => (
            <LinkRow key={l.id} link={l} />
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            try {
              const res = await addMusicLink({ url });
              if ("error" in res) setError(ERRORS[res.error]);
              else setUrl("");
            } catch {
              setError("Couldn't save. Check your connection and try again.");
            }
          });
        }}
        className="space-y-1"
      >
        <label htmlFor="music-url" className="text-sm text-muted">
          YouTube or Spotify link
        </label>
        <div className="flex gap-2">
          <input
            id="music-url"
            type="url"
            inputMode="url"
            required
            disabled={full}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://open.spotify.com/playlist/..."
            aria-invalid={!!error}
            aria-describedby={error ? "music-url-error" : undefined}
            className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <button
            type="submit"
            disabled={pending || full || !url.trim()}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-50"
          >
            <Plus className="size-4" aria-hidden /> {pending ? "Adding..." : "Add"}
          </button>
        </div>
        {error ? (
          <p id="music-url-error" role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : (
          <p className="text-xs text-muted">{full ? ERRORS.LIMIT : `Room for ${5 - links.length} more. Titles are filled in for you.`}</p>
        )}
      </form>
    </div>
  );
}

function LinkRow({ link }: { link: MusicLink }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(link.title);
  const [pending, start] = useTransition();

  return (
    <li className="flex items-center gap-2 px-3 py-2 text-sm">
      {editing ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              await renameMusicLink({ id: link.id, title });
              setEditing(false);
            });
          }}
        >
          <input
            aria-label="Link title"
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setTitle(link.title);
                setEditing(false);
              }
            }}
            className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3"
          />
          <button type="submit" disabled={pending || !title.trim()} className="h-11 rounded-lg border border-border px-3">
            Save
          </button>
        </form>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate">{link.title}</p>
            <p className="text-xs text-muted">{defaultTitle(link)}</p>
          </div>
          <button
            type="button"
            aria-label={`Rename ${link.title}`}
            onClick={() => setEditing(true)}
            className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:text-foreground"
          >
            <Pencil className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Delete ${link.title}`}
            disabled={pending}
            onClick={() => {
              if (confirm(`Delete "${link.title}"? If it's playing, the sound turns off.`)) {
                start(async () => {
                  await deleteMusicLink(link.id);
                });
              }
            }}
            className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:text-danger"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </>
      )}
    </li>
  );
}
