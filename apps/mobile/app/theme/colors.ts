const palette = {
  neutral100: "#FFFFFF",
  neutral200: "#F4F2F1",
  neutral300: "#D7CEC9",
  neutral400: "#B6ACA6",
  neutral500: "#978F8A",
  neutral600: "#564E4A",
  neutral700: "#3C3836",
  neutral800: "#191015",
  neutral900: "#000000",

  primary100: "#F4E0D9",
  primary200: "#E8C1B4",
  primary300: "#DDA28E",
  primary400: "#D28468",
  primary500: "#C76542",
  primary600: "#A54F31",

  secondary100: "#DCDDE9",
  secondary200: "#BCC0D6",
  secondary300: "#9196B9",
  secondary400: "#626894",
  secondary500: "#41476E",

  accent100: "#FFEED4",
  accent200: "#FFE1B2",
  accent300: "#FDD495",
  accent400: "#FBC878",
  accent500: "#FFBB50",

  angry100: "#F2D6CD",
  angry500: "#C03403",

  success500: "#2FB777",

  overlay20: "rgba(25, 16, 21, 0.2)",
  overlay50: "rgba(25, 16, 21, 0.5)",
} as const

export const colors = {
  /**
   * The palette is available to use, but prefer using the name.
   * This is only included for rare, one-off cases. Try to use
   * semantic names as much as possible.
   */
  palette,
  /**
   * A helper for making something see-thru.
   */
  transparent: "rgba(0, 0, 0, 0)",
  /**
   * The default text color in many components.
   */
  text: palette.neutral800,
  /**
   * Secondary text information.
   */
  textDim: palette.neutral600,
  /**
   * The default color of the screen background.
   */
  background: palette.neutral200,
  /**
   * The default border color.
   */
  border: palette.neutral400,
  /**
   * The main tinting color.
   */
  tint: palette.primary500,
  /**
   * The inactive tinting color.
   */
  tintInactive: palette.neutral300,
  /**
   * A subtle color used for lines.
   */
  separator: palette.neutral300,
  /**
   * Error messages.
   */
  error: palette.angry500,
  /**
   * Error Background.
   */
  errorBackground: palette.angry100,
  glass: "rgba(255, 255, 255, 0.7)",
  glassHeavy: "rgba(255, 255, 255, 0.85)",
  glassBorder: "rgba(0, 0, 0, 0.05)",
  accentPink: palette.primary300,
  accentBlue: palette.secondary300,
  accentYellow: palette.accent300,
  textStrong: palette.neutral800,
  textMuted: palette.neutral600,
  blobPink: "rgba(255, 110, 199, 0.22)",
  blobBlue: "rgba(123, 211, 255, 0.18)",
  blobNeutral: "rgba(0, 0, 0, 0.04)",
  calculator: {
    backgroundGradient: ["#F9DDEA", "#F5D6EE", "#DCEEFF"] as const,
    shellGradient: ["rgba(255,255,255,0.7)", "rgba(255,255,255,0.18)"] as const,
    surfaceGradient: ["#FFF8FD", "#F4E1F1"] as const,
    surfaceInsetGradient: ["rgba(255,255,255,0.85)", "rgba(243,223,241,0.72)"] as const,
    surfaceBorder: "rgba(255,255,255,0.78)",
    surfaceEdge: "rgba(211, 168, 197, 0.35)",
    displayGlow: "rgba(255,255,255,0.72)",
    displayValue: "#FFFDFE",
    labelText: "#8D7390",
    ambientPink: "rgba(255, 141, 211, 0.36)",
    ambientPurple: "rgba(204, 167, 255, 0.3)",
    ambientBlue: "rgba(142, 211, 255, 0.34)",
    menuBackdrop: "rgba(246, 217, 235, 0.45)",
    keyFallback: "#F7E9F5",
    keyBorder: "rgba(255,255,255,0.92)",
    keyEdgeHighlight: "rgba(255,255,255,0.95)",
    keyHighlightGradient: ["rgba(255,255,255,0.92)", "rgba(255,255,255,0.12)", "rgba(255,255,255,0)"] as const,
    keyGlowGradient: ["rgba(255,255,255,0)", "rgba(255,255,255,0.28)"] as const,
    keyShadow: "rgba(186, 121, 163, 0.34)",
    keyShadowPressed: "rgba(186, 121, 163, 0.18)",
    operatorShadow: "rgba(137, 167, 220, 0.3)",
    utilityShadow: "rgba(194, 150, 220, 0.26)",
    equalsShadow: "rgba(168, 125, 225, 0.34)",
    keyText: "#2D2632",
    operatorText: "#33517B",
    utilityText: "#6D4C73",
    equalsText: "#4C2260",
    // Inside your calculator colors object:
    keyConcaveHighlightGradient: [
      "rgba(255, 255, 255, 0.5)", // Light highlight (top-left)
      "transparent",              // Middle
      "rgba(0, 0, 0, 0.05)"       // Very soft shadow (bottom-right)
    ],
    keyBorderHighlight: "rgba(255, 255, 255, 0.7)", // For the raised edge
    keyGradients: {
      number: ["#FFFDFE", "#F2E2F1"] as const,
      operator: ["#E7F4FF", "#D3E4FF"] as const,
      utility: ["#F8EAFE", "#E8D7F6"] as const,
      equals: ["#F8B9E5", "#C8B5FF", "#9EDCFF"] as const,
    },
  },
} as const
