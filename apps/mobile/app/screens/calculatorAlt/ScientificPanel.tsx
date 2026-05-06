import { FC, useEffect, useMemo, useRef } from "react"
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"
import { LinearGradient } from "expo-linear-gradient"

import { Text } from "@/components/Text"
import { typography } from "@/theme/typography"

export type ScientificKeyId =
  | "("
  | ")"
  | "mc"
  | "m+"
  | "m-"
  | "mr"
  | "2nd"
  | "x²"
  | "x³"
  | "xʸ"
  | "eˣ"
  | "10ˣ"
  | "1/x"
  | "²√x"
  | "³√x"
  | "ʸ√x"
  | "ln"
  | "log10"
  | "x!"
  | "sin"
  | "cos"
  | "tan"
  | "e"
  | "EE"
  | "Rand"
  | "sinh"
  | "cosh"
  | "tanh"
  | "π"
  | "Rad"

const scientificRows: ScientificKeyId[][] = [
  ["(", ")", "mc", "m+", "m-", "mr"],
  ["2nd", "x²", "x³", "xʸ", "eˣ", "10ˣ"],
  ["1/x", "²√x", "³√x", "ʸ√x", "ln", "log10"],
  ["x!", "sin", "cos", "tan", "e", "EE"],
  ["Rand", "sinh", "cosh", "tanh", "π", "Rad"],
]

