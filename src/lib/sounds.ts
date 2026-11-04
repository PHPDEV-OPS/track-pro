export const AMBIENT_SOUNDS = ["OFF", "WHITE", "PINK", "BROWN", "RAIN", "WAVES"] as const;
export type AmbientSound = (typeof AMBIENT_SOUNDS)[number];

export const SOUND_LABEL: Record<AmbientSound, string> = {
  OFF: "Off",
  WHITE: "White noise",
  PINK: "Pink noise",
  BROWN: "Brown noise",
  RAIN: "Rain",
  WAVES: "Waves",
};
