import { FC, useMemo, useRef, useState } from "react"
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  TextStyle,
  UIManager,
  View,
  ViewStyle,
} from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { recordSecurityEvent } from "@/locker/security/auditLogRepo"
import { vaultSession } from "@/locker/session"
import {
  matchesDecoyVaultEntryCode,
  matchesRealVaultEntryCode,
} from "@/locker/storage/stealthEntryRepo"
import { getPostUnlockRoute } from "@/navigators/postUnlockRoute"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { evaluateExpression } from "@/utils/calc/evaluate"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

const binaryOperatorSymbols = ["+", "−", "×", "÷", "^"] as const
const postfixSymbols = ["%", "²"] as const

type ButtonType = "number" | "operator" | "action" | "equals"

type ButtonConfig = {
  label: string
  type: ButtonType
  flex?: number
}

type HistoryEntry = {
  id: string
  expression: string
  result: string
}

const advancedRows: ButtonConfig[][] = [
  [
    { label: "+/-", type: "action" },
    { label: "√", type: "action" },
    { label: "x²", type: "action" },
    { label: "mod", type: "action" },
    { label: "xʸ", type: "action" },
  ],
]

const coreRows: ButtonConfig[][] = [
  [
    { label: "AC", type: "action" },
    { label: "()", type: "action" },
    { label: "%", type: "action" },
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
    { label: "0", type: "number" },
    { label: ".", type: "number" },
    { label: "⌫", type: "action" },
    { label: "=", type: "equals" },
  ],
]

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

