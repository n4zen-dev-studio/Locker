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
  blobPink: "rgba(255, 77, 186, 0.3)",
  blobBlue: "rgba(161, 75, 255, 0.2)",
  blobNeutral: "rgba(255, 184, 226, 0.08)",
  calculator: {
    backgroundBase: "#060309",
    backgroundTint: "#160A18",
    backgroundGradient: ["#050309", "#0B0710", "#180A1A"] as const,
    backgroundFieldGradient: [
      "rgba(255, 77, 186, 0.14)",
      "rgba(161, 75, 255, 0.08)",
      "rgba(255,255,255,0)",
    ] as const,
    dotPattern: "rgba(255, 184, 226, 0.16)",
    surface: "#0D0A12",
    surfaceElevated: "#15101B",
    shellGradient: [
      "rgba(255,255,255,0.14)",
      "rgba(255,255,255,0.04)",
      "rgba(255,255,255,0.01)",
    ] as const,
    surfaceGradient: ["rgba(24,18,32,0.98)", "rgba(10,8,15,0.98)"] as const,
    surfaceInsetGradient: [
      "rgba(25,18,32,0.98)",
      "rgba(11,9,16,0.98)",
    ] as const,
    surfaceBorder: "rgba(255,255,255,0.08)",
    surfaceEdge: "rgba(255, 77, 186, 0.18)",
    surfaceInnerShadow: "rgba(0, 0, 0, 0.42)",
    surfaceHighlight: "rgba(255,255,255,0.12)",
    surfaceGlow: "rgba(255, 77, 186, 0.16)",
    surfaceBloom: "rgba(255, 255, 255, 0.04)",
    surfaceRoseShadow: "rgba(0, 0, 0, 0.56)",
    displayGlow: "rgba(255, 77, 186, 0.16)",
    displayValue: "#FFF7FD",
    labelText: "#9B8DA6",
    textPrimary: "#FFF7FD",
    textSecondary: "#D5C8DB",
    textMuted: "#8D7F98",
    accentPink: "#FF4DBA",
    accentPinkSoft: "#FF9ADB",
    accentGlow: "rgba(255, 77, 186, 0.3)",
    accentPurple: "#A14BFF",
    accentPurpleSoft: "rgba(161, 75, 255, 0.24)",
    borderSubtle: "rgba(255, 255, 255, 0.08)",
    borderStrong: "rgba(255, 77, 186, 0.14)",
    shadowLg: "rgba(0, 0, 0, 0.72)",
    ambientPink: "rgba(255, 77, 186, 0.2)",
    ambientPurple: "rgba(161, 75, 255, 0.18)",
    ambientBlue: "rgba(255, 120, 205, 0.12)",
    ambientWhite: "rgba(255,255,255,0.06)",
    menuBackdrop: "rgba(4, 3, 9, 0.72)",
    keyFallback: "#14101B",
    keyBorder: "rgba(255,255,255,0.08)",
    keyEdgeHighlight: "rgba(255,255,255,0.14)",
    keyRimLight: "rgba(255,255,255,0.11)",
    keyRimShadow: "rgba(0, 0, 0, 0.42)",
    keyInnerBorder: "rgba(255,255,255,0.05)",
    keyInnerShadow: "rgba(0, 0, 0, 0.34)",
    keyBaseGlow: "rgba(255,255,255,0.03)",
    keyBaseShadow: "rgba(0,0,0,0.28)",
    keyHighlightGradient: [
      "rgba(255,255,255,0.16)",
      "rgba(255,255,255,0.04)",
      "rgba(255,255,255,0.02)",
    ] as const,
    keyGlowGradient: [
      "rgba(255,255,255,0)",
      "rgba(255, 77, 186, 0.12)",
      "rgba(161, 75, 255, 0.08)",
    ] as const,
    keyGlossGradient: [
      "rgba(255,255,255,0.12)",
      "rgba(255,255,255,0.03)",
      "rgba(255,255,255,0)",
    ] as const,
    keyShadow: "rgba(0, 0, 0, 0.5)",
    keyShadowPressed: "rgba(0, 0, 0, 0.34)",
    operatorShadow: "rgba(255, 77, 186, 0.18)",
    utilityShadow: "rgba(161, 75, 255, 0.18)",
    equalsShadow: "rgba(255, 77, 186, 0.32)",
    keyText: "#F6EEFD",
    operatorText: "#FFD0EE",
    utilityText: "#DBC8EC",
    equalsText: "#FFF7FD",
    keyConcaveHighlightGradient: [
      "rgba(255,255,255,0.12)",
      "rgba(255,248,252,0.06)",
      "rgba(0,0,0,0.24)",
    ],
    keyBorderHighlight: "rgba(255,255,255,0.12)",
    keyBodyGradient: [
      "rgba(255,255,255,0.03)",
      "rgba(26,20,34,0.9)",
      "rgba(12,9,17,0.98)",
    ] as const,
    keyGradients: {
      number: ["#18131F", "#0C0A12"] as const,
      operator: ["#261328", "#100A16"] as const,
      utility: ["#1B1323", "#0C0A12"] as const,
      equals: ["#FF4DBA", "#7E1F68", "#220A1B"] as const,
    },
    keyFaceGradients: {
      number: [
        "rgba(255,255,255,0.04)",
        "rgba(24,19,31,0.98)",
        "rgba(11,10,17,0.98)",
      ] as const,
      operator: [
        "rgba(255,255,255,0.05)",
        "rgba(34,19,36,0.98)",
        "rgba(15,10,20,0.98)",
      ] as const,
      utility: [
        "rgba(255,255,255,0.04)",
        "rgba(27,19,35,0.98)",
        "rgba(11,10,17,0.98)",
      ] as const,
      equals: [
        "rgba(255,255,255,0.12)",
        "rgba(255,77,186,0.96)",
        "rgba(109,24,84,0.98)",
      ] as const,
    },
    keyPearlescentGradient: {
      operator: [
        "rgba(255,214,238,0.12)",
        "rgba(255,154,219,0.14)",
        "rgba(161,75,255,0.08)",
      ] as const,
      equals: [
        "rgba(255,214,238,0.22)",
        "rgba(255,154,219,0.18)",
        "rgba(161,75,255,0.14)",
      ] as const,
    },
  },
} as const;
