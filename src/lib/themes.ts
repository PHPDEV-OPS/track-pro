export const THEMES = ["system", "light", "dark", "matrix", "cyberpunk"] as const;
export type Theme = (typeof THEMES)[number];
