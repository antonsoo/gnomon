export type Theme = "brass" | "slate" | "blueprint" | "laser";

export interface ThemeColors {
  background: string;
  frame: string;
  hourLineMajor: string;
  hourLineMinor: string;
  declinationLine: string;
  historicalLine: string;
  text: string;
  mutedText: string;
  gnomon: string;
}

/**
 * "laser" is not a look -- it is the file-format convention laser cutters
 * expect: pure red strokes mean CUT (through-cuts: the gnomon outline,
 * the dial's outer edge), pure black strokes mean ENGRAVE (hour lines,
 * numerals, decoration), no fills, no background. Every other theme is
 * decorative, for the on-screen preview and PNG/PDF exports.
 */
export const THEMES: Record<Theme, ThemeColors> = {
  brass: {
    background: "#20262b",
    frame: "#c9a24b",
    hourLineMajor: "#e8c874",
    hourLineMinor: "#8a7443",
    declinationLine: "#6f95a8",
    historicalLine: "#7a5d8f",
    text: "#f3e6c8",
    mutedText: "#a3966f",
    gnomon: "#e8c874",
  },
  slate: {
    background: "#1c2024",
    frame: "#9fb3c8",
    hourLineMajor: "#e4ecf2",
    hourLineMinor: "#5d6b78",
    declinationLine: "#e0a05c",
    historicalLine: "#8fb08a",
    text: "#eef3f7",
    mutedText: "#7d8c99",
    gnomon: "#e4ecf2",
  },
  blueprint: {
    background: "#0b3d66",
    frame: "#dce9f5",
    hourLineMajor: "#ffffff",
    hourLineMinor: "#8fb7db",
    declinationLine: "#ffd166",
    historicalLine: "#9ee6c4",
    text: "#f2f8ff",
    mutedText: "#9cc0dd",
    gnomon: "#ffffff",
  },
  laser: {
    background: "none",
    frame: "#ff0000",
    hourLineMajor: "#000000",
    hourLineMinor: "#000000",
    declinationLine: "#000000",
    historicalLine: "#000000",
    text: "#000000",
    mutedText: "#000000",
    gnomon: "#ff0000",
  },
};
