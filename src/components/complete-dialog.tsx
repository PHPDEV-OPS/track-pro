"use client";

import { useEffect, useRef, useState } from "react";
import { ImageDrop } from "./image-drop";

export function CompleteDialog({
  durationLabel,
  offline = false,
  onSave,
  onCancel,
}: {
  durationLabel: string;
  /** Offline the session still saves (queued, spec 0003), but images need a connection. */
  offline?: boolean;
  onSave: (v: { notes: string; imageUrl: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    area.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function save(withEvidence: boolean) {
    setSaving(true);
    setError(null);
    try {
      await onSave(withEvidence ? { notes, imageUrl } : { notes: "", imageUrl: null });
    } catch {
      setError("Could not save. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-title"
        className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-5"
      >
        <div>
          <h2 id="complete-title" className="text-lg font-semibold">
            Nice work, {durationLabel} focused
          </h2>
          <p className="text-sm text-muted">Add a note or screenshot, or just save.</p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Notes (optional)</span>
          <textarea
            ref={area}
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-background p-2 text-sm"
            placeholder="What did you ship?"
          />
        </label>
        {offline ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted">
            You&apos;re offline. Add it later from the day view.
          </p>
        ) : (
          <ImageDrop value={imageUrl} onChange={setImageUrl} onBusy={setUploading} />
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-between gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-muted" disabled={saving}>
            Keep going
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving || uploading}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              Skip and save
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving || uploading}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
