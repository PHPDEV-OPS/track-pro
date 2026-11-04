"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ImagePlus, X } from "lucide-react";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

/** Drag and drop (or click) proof of work uploader. Calls onChange with the Blob URL, or null. */
export function ImageDrop({
  value,
  onChange,
  onBusy,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!ACCEPT.includes(file.type)) return setError("Use a png, jpg, webp or gif image.");
    if (file.size > MAX_BYTES) return setError("Image must be 5 MB or smaller.");
    setBusy(true);
    onBusy?.(true);
    try {
      const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/blob/upload" });
      onChange(blob.url);
    } catch {
      setError("Upload failed. You can save without an image.");
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }

  if (value) {
    return (
      <div className="relative inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="Proof of work" className="max-h-40 rounded-lg border border-border" />
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Remove image"
          className="absolute -right-2 -top-2 rounded-full border border-border bg-card p-1"
        >
          <X className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handle(e.dataTransfer.files[0]);
        }}
        className={`flex w-full flex-col items-center gap-1 rounded-lg border border-dashed p-4 text-sm text-muted ${
          over ? "border-accent text-foreground" : "border-border"
        }`}
      >
        <ImagePlus className="size-5" />
        {busy ? "Uploading..." : "Drop a screenshot here, or click to choose"}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT.join(",")}
        className="sr-only"
        onChange={(e) => void handle(e.target.files?.[0])}
      />
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
