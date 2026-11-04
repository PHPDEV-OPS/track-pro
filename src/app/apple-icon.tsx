import { ImageResponse } from "next/og";
import { BRAND, markSvg } from "@/lib/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// A full bleed square (iOS rounds the corners itself), with extra padding around the mark.
export default function AppleIcon() {
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(markSvg({ inset: 5 }))}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BRAND.ground }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img only */}
        <img src={src} width={180} height={180} alt="" />
      </div>
    ),
    size,
  );
}