export const ScientificPanel: FC<{
  angleMode: "rad" | "deg"
  hasMemory: boolean
  isOpen: boolean
  isSecondMode: boolean
  onKeyPress: (key: ScientificKeyId) => void
  onToggle: () => void
}> = ({ angleMode, hasMemory, isOpen, isSecondMode, onKeyPress, onToggle }) => {
  const slide = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(slide, {
      toValue: isOpen ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [isOpen, slide])

  const panelTranslate = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [350, 0],
  })

  const toggleTranslate = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -350],
  })

  const rowDefinitions = useMemo(
    () =>
      scientificRows.map((row) =>
        row.map((key) => ({
          key,
          label: getScientificLabel(key, isSecondMode, angleMode),
          isActive:
            (key === "2nd" && isSecondMode) ||
            (key === "Rad" && angleMode === "rad") ||
            (key === "mr" && hasMemory),
        })),
      ),
    [angleMode, hasMemory, isSecondMode],
  )

  return (
    <View pointerEvents={isOpen ? "auto" : "box-none"} style={$container}>
      <Animated.View
        pointerEvents={isOpen ? "auto" : "none"}
        style={[
          $panelWrap,
          {
            transform: [{ translateX: panelTranslate }],
          },
        ]}
      >
        <View style={$panelShell}>
          <LinearGradient
            colors={["rgba(23, 23, 23, 0.75)", "rgba(36, 36, 36, 0.86)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View pointerEvents="none" style={$panelTexture} />
          <View pointerEvents="none" style={$panelBorder} />
          <Text style={$panelTitle}>Scientific</Text>
          <View style={$grid}>
            {rowDefinitions.map((row, rowIndex) => (
              <View key={`scientific-row-${rowIndex}`} style={$row}>
                {row.map((item) => (
                  <Pressable
                    key={item.key}
                    hitSlop={6}
                    onPress={() => onKeyPress(item.key)}
                    style={({ pressed }) => [
                      $key,
                      pressed && $keyPressed,
                      item.isActive && $keyActive,
                    ]}
                  >
                    <Text
                      style={[
                        $keyLabel,
                        isAccentKey(item.key) && $accentLabel,
                        item.isActive && $activeLabel,
                        isUtilityKey(item.key) && $utilityLabel,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        </View>
      </Animated.View>

      <Animated.View
        pointerEvents={isOpen ? "auto" : "auto"}
        style={[
          $toggleWrap,
          {
            transform: [{ translateX: toggleTranslate }],
          },
        ]}
      >
        <Pressable onPress={onToggle} style={({ pressed }) => [$toggle, pressed && $keyPressed]}>
          <LinearGradient
            colors={["rgba(36,36,36,0.94)", "rgba(20,20,20,0.94)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View pointerEvents="none" style={$toggleBorder} />
          <Text style={$toggleText}>{isOpen ? "×" : "ƒx"}</Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}

function getScientificLabel(
  key: ScientificKeyId,
  isSecondMode: boolean,
  angleMode: "rad" | "deg",
) {
  if (key === "sin" && isSecondMode) return "asin"
  if (key === "cos" && isSecondMode) return "acos"
  if (key === "tan" && isSecondMode) return "atan"
  if (key === "sinh" && isSecondMode) return "asinh"
  if (key === "cosh" && isSecondMode) return "acosh"
  if (key === "tanh" && isSecondMode) return "atanh"
  if (key === "eˣ" && isSecondMode) return "ln"
  if (key === "10ˣ" && isSecondMode) return "log10"
  if (key === "Rad") return angleMode === "rad" ? "Rad" : "Deg"
  return key
}

function isAccentKey(key: ScientificKeyId) {
  return key === "2nd" || key === "Rad" || key === "mr"
}

function isUtilityKey(key: ScientificKeyId) {
  return key === "mc" || key === "m+" || key === "m-" || key === "mr" || key === "Rand" || key === "EE"
}

const $container: ViewStyle = {
  ...StyleSheet.absoluteFillObject,
  position: "absolute",
  zIndex: 100,
  elevation: 100,
}

const $panelWrap: ViewStyle = {
  position: "absolute",
  right: 0,
  top: 200,
  // bottom: ,
  width: 350,
  zIndex: 110,
  elevation: 110,
}

const $panelShell: ViewStyle = {
  flex: 1,
  borderTopLeftRadius: 28,
  borderBottomLeftRadius: 28,
  overflow: "hidden",
  paddingTop: 18,
  paddingBottom: 18,
  paddingHorizontal: 14,
  shadowColor: "#000000",
  shadowOpacity: 0.45,
  shadowRadius: 24,
  shadowOffset: { width: 14, height: 18 },
  elevation: 18,
}

const $panelTexture: ViewStyle = {
  ...StyleSheet.absoluteFillObject,
  // opacity: 0.08,
  backgroundColor: "#12121264",
}

const $panelBorder: ViewStyle = {
  ...StyleSheet.absoluteFillObject,
borderTopLeftRadius: 28,
borderBottomLeftRadius: 28,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
}

const $panelTitle: TextStyle = {
  fontFamily: typography.primary.medium,
  fontSize: 13,
  lineHeight: 16,
  letterSpacing: 1.6,
  textTransform: "uppercase",
  color: "#706d68",
  marginBottom: 14,
  paddingLeft: 6,
}

const $grid: ViewStyle = {
  flex: 1,
  gap: 10,
}

const $row: ViewStyle = {
  flexDirection: "row",
  gap: 8,
}

const $key: ViewStyle = {
  flex: 1,
  minHeight: 48,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(111, 111, 111, 0.11)",
}

const $keyPressed: ViewStyle = {
  opacity: 0.72,
  transform: [{ scale: 0.97 }],
}

const $keyActive: ViewStyle = {
  backgroundColor: "rgba(241,178,25,0.12)",
}

const $keyLabel: TextStyle = {
  fontFamily: typography.primary.medium,
  fontSize: 15,
  lineHeight: 18,
  letterSpacing: -0.5,
  color: "#e7e3df",
}

const $utilityLabel: TextStyle = {
  fontSize: 13,
  lineHeight: 16,
  color: "#9d9892",
}

const $accentLabel: TextStyle = {
  color: "#f1b219",
}

const $activeLabel: TextStyle = {
  color: "#f3c95f",
}

const $toggleWrap: ViewStyle = {
  position: "absolute",
  right: 0,
  top: "45%",
  marginTop: -34,
  zIndex: 120,
  elevation: 120,
}

const $toggle: ViewStyle = {
  width: 36,
  height: 68,
  borderTopLeftRadius: 18,
  borderBottomLeftRadius: 18,
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  shadowColor: "#000000",
  shadowOpacity: 0.35,
  shadowRadius: 18,
  shadowOffset: { width: 8, height: 10 },
  elevation: 14,
}

const $toggleBorder: ViewStyle = {
  ...StyleSheet.absoluteFillObject,
  borderTopLeftRadius: 18,
  borderBottomLeftRadius: 18,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
}

const $toggleText: TextStyle = {
  fontFamily: typography.primary.medium,
  fontSize: 17,
  lineHeight: 18,
  letterSpacing: -0.8,
  color: "#f1b219",
}
