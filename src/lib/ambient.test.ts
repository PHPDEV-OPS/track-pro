import { describe, expect, it } from "vitest";
import { brownNoise, pinkNoise, rainNoise, volumeToGain, whiteNoise } from "./ambient";

const N = 48_000 * 2;

// A seeded generator so the buffers are the same on every run.
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const rms = (b: Float32Array) => Math.sqrt(b.reduce((a, v) => a + v * v, 0) / b.length);
// Sample to sample change relative to level: high for bright noise, low for deep noise.
const roughness = (b: Float32Array) => {
  let d = 0;
  for (let i = 1; i < b.length; i++) d += (b[i] - b[i - 1]) ** 2;
  return Math.sqrt(d / (b.length - 1)) / rms(b);
};

describe("noise generators (AC-7)", () => {
  const buffers = {
    white: whiteNoise(N, seeded()),
    pink: pinkNoise(N, seeded()),
    brown: brownNoise(N, seeded()),
    rain: rainNoise(N, 48_000, seeded()),
  };

  it.each(Object.entries(buffers))("%s stays within -1 to 1 with no NaN and is not silent", (_, b) => {
    expect(b).toHaveLength(N);
    for (const v of b) {
      expect(Number.isNaN(v)).toBe(false);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
    expect(rms(b)).toBeGreaterThan(0.01);
  });

  it("brown has more low frequency energy than pink, and pink more than white", () => {
    const w = roughness(buffers.white);
    const p = roughness(buffers.pink);
    const b = roughness(buffers.brown);
    expect(p).toBeLessThan(w);
    expect(b).toBeLessThan(p);
  });

  it("brown loops without a jump at the seam", () => {
    const b = buffers.brown;
    const seam = Math.abs(b[0] - b[b.length - 1]);
    expect(seam).toBeLessThan(0.01);
  });
});

describe("volumeToGain", () => {
  it("maps 0..100 onto 0..1 and clamps outside it", () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(50)).toBe(0.25);
    expect(volumeToGain(100)).toBe(1);
    expect(volumeToGain(150)).toBe(1);
    expect(volumeToGain(-5)).toBe(0);
  });
});
