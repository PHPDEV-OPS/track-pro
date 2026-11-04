type Props = {
  elapsedSec: number;
  targetSec: number;
  label: string;
  /** Width classes; the dial is square and scales with them. */
  className?: string;
};

/** Skeuomorphic dial: a progress arc toward the target, a sweeping minute hand and a seconds hand. */
export function WallClock({ elapsedSec, targetSec, label, className = "w-[min(85vw,26rem)]" }: Props) {
  const c = 100;
  const r = 86;
  const circ = 2 * Math.PI * r;
  const progress = Math.min(1, targetSec > 0 ? elapsedSec / targetSec : 0);
  const minuteAngle = ((elapsedSec % 3600) / 3600) * 360;
  const secondAngle = (elapsedSec % 60) * 6;
  const over = elapsedSec > targetSec;

  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-label={label}
      className={`aspect-square h-auto max-w-full ${className}`}
    >
      <circle cx={c} cy={c} r={96} fill="var(--card)" stroke="var(--border)" strokeWidth={4} />
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth={6} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={over ? "var(--heat-4)" : "var(--accent)"}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - progress)}
        transform={`rotate(-90 ${c} ${c})`}
      />
      {Array.from({ length: 60 }, (_, i) => {
        const major = i % 5 === 0;
        return (
          <line
            key={i}
            x1={c}
            y1={major ? 16 : 18}
            x2={c}
            y2={major ? 24 : 21}
            stroke="var(--muted)"
            strokeWidth={major ? 2 : 1}
            transform={`rotate(${i * 6} ${c} ${c})`}
          />
        );
      })}
      <line
        x1={c}
        y1={c}
        x2={c}
        y2={34}
        stroke="var(--foreground)"
        strokeWidth={4}
        strokeLinecap="round"
        transform={`rotate(${minuteAngle} ${c} ${c})`}
      />
      <line
        x1={c}
        y1={c + 14}
        x2={c}
        y2={26}
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
        transform={`rotate(${secondAngle} ${c} ${c})`}
      />
      <circle cx={c} cy={c} r={4} fill="var(--accent)" />
    </svg>
  );
}
