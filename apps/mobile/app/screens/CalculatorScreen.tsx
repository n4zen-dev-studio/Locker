import { FC, useMemo, useRef, useState } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { evaluateExpression } from "@/utils/calc/evaluate"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

const operatorSymbols = ["+", "−", "×", "÷"] as const

type ButtonType = "number" | "operator" | "action" | "equals"

type ButtonConfig = {
  label: string
  type: ButtonType
  flex?: number
}

const buttonRows: ButtonConfig[][] = [
  [
    { label: "AC", type: "action" },
    { label: "+/-", type: "action" },
    { label: "⌫", type: "action" },
    { label: "÷", type: "operator" },
  ],
  [
    { label: "7", type: "number" },
    { label: "8", type: "number" },
    { label: "9", type: "number" },
    { label: "×", type: "operator" },
  ],
  [
    { label: "4", type: "number" },
    { label: "5", type: "number" },
    { label: "6", type: "number" },
    { label: "−", type: "operator" },
  ],
  [
    { label: "1", type: "number" },
    { label: "2", type: "number" },
    { label: "3", type: "number" },
    { label: "+", type: "operator" },
  ],
  [
    { label: "0", type: "number", flex: 2 },
    { label: ".", type: "number" },
    { label: "=", type: "equals" },
  ],
]