export const CalculatorScreen: FC<AppStackScreenProps<"Calculator">> = function CalculatorScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $bottomInsets = useSafeAreaInsetsStyle(["bottom"])

  const [display, setDisplay] = useState("0")
  const [lastAction, setLastAction] = useState<"input" | "equals">("input")
  const [completedExpression, setCompletedExpression] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [advancedExpanded, setAdvancedExpanded] = useState(false)
  const [menuVisible, setMenuVisible] = useState(false)
  const longPressTriggered = useRef(false)

  const displayText = useMemo(() => display, [display])
  const expressionText = useMemo(
    () => (lastAction === "equals" && completedExpression ? "Previous expression" : "Current expression"),
    [completedExpression, lastAction],
  )

  const resultText = useMemo(() => {
    if (lastAction === "equals" && completedExpression) return display
    return display
  }, [completedExpression, display, lastAction])

  const animateLayout = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
  }

  const resetCompletedExpression = () => {
    if (completedExpression !== null) {
      setCompletedExpression(null)
    }
  }

  const handleClear = () => {
    setDisplay("0")
    setLastAction("input")
    resetCompletedExpression()
  }

  const handleBackspace = () => {
    if (display === "Error") {
      setDisplay("0")
      setLastAction("input")
      resetCompletedExpression()
      return
    }

    if (display.length <= 1) {
      setDisplay("0")
      resetCompletedExpression()
      return
    }

    if (display.length === 2 && display.startsWith("−")) {
      setDisplay("0")
      resetCompletedExpression()
      return
    }

    const trailingOperator = getTrailingBinaryOperator(display)
    if (trailingOperator === "mod") {
      setDisplay(display.slice(0, -3) || "0")
      resetCompletedExpression()
      return
    }

    setDisplay(display.slice(0, -1))
    resetCompletedExpression()
  }

  const handleDigit = (digit: string) => {
    if (display === "Error") {
      setDisplay(digit)
      setLastAction("input")
      resetCompletedExpression()
      return
    }

    if (lastAction === "equals") {
      setDisplay(digit)
      setLastAction("input")
      resetCompletedExpression()
      return
    }

    if (display === "0") {
      setDisplay(digit)
      resetCompletedExpression()
      return
    }

    if (display === "−0") {
      setDisplay(`−${digit}`)
      resetCompletedExpression()
      return
    }

    if (shouldInsertImplicitMultiplyBeforeNumber(display)) {
      setDisplay(`${display}×${digit}`)
      resetCompletedExpression()
      return
    }

    setDisplay(`${display}${digit}`)
    resetCompletedExpression()
  }

  const handleDecimal = () => {
    if (display === "Error" || lastAction === "equals") {
      setDisplay("0.")
      setLastAction("input")
      resetCompletedExpression()
      return
    }

    if (shouldInsertImplicitMultiplyBeforeDecimal(display)) {
      setDisplay(`${display}×0.`)
      resetCompletedExpression()
      return
    }

    const lastNumberStart = findLastNumberStart(display)
    if (lastNumberStart === null) {
      setDisplay(`${display}0.`)
      resetCompletedExpression()
      return
    }

    const lastNumber = display.slice(lastNumberStart)
    if (lastNumber.includes(".")) return

    setDisplay(`${display}.`)
    resetCompletedExpression()
  }

  const handleOperator = (operator: string) => {
    if (display === "Error") {
      if (operator === "−") {
        setDisplay("−")
      } else {
        setDisplay("0")
      }
      setLastAction("input")
      resetCompletedExpression()
      return
    }

    if (lastAction === "equals") {
      setLastAction("input")
      resetCompletedExpression()
    }

    if (display.length === 0) return

    if (display === "0" && operator === "−") {
      setDisplay("−")
      resetCompletedExpression()
      return
    }

    const trailingOperator = getTrailingBinaryOperator(display)
    if (trailingOperator) {
      if (operator === "−" && trailingOperator !== "−" && canStartUnary(display)) {
        setDisplay(`${display}${operator}`)
        resetCompletedExpression()
        return
      }
      setDisplay(`${stripTrailingBinaryOperator(display)}${operator}`)
      resetCompletedExpression()
      return
    }

    const lastChar = display[display.length - 1]
    if (lastChar === "(" && operator === "−") {
      setDisplay(`${display}${operator}`)
      resetCompletedExpression()
      return
    }

    if (!canAppendBinaryOperator(display)) return
    setDisplay(`${display}${operator}`)
    resetCompletedExpression()
  }

  const handleToggleSign = () => {
    if (display === "Error") {
      setDisplay("0")
      resetCompletedExpression()
      return
    }

    if (lastAction === "equals") {
      setLastAction("input")
      resetCompletedExpression()
    }

    if (display === "0") {
      setDisplay("−0")
      resetCompletedExpression()
      return
    }

    const lastNumberStart = findLastNumberStart(display)
    if (lastNumberStart === null) {
      if (display.length === 0 || canStartUnary(display)) {
        setDisplay(`${display}−`)
        resetCompletedExpression()
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
    resetCompletedExpression()
  }

  const handleOpenParenthesis = () => {
    if (display === "Error" || lastAction === "equals") {
      setDisplay("(")
      setLastAction("input")
      resetCompletedExpression()
      return
    }

    if (display === "0") {
      setDisplay("(")
      resetCompletedExpression()
      return
    }

    if (shouldInsertImplicitMultiplyBeforeGroup(display)) {
      setDisplay(`${display}×(`)
      resetCompletedExpression()
      return
    }

    setDisplay(`${display}(`)
    resetCompletedExpression()
  }

  const handleParentheses = () => {
    if (shouldCloseParenthesis(display)) {
      handleCloseParenthesis()
      return
    }
    handleOpenParenthesis()
  }

  const handleCloseParenthesis = () => {
    if (!canAppendCloseParenthesis(display)) return
    setDisplay(`${display})`)
    setLastAction("input")
    resetCompletedExpression()
  }

  const handlePercent = () => {
    if (!canAppendPostfix(display)) return
    if (display.endsWith("%")) return
    setDisplay(`${display}%`)
    setLastAction("input")
    resetCompletedExpression()
  }

  const handleSquare = () => {
    if (!canAppendPostfix(display)) return
    if (display.endsWith("²")) return
    setDisplay(`${display}²`)
    setLastAction("input")
    resetCompletedExpression()
  }

  const handleSquareRoot = () => {
    if (display === "Error" || lastAction === "equals") {
      setDisplay("√(")
      setLastAction("input")
      resetCompletedExpression()
      return
    }

    if (display === "0") {
      setDisplay("√(")
      resetCompletedExpression()
      return
    }

    if (shouldInsertImplicitMultiplyBeforeGroup(display)) {
      setDisplay(`${display}×√(`)
      resetCompletedExpression()
      return
    }

    setDisplay(`${display}√(`)
    resetCompletedExpression()
  }

  const handleModulo = () => {
    handleOperator("mod")
  }

  const handlePower = () => {
    handleOperator("^")
  }

  const handleEquals = () => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }

    if (matchesRealVaultEntryCode(display)) {
      if (vaultSession.isUnlocked()) {
        const next = getPostUnlockRoute()
        if (next.name === "VaultOnboarding") {
          navigation.navigate("VaultOnboarding")
        } else {
          navigation.navigate("VaultTabs", next.params)
        }
      } else {
        navigation.navigate("VaultLocked")
      }
      return
    }

    if (matchesDecoyVaultEntryCode(display)) {
      recordSecurityEvent({
        type: "decoy_vault_open",
        message: "Decoy vault opened from calculator entry code.",
        severity: "info",
      })
      navigation.navigate("VaultTabs", {
        screen: "Security",
        params: { screen: "DecoyVault" },
      })
      return
    }

    const expression = display
    const result = evaluateExpression(expression)
    setDisplay(result)
    setLastAction("equals")
    if (result !== "Error") {
      setCompletedExpression(expression)
      setHistory((current) => [
        {
          id: `${Date.now()}-${current.length}`,
          expression,
          result,
        },
        ...current,
      ].slice(0, 24))
    }
  }

  const handleEqualsLongPress = () => {
    longPressTriggered.current = true
    navigation.navigate("VaultLocked")
  }

  const toggleHistory = () => {
    animateLayout()
    setHistoryExpanded((value) => !value)
    setMenuVisible(false)
  }

  const toggleAdvanced = () => {
    animateLayout()
    setAdvancedExpanded((value) => !value)
  }

  const toggleMenu = () => {
    setMenuVisible((value) => !value)
  }

  const handleClearHistory = () => {
    setHistory([])
    setMenuVisible(false)
  }

  const handleRestoreHistoryItem = (entry: HistoryEntry) => {
    setDisplay(entry.expression)
    setLastAction("input")
    setCompletedExpression(null)
    animateLayout()
    setHistoryExpanded(false)
  }

  return (
    <Screen preset="fixed" safeAreaEdges={['top', 'bottom']} contentContainerStyle={themed([$screen, $bottomInsets])}>
      <View style={themed($topBar)}>
        <Pressable onPress={toggleHistory} style={({ pressed }) => [themed($topButton), pressed && themed($buttonPressed)]}>
          <Text style={themed($topButtonText)}>
            {historyExpanded ? "History ▾" : "History ▴"}
          </Text>
        </Pressable>

        <Pressable onPress={toggleMenu} style={({ pressed }) => [themed($topButton), pressed && themed($buttonPressed)]}>
          <Text style={themed($topButtonText)}>⋮</Text>
        </Pressable>
      </View>

      <View style={themed($upperSection)}>
        {historyExpanded ? (
          <View style={themed($historyPanel)}>
            <Text preset="subheading" size="xs" style={themed($historyTitle)}>
              History
            </Text>
            {history.length === 0 ? (
              <View style={themed($historyEmptyState)}>
                <Text size="xs" style={themed($historyEmptyText)}>
                  No recent calculations yet.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={themed($historyScroll)}
                contentContainerStyle={themed($historyScrollContent)}
                showsVerticalScrollIndicator={false}
              >
                {history.map((entry) => (
                  <Pressable
                    key={entry.id}
                    onPress={() => handleRestoreHistoryItem(entry)}
                    style={({ pressed }) => [themed($historyItem), pressed && themed($buttonPressed)]}
                  >
                    <Text size="xs" style={themed($historyExpression)} numberOfLines={1}>
                      {entry.expression}
                    </Text>
                    <Text preset="subheading" style={themed($historyResult)} numberOfLines={1}>
                      {entry.result}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        <View style={themed($displayContainer)}>
          <Text size="xs" style={themed($expressionLabel)} numberOfLines={1}>
            {expressionText}
          </Text>
          {lastAction === "equals" && completedExpression ? (
            <Text size="sm" style={themed($expressionPreview)} numberOfLines={1}>
              {completedExpression}
            </Text>
          ) : null}
          <Text preset="heading" style={themed($displayText)} numberOfLines={1}>
            {resultText}
          </Text>
        </View>
      </View>

      <View style={themed($keypadSection)}>
        <Pressable onPress={toggleAdvanced} style={({ pressed }) => [themed($advancedToggle), pressed && themed($buttonPressed)]}>
          <Text size="xl" style={themed($advancedToggleText)}>
            {advancedExpanded ? "▾" : "▴"}
          </Text>
        </Pressable>

        {advancedExpanded ? (
          <View style={themed($advancedSection)}>
            {advancedRows.map((row, rowIndex) => (
              <View key={`advanced-row-${rowIndex}`} style={themed($buttonRow)}>
                {row.map((button) => (
                  <Pressable
                    key={button.label}
                    onPress={() => {
                      switch (button.label) {
                        case "+/-":
                          handleToggleSign()
                          break
                        case "√":
                          handleSquareRoot()
                          break
                        case "x²":
                          handleSquare()
                          break
                        case "mod":
                          handleModulo()
                          break
                        case "xʸ":
                          handlePower()
                          break
                      }
                    }}
                    style={({ pressed }) => [
                      themed($buttonBase),
                      themed($buttonType.action),
                      { flex: 1 },
                      pressed && themed($buttonPressed),
                    ]}
                  >
                    <Text preset="subheading" style={themed($buttonText.action)}>
                      {button.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        <View style={themed($buttonGrid)}>
        {coreRows.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={themed($buttonRow)}>
            {row.map((button) => {
              const isEquals = button.label === "="
              const onPress = () => {
                switch (button.label) {
                  case "()":
                    handleParentheses()
                    break
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
                  case "%":
                    handlePercent()
                    break
                  default:
                    if (isOperatorButton(button.label)) {
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
      </View>

      {menuVisible ? (
        <Pressable style={themed($menuBackdrop)} onPress={() => setMenuVisible(false)}>
          <View style={themed($menuCard)}>
            <Pressable
              onPress={handleClearHistory}
              style={({ pressed }) => [themed($menuItem), pressed && themed($buttonPressed)]}
            >
              <Text style={themed($menuItemText)}>Clear history</Text>
            </Pressable>
          </View>
        </Pressable>
      ) : null}
    </Screen>
  )
}

function isOperatorChar(value: string) {
  return isBinaryOperatorChar(value)
}

function isBinaryOperatorChar(value: string) {
  return binaryOperatorSymbols.includes(value as (typeof binaryOperatorSymbols)[number])
}

function isOperatorButton(value: string) {
  return isBinaryOperatorChar(value) || value === "mod"
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

function shouldInsertImplicitMultiplyBeforeGroup(value: string) {
  if (value.length === 0 || value === "0" || value === "Error") return false
  const lastChar = value[value.length - 1]
  return (
    isDigitChar(lastChar) ||
    lastChar === ")" ||
    postfixSymbols.includes(lastChar as "²" | "%")
  )
}

function shouldInsertImplicitMultiplyBeforeNumber(value: string) {
  if (value.length === 0 || value === "0" || value === "Error") return false
  const lastChar = value[value.length - 1]
  return lastChar === ")" || postfixSymbols.includes(lastChar as "²" | "%")
}

function shouldInsertImplicitMultiplyBeforeDecimal(value: string) {
  return shouldInsertImplicitMultiplyBeforeNumber(value)
}

function canAppendBinaryOperator(value: string) {
  if (value.length === 0 || value === "Error") return false
  const lastChar = value[value.length - 1]
  return (
    isDigitChar(lastChar) ||
    lastChar === "." ||
    lastChar === ")" ||
    postfixSymbols.includes(lastChar as "²" | "%")
  )
}

function canAppendPostfix(value: string) {
  if (value.length === 0 || value === "Error") return false
  const lastChar = value[value.length - 1]
  return isDigitChar(lastChar) || lastChar === ")" || lastChar === "²"
}

function canAppendCloseParenthesis(value: string) {
  const openCount = (value.match(/\(/g) ?? []).length
  const closeCount = (value.match(/\)/g) ?? []).length
  if (openCount <= closeCount) return false
  const lastChar = value[value.length - 1]
  return (
    isDigitChar(lastChar) ||
    lastChar === ")" ||
    lastChar === "%" ||
    lastChar === "²"
  )
}

function shouldCloseParenthesis(value: string) {
  const openCount = (value.match(/\(/g) ?? []).length
  const closeCount = (value.match(/\)/g) ?? []).length
  return openCount > closeCount && canAppendCloseParenthesis(value)
}

function canStartUnary(value: string) {
  const trailingOperator = getTrailingBinaryOperator(value)
  if (trailingOperator) return true
  const lastChar = value[value.length - 1]
  return lastChar === "("
}

function isDigitChar(value: string) {
  return value >= "0" && value <= "9"
}

function getTrailingBinaryOperator(value: string) {
  if (value.endsWith("mod")) return "mod"
  const lastChar = value[value.length - 1]
  return isBinaryOperatorChar(lastChar) ? lastChar : null
}

function stripTrailingBinaryOperator(value: string) {
  if (value.endsWith("mod")) return value.slice(0, -3)
  return value.slice(0, -1)
}

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  backgroundColor: colors.background,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  position: "relative",
})

const $topBar: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: spacing.md,
})

const $topButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minWidth: 44,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderRadius: 16,
  backgroundColor: colors.palette.neutral100,
})

const $topButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $upperSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "flex-start",
  gap: spacing.md,
})

const $historyPanel: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral100,
  borderRadius: 24,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  paddingBottom: spacing.sm,
  maxHeight: 240,
})

const $historyTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  marginBottom: spacing.sm,
})

const $historyScroll: ThemedStyle<ViewStyle> = () => ({
  flexGrow: 0,
})

const $historyScrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $historyItem: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.sm,
})

const $historyExpression: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "right",
})

const $historyResult: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  textAlign: "right",
})

const $historyEmptyState: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.lg,
})

const $historyEmptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})

const $displayContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral100,
  borderRadius: 24,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.xl,
  minHeight: 120,
  justifyContent: "flex-end",
  shadowColor: colors.palette.neutral900,
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
})

const $expressionLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "right",
})

const $expressionPreview: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  textAlign: "right",
  marginTop: spacing.xs,
  marginBottom: spacing.xs,
})

const $displayText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  textAlign: "right",
})

const $keypadSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: spacing.md,
  gap: spacing.md,
})

const $advancedToggle: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignSelf: "left",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
})

const $advancedToggleText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $buttonGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
})

const $advancedSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
})

const $buttonRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
  flexWrap: "wrap",
})

const $buttonBase: ThemedStyle<ViewStyle> = ({ spacing, colors }) => ({
  borderRadius: 18,
  minWidth: 0,
  paddingVertical: spacing.md,
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
  action: ({ colors }) => ({ color: colors.text, fontSize: 16, lineHeight: 20 }),
  equals: ({ colors }) => ({ color: colors.palette.neutral900 }),
}

const $menuBackdrop: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
})

const $menuCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  position: "absolute",
  top: spacing.xl * 2,
  right: spacing.lg,
  minWidth: 160,
  borderRadius: 16,
  backgroundColor: colors.palette.neutral100,
  paddingVertical: spacing.xs,
  shadowColor: colors.palette.neutral900,
  shadowOpacity: 0.12,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
})

const $menuItem: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
})

const $menuItemText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})
