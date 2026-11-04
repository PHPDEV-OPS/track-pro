// The track-pro mark: an open focus ring with one heatmap square in its gap. A session fills the ring,
// then becomes a square on your grid. One geometry (32 by 32) for the app, the icons and the share image.
// Plain data, so server files, icon routes and client components can all import it.

export const MARK = {
  viewBox: "0 0 32 32",
  /** Ring from 12 o'clock clockwise round to 9 o'clock, leaving the top left quarter open. */
  arc: "M16 5 A11 11 0 1 1 5 16",
  stroke: 4,
  /** The square sits in the gap, centred on the ring at 45 degrees. */
  square: { x: 5.2, y: 5.2, size: 6, radius: 1.6 },
} as const;

/** Fixed colors for places that cannot read theme tokens (favicon, share image): the dark theme's. */
export const BRAND = { accent: "#10b981", ink: "#ededed", ground: "#0a0a0b" } as const;

/** The mark as a standalone SVG string, for icon files. */
export function markSvg({
  color = BRAND.accent,
  ground,
  inset = 0,
}: {
  color?: string;
  ground?: string;
  /** Extra padding on each side, in 32 unit space (app icons get cropped corners). */
  inset?: number;
} = {}) {
  const s = MARK.square;
  const bg = ground ? `<rect width="32" height="32" rx="7" fill="${ground}"/>` : "";
  const k = (32 - 2 * inset) / 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK.viewBox}">${bg}<g transform="translate(${inset} ${inset}) scale(${k})"><path d="${MARK.arc}" fill="none" stroke="${color}" stroke-width="${MARK.stroke}" stroke-linecap="round"/><rect x="${s.x}" y="${s.y}" width="${s.size}" height="${s.size}" rx="${s.radius}" fill="${color}"/></g></svg>`;
}
