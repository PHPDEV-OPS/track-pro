"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { deleteEntry, getDayEntries, updateEntry } from "@/actions/entries";
import type { Cell } from "@/lib/heatmap";
import { formatClock } from "@/lib/timer";
import { Heatmap } from "./heatmap";
import { ImageDrop } from "./image-drop";

type DayEntry = Awaited<ReturnType<typeof getDayEntries>>[number];

export function History({ cells }: { cells: Cell[] }) {
  const [day, setDay] = useState<string | null>(null);
  const [entries, setEntries] = useState<DayEntry[] | null>(null);
  const [pending, start] = useTransition();

  function open(date: string) {
    setDay(date);
    setEntries(null);
    start(async () => setEntries(await getDayEntries(date)));
  }

  const refresh = () => day && start(async () => setEntries(await getDayEntries(day)));

  return (
    <div className="space-y-4">
      <Heatmap cells={cells} selected={day} onSelectDay={open} />
      {day && (
        <section aria-label="Day details" className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">{format(new Date(`${day}T12:00:00`), "EEEE, MMM d")}</h2>
            <button type="button" onClick={() => setDay(null)} className="text-xs text-muted">
              Close
            </button>
          </div>
          {entries === null || pending ? (
            <p className="text-sm text-muted">Loading...</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted">No focus sessions this day.</p>
          ) : (
            <ul className="space-y-3">
              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} onChanged={refresh} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function EntryRow({ entry, onChanged }: { entry: DayEntry; onChanged: () => void }) {
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [imageUrl, setImageUrl] = useState(entry.imageUrl);
  const [saved, setSaved] = useState(true);
  const [pending, start] = useTransition();

  return (
    <li className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-mono">{formatClock(entry.durationSec)}</span>
        <span className="text-muted">{format(new Date(entry.startedAt), "p")}</span>
        <button
          type="button"
          aria-label="Delete session"
          className="text-muted hover:text-danger"
          onClick={() => {
            if (confirm("Delete this session?")) start(async () => {
              await deleteEntry(entry.id);
              onChanged();
            });
          }}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <textarea
        aria-label="Notes"
        value={notes}
        maxLength={2000}
        rows={2}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        className="w-full rounded-lg border border-border bg-background p-2 text-sm"
        placeholder="Add a note"
      />
      <ImageDrop
        value={imageUrl}
        onChange={(url) => {
          setImageUrl(url);
          start(async () => {
            await updateEntry({ id: entry.id, imageUrl: url });
          });
        }}
      />
      {!saved && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await updateEntry({ id: entry.id, notes });
              setSaved(true);
            })
          }
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg"
        >
          Save note
        </button>
      )}
    </li>
  );
}
