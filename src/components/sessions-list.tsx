"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { ChevronDown, ImageIcon, Trash2, X } from "lucide-react";
import { deleteEntry, getSessions, updateEntry } from "@/actions/entries";
import type { SessionRow } from "@/lib/queries";
import { formatClock } from "@/lib/timer";
import type { View } from "@/lib/periods";
import { ImageDrop } from "./image-drop";

const dayLabel = (day: string) => format(new Date(`${day}T12:00:00`), "EEE d MMM");

/**
 * Sessions of the chosen period, newest first, 20 at a time (spec 0006 AC-5 to AC-8). A day chip
 * narrows it to one day; rows expand in place to edit notes and the screenshot.
 */
export function SessionsList({
  view,
  period,
  day,
  onClearDay,
}: {
  view: View;
  period: string;
  day: string | null;
  onClearDay: () => void;
}) {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  const load = useCallback(
    (more: string | null) =>
      start(async () => {
        try {
          const res = await getSessions({ view, period, day, cursor: more });
          setRows((prev) => (more && prev ? [...prev, ...res.rows] : res.rows));
          setCursor(res.nextCursor);
          setFailed(false);
        } catch {
          setFailed(true);
        }
      }),
    [view, period, day],
  );

  useEffect(() => load(null), [load]);

  const scope = day ? "day" : view;
  const empty = day ? "No sessions this day." : `No sessions this ${scope}. Start one from the timer.`;

  return (
    <section aria-labelledby="sessions-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="sessions-title" className="text-sm font-semibold">
          {day ? "Sessions that day" : `Sessions this ${view}`}
        </h3>
        {day && (
          <button
            type="button"
            onClick={onClearDay}
            aria-label={`Show the whole ${view} again, not just ${dayLabel(day)}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-xs"
          >
            {dayLabel(day)} <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      {failed ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
          Couldn&apos;t load sessions.
          <button type="button" onClick={() => load(null)} className="h-11 shrink-0 whitespace-nowrap rounded-lg border border-border px-3">
            Try again
          </button>
        </div>
      ) : rows === null ? (
        <p className="text-sm text-muted">Loading sessions...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className={`divide-y divide-border rounded-lg border border-border ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
          {rows.map((r) => (
            <SessionItem
              key={r.id}
              row={r}
              onDeleted={() => setRows((prev) => prev?.filter((x) => x.id !== r.id) ?? null)}
            />
          ))}
        </ul>
      )}

      {cursor && !failed && (
        <button
          type="button"
          disabled={pending}
          onClick={() => load(cursor)}
          className="h-11 w-full rounded-lg border border-border text-sm disabled:opacity-60"
        >
          {pending ? "Loading..." : "Show more"}
        </button>
      )}
    </section>
  );
}

function SessionItem({ row, onDeleted }: { row: SessionRow; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [savedNotes, setSavedNotes] = useState(row.notes ?? "");
  const [imageUrl, setImageUrl] = useState(row.imageUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const preview = savedNotes.split("\n")[0];
  const panelId = `session-${row.id}`;

  function save(fn: () => Promise<void>) {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch {
        setError("Couldn't save. Check your connection and try again.");
      }
    });
  }

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 px-3 py-3 text-left text-sm hover:bg-accent-soft"
      >
        <span className="text-muted">
          {dayLabel(row.day)} <span className="font-mono tabular-nums">{row.time}</span>
        </span>
        <span className="min-w-0 truncate">{preview || <span className="text-muted">No notes</span>}</span>
        <span className="inline-flex items-center gap-2">
          {imageUrl && <ImageIcon className="size-4 text-muted" aria-label="Has a screenshot" />}
          <span className="font-mono tabular-nums">{formatClock(row.durationSec)}</span>
          <ChevronDown className={`size-4 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>
      {open && (
        <div id={panelId} className="space-y-3 px-3 pb-4">
          <textarea
            aria-label="Notes"
            value={notes}
            maxLength={2000}
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border bg-background p-2 text-sm"
            placeholder="What did you work on?"
          />
          <ImageDrop
            value={imageUrl}
            onChange={(url) => {
              setImageUrl(url);
              save(() => updateEntry({ id: row.id, imageUrl: url }));
            }}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("Delete this session? This can't be undone.")) {
                  save(async () => {
                    await deleteEntry(row.id);
                    onDeleted();
                  });
                }
              }}
              className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm text-danger"
            >
              <Trash2 className="size-4" aria-hidden /> Delete session
            </button>
            <button
              type="button"
              disabled={pending || notes === savedNotes}
              onClick={() =>
                save(async () => {
                  await updateEntry({ id: row.id, notes });
                  setSavedNotes(notes);
                })
              }
              className="h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-50"
            >
              {pending ? "Saving..." : "Save notes"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
