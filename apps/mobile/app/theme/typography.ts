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

  "Area3DDemo": require("@assets/fonts/Area3DDemo-XGZwa.ttf"),
  "Chronicle": require("@assets/fonts/Chronicle.ttf"),

  "Soltz-Gradient": require("@assets/fonts/Soltz_Gradient.ttf"),
  "Soltz-Outline": require("@assets/fonts/Soltz_Outline.ttf"),
  "Soltz-Shadow": require("@assets/fonts/Soltz_Shadow.ttf"),
  "Soltz-Solid": require("@assets/fonts/Soltz_Solid.ttf"),

  "Hustle-1": require("@assets/fonts/HUSTLE-1.ttf"),
  "Hustle-2": require("@assets/fonts/HUSTLE-2.ttf"),
  "Hustle-3": require("@assets/fonts/HUSTLE-3.ttf"),
  "Hustle-4": require("@assets/fonts/HUSTLE-4.ttf"),
  "Hustle-5": require("@assets/fonts/HUSTLE-5.ttf"),
  "Hustle-6": require("@assets/fonts/HUSTLE-6.ttf"),
  "HOMOARAK": require("@assets/fonts/HOMOARAK.ttf"),
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
  area3d: {
    normal: "Area3DDemo",
  },

  chronicle: {
    normal: "Chronicle",
  },

  soltz: {
    gradient: "Soltz-Gradient",
    outline: "Soltz-Outline",
    shadow: "Soltz-Shadow",
    solid: "Soltz-Solid",
  },

  hustle: {
    one: "Hustle-1",
    two: "Hustle-2",
    three: "Hustle-3",
    four: "Hustle-4",
    five: "Hustle-5",
    six: "Hustle-6",
  },
  HOMOARAK: {
    normal: 'HOMOARAK'
  }
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
