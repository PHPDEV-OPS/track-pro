import { MARK } from "@/lib/brand";

/** The track-pro mark in the current theme's accent (via currentColor). Decorative unless labelled. */
export function LogoMark({ className = "size-5", label }: { className?: string; label?: string }) {
  const s = MARK.square;
  return (
    <svg
      viewBox={MARK.viewBox}
      className={`shrink-0 text-accent ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={MARK.arc} fill="none" stroke="currentColor" strokeWidth={MARK.stroke} strokeLinecap="round" />
      <rect x={s.x} y={s.y} width={s.size} height={s.size} rx={s.radius} fill="currentColor" />
    </svg>
  );
}

/** Mark plus the lowercase name. The name stays in the text color; the mark carries the accent. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-[-0.02em] whitespace-nowrap ${className}`}>
      <LogoMark className="size-[1.25em]" />
      track-pro
    </span>
  );
}
