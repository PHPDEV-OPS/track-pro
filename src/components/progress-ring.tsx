/**
 * The clock's progress ring (spec 0006 AC-4): track in heat-0, accent arc for elapsed over target.
 * Paused dims the arc; overtime fills it. Decorative, so hidden from screen readers.
 */
export function ProgressRing({
  progress,
  paused = false,
  className = "",
  children,
}: {
  /** 0 to 1; values past 1 (overtime) draw a full ring. */
  progress: number;
  paused?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const r = 92;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div className={`relative aspect-square [container-type:inline-size] ${className}`}>
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="100" cy="100" r={r} fill="none" strokeWidth="6" className="stroke-border" />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          className={`stroke-accent transition-[stroke-dashoffset,opacity] duration-200 ease-out ${paused ? "opacity-40" : ""}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
