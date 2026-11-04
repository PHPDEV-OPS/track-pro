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

/** What `user_settings.ambient_sound` can hold: the built in sounds plus MUSIC (a saved link, spec 0005). */
export const STORED_SOUNDS = [...AMBIENT_SOUNDS, "MUSIC"] as const;
export type StoredSound = (typeof STORED_SOUNDS)[number];

/** The picker's single value: a built in sound, or `MUSIC:<link id>` (spec 0005). */
export type SoundChoice = AmbientSound | `MUSIC:${string}`;
export const musicChoice = (id: string): SoundChoice => `MUSIC:${id}`;
export const linkIdOf = (c: SoundChoice) => (c.startsWith("MUSIC:") ? c.slice(6) : null);
/** The built in sound the audio engine should play; music links are Off for it. */
export const builtInOf = (c: SoundChoice): AmbientSound => (c.startsWith("MUSIC:") ? "OFF" : (c as AmbientSound));

/** The picker value for what is stored in user_settings. */
export const choiceOf = (s: { ambientSound: StoredSound; musicLinkId: string | null }): SoundChoice =>
  s.ambientSound === "MUSIC" && s.musicLinkId ? musicChoice(s.musicLinkId) : s.ambientSound === "MUSIC" ? "OFF" : s.ambientSound;
