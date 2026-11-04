import { ImageResponse } from "next/og";

export const alt = "track-pro: every focused hour becomes a square you can see";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Dark theme heatmap levels from globals.css (ImageResponse cannot read CSS variables).
const LEVELS = ["#1c1c21", "#0e4a33", "#0f7a50", "#14a86b", "#34d399"];
const WEEKS = 30;

function level(i: number) {
  const r = ((i * 9301 + 49297) % 233280) / 233280;
  return r < 0.4 ? 0 : Math.min(4, Math.floor(r * 5));
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0a0a0b",
          color: "#ededed",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 30, color: "#10b981", fontFamily: "monospace" }}>track-pro</div>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 900 }}>
            Every focused hour becomes a square you can see.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {Array.from({ length: WEEKS }, (_, w) => (
            <div key={w} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Array.from({ length: 7 }, (_, d) => (
                <div
                  key={d}
                  style={{ width: 28, height: 28, borderRadius: 5, background: LEVELS[level(w * 7 + d)] }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
