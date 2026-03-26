export type ColorMode = "light" | "dark";

export const themes = {
  light: {
    bg: "#e7e7e7",
    panel: "#f2f2f2",
    border: "#808080",
    textPrimary: "#111111",
    textMuted: "#4f4f4f",
    accent: "#2f2f2f",
    accentText: "#ffffff",
    errorPanel: "#dedede"
  },
  dark: {
    bg: "#111111",
    panel: "#1b1b1b",
    border: "#5f5f5f",
    textPrimary: "#f1f1f1",
    textMuted: "#a3a3a3",
    accent: "#e1e1e1",
    accentText: "#101010",
    errorPanel: "#242424"
  }
} as const;

export const theme = {
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 20
  },
  radius: {
    sm: 4,
    md: 8
  },
  pageSize: 10,
  feedMaxItems: 60,
  postCharLimit: 280
} as const;

export type ThemePalette = (typeof themes)[ColorMode];
