import { LED_SEGMENTS } from "@/lib/timer";

// A seven segment LED clock drawn in SVG, so it stays crisp at any size and takes the theme's
// accent through currentColor. Unlit segments show faintly, like a real display.

const W = 56; // one digit cell
const H = 100;
const T = 10; // segment thickness
const G = 2; // gap where segments meet
const STEP = W + 12; // digit plus spacing
const COLON = 22;
const SIGN = 52;

/** A hexagonal segment between two points on a horizontal or vertical line. */
function bar(x1: number, y1: number, x2: number, y2: number) {
  const h = T / 2;
  if (y1 === y2) {
    return `${x1},${y1} ${x1 + h},${y1 - h} ${x2 - h},${y1 - h} ${x2},${y1} ${x2 - h},${y1 + h} ${x1 + h},${y1 + h}`;
  }
  return `${x1},${y1} ${x1 + h},${y1 + h} ${x1 + h},${y2 - h} ${x1},${y2} ${x1 - h},${y2 - h} ${x1 - h},${y1 + h}`;
}

const L = T / 2;
const R = W - T / 2;
const SEG: Record<string, string> = {
  a: bar(L + G, L, R - G, L),
  b: bar(R, L + G, R, H / 2 - G),
  c: bar(R, H / 2 + G, R, H - L - G),
  d: bar(L + G, H - L, R - G, H - L),
  e: bar(L, H / 2 + G, L, H - L - G),
  f: bar(L, L + G, L, H / 2 - G),
  g: bar(L + G, H / 2, R - G, H / 2),
};

function Digit({ ch, x }: { ch: string; x: number }) {
  const on = LED_SEGMENTS[ch] ?? "";
  return (
    <g transform={`translate(${x} 0)`}>
      {Object.entries(SEG).map(([k, pts]) => (
        <polygon key={k} points={pts} fill="currentColor" opacity={on.includes(k) ? 1 : 0.08} />
      ))}
    </g>
  );
}

/**
 * Renders text like "00:25:00" or "+00:03:12" (from formatLed) as LED digits.
 * Decorative: the timer's accessible label lives in a separate sr-only element.
 */
export function SegmentClock({ text, className = "" }: { text: string; className?: string }) {
  let x = 0;
  const parts: React.ReactNode[] = [];
  for (const [i, ch] of [...text].entries()) {
    if (ch === ":") {
      parts.push(
        <g key={i} fill="currentColor">
          <rect x={x + COLON / 2 - L} y={H * 0.3 - L} width={T} height={T} rx={2} />
          <rect x={x + COLON / 2 - L} y={H * 0.7 - L} width={T} height={T} rx={2} />
        </g>,
      );
      x += COLON;
    } else if (ch === "+") {
      parts.push(
        <g key={i} fill="currentColor">
          <polygon points={bar(x + 2, H / 2, x + 38, H / 2)} />
          <polygon points={bar(x + 20, H / 2 - 18, x + 20, H / 2 + 18)} />
        </g>,
      );
      x += SIGN;
    } else {
      parts.push(<Digit key={i} ch={ch} x={x} />);
      x += STEP;
    }
  }
  const width = x - (STEP - W);
  return (
    <svg viewBox={`-6 -4 ${width + 12} ${H + 8}`} className={className} aria-hidden>
      {/* A slight italic lean, like a real LED display. */}
      <g transform={`skewX(-7) translate(${H * 0.06} 0)`}>{parts}</g>
    </svg>
  );
}
