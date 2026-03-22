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
} as const;

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
    backgroundGradient: ["#F5D0E0", "#F2D4E7", "#ECD6F1"] as const,
    backgroundFieldGradient: [
      "rgba(255,255,255,0.2)",
      "rgba(255,255,255,0.03)",
      "rgba(255,255,255,0)",
    ] as const,
    shellGradient: [
      "rgba(255,255,255,0.84)",
      "rgba(255,255,255,0.28)",
      "rgba(255,255,255,0.08)",
    ] as const,
    surfaceGradient: ["#FFF9FE", "#F6E4F0", "#F0D8E8"] as const,
    surfaceInsetGradient: [
      "rgba(255,255,255,0.92)",
      "rgba(250,238,246,0.9)",
      "rgba(231,238,255,0.74)",
    ] as const,
    surfaceBorder: "rgba(255,255,255,0.52)",
    surfaceEdge: "rgba(216, 176, 204, 0.14)",
    surfaceInnerShadow: "rgba(189, 149, 176, 0.12)",
    surfaceHighlight: "rgba(255,255,255,0.82)",
    surfaceGlow: "rgba(252, 225, 244, 0.82)",
    surfaceBloom: "rgba(255, 244, 249, 0.7)",
    surfaceRoseShadow: "rgba(203, 155, 186, 0.16)",
    displayGlow: "rgba(255,255,255,0.8)",
    displayValue: "#FFFCFF",
    labelText: "#8D7390",
    ambientPink: "rgba(255, 154, 214, 0.46)",
    ambientPurple: "rgba(205, 183, 255, 0.32)",
    ambientBlue: "rgba(169, 221, 255, 0.34)",
    ambientWhite: "rgba(255,255,255,0.34)",
    menuBackdrop: "rgba(246, 217, 235, 0.36)",
    keyFallback: "#F9EEF6",
    keyBorder: "rgba(255,255,255,0.3)",
    keyEdgeHighlight: "rgba(255,255,255,0.92)",
    keyRimLight: "rgba(255,255,255,0.56)",
    keyRimShadow: "rgba(215, 180, 202, 0.16)",
    keyInnerBorder: "rgba(255,255,255,0.12)",
    keyInnerShadow: "rgba(198, 162, 188, 0.14)",
    keyBaseGlow: "rgba(255,255,255,0.24)",
    keyBaseShadow: "rgba(207, 170, 192, 0.16)",
    keyHighlightGradient: [
      "rgba(255,255,255,0.96)",
      "rgba(255,255,255,0.5)",
      "rgba(255,255,255,0.02)",
    ] as const,
    keyGlowGradient: [
      "rgba(255,255,255,0)",
      "rgba(255,232,245,0.36)",
      "rgba(222,236,255,0.32)",
    ] as const,
    keyGlossGradient: [
      "rgba(255,255,255,0.22)",
      "rgba(255,255,255,0.06)",
      "rgba(255,255,255,0)",
    ] as const,
    keyShadow: "rgba(194, 148, 177, 0.16)",
    keyShadowPressed: "rgba(194, 148, 177, 0.1)",
    operatorShadow: "rgba(164, 197, 235, 0.22)",
    utilityShadow: "rgba(209, 176, 231, 0.18)",
    equalsShadow: "rgba(195, 168, 244, 0.24)",
    keyText: "#433347",
    operatorText: "#5570A0",
    utilityText: "#805B88",
    equalsText: "#5B2E73",
    keyConcaveHighlightGradient: [
      "rgba(255,255,255,0.82)",
      "rgba(255,248,252,0.28)",
      "rgba(223,192,214,0.18)",
    ],
    keyBorderHighlight: "rgba(255,255,255,0.36)",
    keyBodyGradient: [
      "rgba(255,255,255,0.42)",
      "rgba(247,229,239,0.8)",
      "rgba(239,214,230,0.88)",
    ] as const,
    keyGradients: {
      number: ["#FFFDFE", "#F8ECF5", "#F2E1EE"] as const,
      operator: ["#F6EEFF", "#E5F1FF", "#D9EDFF"] as const,
      utility: ["#FFF4FD", "#F2E7FA", "#E9DCF4"] as const,
      equals: ["#FFD0EB", "#E0CCFF", "#B9E4FF"] as const,
    },
    keyFaceGradients: {
      number: [
        "rgba(255,255,255,0.86)",
        "rgba(255,247,251,0.98)",
        "rgba(242,223,236,0.94)",
      ] as const,
      operator: [
        "rgba(255,252,255,0.8)",
        "rgba(244,246,255,0.98)",
        "rgba(213,233,255,0.95)",
      ] as const,
      utility: [
        "rgba(255,252,255,0.82)",
        "rgba(249,240,255,0.98)",
        "rgba(236,223,248,0.94)",
      ] as const,
      equals: [
        "rgba(255,247,252,0.76)",
        "rgba(247,233,255,0.96)",
        "rgba(200,231,255,0.96)",
      ] as const,
    },
    keyPearlescentGradient: {
      operator: [
        "rgba(255,214,238,0.36)",
        "rgba(210,229,255,0.48)",
        "rgba(197,240,255,0.3)",
      ] as const,
      equals: [
        "rgba(255,213,236,0.5)",
        "rgba(220,206,255,0.56)",
        "rgba(174,225,255,0.44)",
      ] as const,
    },
  },
} as const;
