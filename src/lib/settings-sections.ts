// Plain data, not a "use client" module: the server rendered settings page maps over it, and a client
// module's exports reach server components only as references, never as values.
export const SETTINGS_SECTIONS = [
  { id: "timer", label: "Timer" },
  { id: "appearance", label: "Appearance" },
  { id: "sound", label: "Sound and music" },
  { id: "time", label: "Time and region" },
] as const;