export const CalculatorScreen: FC<AppStackScreenProps<"Calculator">> = function CalculatorScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $bottomInsets = useSafeAreaInsetsStyle(["bottom"])

  const [display, setDisplay] = useState("0")
  const [lastAction, setLastAction] = useState<"input" | "equals">("input")
  const longPressTriggered = useRef(false)

  const displayText = useMemo(() => display, [display])

  const handleClear = () => {
    setDisplay("0")
    setLastAction("input")
  }

  const handleBackspace = () => {
    if (display === "Error") {
      setDisplay("0")
      setLastAction("input")
      return
    }

    if (display.length <= 1) {
      setDisplay("0")
      return
    }

    if (display.length === 2 && display.startsWith("−")) {
      setDisplay("0")
      return
    }

    setDisplay(display.slice(0, -1))
  }

  const handleDigit = (digit: string) => {
    if (display === "Error") {
      setDisplay(digit)
      setLastAction("input")
      return
    }

    if (lastAction === "equals") {
      setDisplay(digit)
      setLastAction("input")
      return
    }

    if (display === "0") {
      setDisplay(digit)
      return
    }

    if (display === "−0") {
      setDisplay(`−${digit}`)
      return
    }

    setDisplay(`${display}${digit}`)
  }

  const handleDecimal = () => {
    if (display === "Error" || lastAction === "equals") {
      setDisplay("0.")
      setLastAction("input")
      return
    }

    const lastNumberStart = findLastNumberStart(display)
    if (lastNumberStart === null) {
      setDisplay(`${display}0.`)
      return
    }

    const lastNumber = display.slice(lastNumberStart)
    if (lastNumber.includes(".")) return

    setDisplay(`${display}.`)
  }

  const handleOperator = (operator: string) => {
    if (display === "Error") {
      setDisplay("0")
    }

    if (lastAction === "equals") {
      setLastAction("input")
    }

    if (display.length === 0) return

    const lastChar = display[display.length - 1]
    if (isOperatorChar(lastChar)) {
      setDisplay(`${display.slice(0, -1)}${operator}`)
      return
    }

    setDisplay(`${display}${operator}`)
  }

  const handleToggleSign = () => {
    if (display === "Error") {
      setDisplay("0")
      return
    }

    if (lastAction === "equals") {
      setLastAction("input")
    }

    if (display === "0") {
      setDisplay("−0")
      return
    }

    const lastNumberStart = findLastNumberStart(display)
    if (lastNumberStart === null) {
      if (display.length === 0 || isOperatorChar(display[display.length - 1])) {
        setDisplay(`${display}−`)
      }
      return
    }

    const signIndex = lastNumberStart - 1
    const hasUnaryMinus =
      signIndex >= 0 &&
      display[signIndex] === "−" &&
      (signIndex === 0 || isOperatorChar(display[signIndex - 1]))

    if (hasUnaryMinus) {
      setDisplay(display.slice(0, signIndex) + display.slice(lastNumberStart))
    } else {
      setDisplay(display.slice(0, lastNumberStart) + "−" + display.slice(lastNumberStart))
    }
  }

  const handleEquals = () => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }

    const normalized = toEvalExpression(display)
    const result = evaluateExpression(normalized)
    setDisplay(result)
    setLastAction("equals")
  }

  const handleEqualsLongPress = () => {
    longPressTriggered.current = true
    navigation.navigate("VaultLocked")
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $bottomInsets])}>
      <View style={themed($displayContainer)}>
        <Text preset="heading" style={themed($displayText)} numberOfLines={1}>
          {displayText}
        </Text>
      </View>

      <View style={themed($buttonGrid)}>
        {buttonRows.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={themed($buttonRow)}>
            {row.map((button) => {
              const isEquals = button.label === "="
              const onPress = () => {
                switch (button.label) {
                  case "AC":
                    handleClear()
                    break
                  case "⌫":
                    handleBackspace()
                    break
                  case "+/-":
                    handleToggleSign()
                    break
                  case "=":
                    handleEquals()
                    break
                  case ".":
                    handleDecimal()
                    break
                  default:
                    if (isOperatorChar(button.label)) {
                      handleOperator(button.label)
                    } else {
                      handleDigit(button.label)
                    }
                }
              }

              return (
                <Pressable
                  key={button.label}
                  onPress={onPress}
                  onLongPress={isEquals ? handleEqualsLongPress : undefined}
                  delayLongPress={900}
                  style={({ pressed }) => [
                    themed($buttonBase),
                    themed($buttonType[button.type]),
                    button.flex ? { flex: button.flex } : { flex: 1 },
                    pressed && themed($buttonPressed),
                  ]}
                >
                  <Text preset="subheading" style={themed($buttonText[button.type])}>
                    {button.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
    </Screen>
  )
}

function isOperatorChar(value: string) {
  return operatorSymbols.includes(value as (typeof operatorSymbols)[number])
}

function toEvalExpression(value: string) {
  return value.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-")
}

function findLastNumberStart(value: string): number | null {
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const char = value[i]
    if ((char >= "0" && char <= "9") || char === ".") {
      continue
    }
    return i === value.length - 1 ? null : i + 1
  }
  return value.length > 0 ? 0 : null
}

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  backgroundColor: colors.background,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.xl,
})

const $displayContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral100,
  borderRadius: 24,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.xl,
  marginBottom: spacing.lg,
  minHeight: 96,
  justifyContent: "flex-end",
  shadowColor: colors.palette.neutral900,
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
})

const $displayText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  textAlign: "right",
})

const $buttonGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
})

const $buttonRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
})

const $buttonBase: ThemedStyle<ViewStyle> = ({ spacing, colors }) => ({
  borderRadius: 18,
  paddingVertical: spacing.lg,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.palette.neutral100,
  shadowColor: colors.palette.neutral900,
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
})

const $buttonPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.75,
})

const $buttonType: Record<ButtonType, ThemedStyle<ViewStyle>> = {
  number: ({ colors }) => ({
    backgroundColor: colors.palette.neutral100,
  }),
  operator: ({ colors }) => ({
    backgroundColor: colors.palette.neutral200,
  }),
  action: ({ colors }) => ({
    backgroundColor: colors.palette.neutral300,
  }),
  equals: ({ colors }) => ({
    backgroundColor: colors.palette.primary300,
  }),
}

const $buttonText: Record<ButtonType, ThemedStyle<TextStyle>> = {
  number: ({ colors }) => ({ color: colors.text }),
  operator: ({ colors }) => ({ color: colors.text }),
  action: ({ colors }) => ({ color: colors.text }),
  equals: ({ colors }) => ({ color: colors.palette.neutral900 }),
}
