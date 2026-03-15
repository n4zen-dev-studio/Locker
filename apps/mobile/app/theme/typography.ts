// TODO: write documentation about fonts and typography along with guides on how to add custom fonts in own
// markdown file and add links from here

import { Platform } from "react-native"
import {
  SpaceGrotesk_300Light as spaceGroteskLight,
  SpaceGrotesk_400Regular as spaceGroteskRegular,
  SpaceGrotesk_500Medium as spaceGroteskMedium,
  SpaceGrotesk_600SemiBold as spaceGroteskSemiBold,
  SpaceGrotesk_700Bold as spaceGroteskBold,
} from "@expo-google-fonts/space-grotesk"

export const customFontsToLoad = {
  spaceGroteskLight,
  spaceGroteskRegular,
  spaceGroteskMedium,
  spaceGroteskSemiBold,
  spaceGroteskBold,
  "GeneralSans-Light": require("@assets/fonts/GeneralSans-Light.otf"),
  "GeneralSans-LightItalic": require("@assets/fonts/GeneralSans-LightItalic.otf"),
  "GeneralSans-Regular": require("@assets/fonts/GeneralSans-Regular.otf"),
  "GeneralSans-Italic": require("@assets/fonts/GeneralSans-Italic.otf"),
  "GeneralSans-Medium": require("@assets/fonts/GeneralSans-Medium.otf"),
  "GeneralSans-MediumItalic": require("@assets/fonts/GeneralSans-MediumItalic.otf"),
  "GeneralSans-Semibold": require("@assets/fonts/GeneralSans-Semibold.otf"),
  "GeneralSans-SemiboldItalic": require("@assets/fonts/GeneralSans-SemiboldItalic.otf"),
  "GeneralSans-Bold": require("@assets/fonts/GeneralSans-Bold.otf"),
  "GeneralSans-BoldItalic": require("@assets/fonts/GeneralSans-BoldItalic.otf"),
  "GeneralSans-Extralight": require("@assets/fonts/GeneralSans-Extralight.otf"),
  "GeneralSans-ExtralightItalic": require("@assets/fonts/GeneralSans-ExtralightItalic.otf"),
}

const fonts = {
  generalSans: {
    extraLight: "GeneralSans-Extralight",
    extraLightItalic: "GeneralSans-ExtralightItalic",

    light: "GeneralSans-Light",
    lightItalic: "GeneralSans-LightItalic",

    normal: "GeneralSans-Regular",
    italic: "GeneralSans-Italic",

    medium: "GeneralSans-Medium",
    mediumItalic: "GeneralSans-MediumItalic",

    semiBold: "GeneralSans-Semibold",
    semiBoldItalic: "GeneralSans-SemiboldItalic",

    bold: "GeneralSans-Bold",
    boldItalic: "GeneralSans-BoldItalic",
  },
  spaceGrotesk: {
    // Cross-platform Google font.
    light: "spaceGroteskLight",
    normal: "spaceGroteskRegular",
    medium: "spaceGroteskMedium",
    semiBold: "spaceGroteskSemiBold",
    bold: "spaceGroteskBold",
  },
  helveticaNeue: {
    // iOS only font.
    thin: "HelveticaNeue-Thin",
    light: "HelveticaNeue-Light",
    normal: "Helvetica Neue",
    medium: "HelveticaNeue-Medium",
  },
  courier: {
    // iOS only font.
    normal: "Courier",
  },
  sansSerif: {
    // Android only font.
    thin: "sans-serif-thin",
    light: "sans-serif-light",
    normal: "sans-serif",
    medium: "sans-serif-medium",
  },
  monospace: {
    // Android only font.
    normal: "monospace",
  },
}

export const typography = {
  /**
   * The fonts are available to use, but prefer using the semantic name.
   */
  fonts,
  /**
   * The primary font. Used in most places.
   */
  primary: fonts.generalSans,
  /**
   * An alternate font used for perhaps titles and stuff.
   */
  secondary: Platform.select({ ios: fonts.helveticaNeue, android: fonts.generalSans }),
  /**
   * Lets get fancy with a monospace font!
   */
  code: Platform.select({ ios: fonts.courier, android: fonts.monospace }),
}
