import { FC, useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { LayoutChangeEvent, Pressable, StyleSheet, TextStyle, View, ViewStyle } from "react-native"
import { LinearGradient } from "expo-linear-gradient"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import {
  ScientificPanel,
  type ScientificKeyId,
} from "@/screens/calculatorAlt/ScientificPanel"
import {
  evaluateScientificExpression,
  formatComputedNumber,
  formatExpressionParts,
  formatHeroValue,
} from "@/screens/calculatorAlt/scientificEvaluator"
import { typography } from "@/theme/typography"


const BASE_FONT_SIZE = 220
const MIN_FONT_SIZE = 20
const DEFAULT_EXPRESSION = "3164977+8+22+333"
const DEFAULT_DISPLAY = "333"

type AngleMode = "rad" | "deg"
type EntryMode = "input" | "equals"
type Range = { start: number; end: number }

const keypadRows = [
  [
    { key: "clear", label: "C", tone: "muted" as const },
    { key: "percent", label: "%", tone: "muted" as const },
    { key: "delete", label: "⌫", tone: "muted" as const },
    { key: "÷", label: "÷", tone: "operator" as const },
  ],
  [
    { key: "7", label: "7", tone: "number" as const },
    { key: "8", label: "8", tone: "number" as const },
    { key: "9", label: "9", tone: "number" as const },
    { key: "×", label: "×", tone: "operator" as const },
  ],
  [
    { key: "4", label: "4", tone: "number" as const },
    { key: "5", label: "5", tone: "number" as const },
    { key: "6", label: "6", tone: "number" as const },
    { key: "−", label: "−", tone: "operator" as const },
  ],
  [
    { key: "1", label: "1", tone: "number" as const },
    { key: "2", label: "2", tone: "number" as const },
    { key: "3", label: "3", tone: "number" as const },
    { key: "+", label: "+", tone: "operator" as const },
  ],
  [
    { key: "0", label: "0", tone: "number" as const },
    { key: ".", label: ".", tone: "number" as const },
    { key: "sign", label: "+/-", tone: "number" as const },
    { key: "=", label: "=", tone: "equals" as const },
  ],
]

export const CalculatorAltScreen: FC<AppStackScreenProps<"CalculatorAlt">> =
  function CalculatorAltScreen() {
    const [expression, setExpression] = useState(DEFAULT_EXPRESSION)
    const [displayValue, setDisplayValue] = useState(DEFAULT_DISPLAY)
    const [entryMode, setEntryMode] = useState<EntryMode>("input")
    const [previewMode, setPreviewMode] = useState(true)
    const [scientificOpen, setScientificOpen] = useState(false)
    const [secondMode, setSecondMode] = useState(false)
    const [angleMode, setAngleMode] = useState<AngleMode>("rad")
    const [memoryValue, setMemoryValue] = useState<number | null>(null)

    const expressionParts = useMemo(() => formatExpressionParts(expression), [expression])
    const heroText = displayValue === "Error" ? "ERR" : formatHeroValue(displayValue)

    const setFreshState = useCallback((nextExpression: string, nextDisplay = nextExpression) => {
      setExpression(nextExpression)
      setDisplayValue(nextDisplay)
      setEntryMode("input")
      setPreviewMode(false)
    }, [])

    const maybeResetSecondMode = useCallback(() => {
      setSecondMode((value) => (value ? false : value))
    }, [])

    const replaceCurrentOperand = useCallback(
      (nextOperand: string) => {
        if (previewMode || entryMode === "equals") {
          setFreshState(nextOperand)
          return
        }

        const range = findTrailingOperandRange(expression)
        if (!range) {
          if (isTrailingOperator(expression) || expression.endsWith("(")) {
            const nextExpression = `${expression}${nextOperand}`
            setFreshState(nextExpression, nextOperand)
            return
          }

          setFreshState(nextOperand)
          return
        }

        const nextExpression =
          expression.slice(0, range.start) + nextOperand + expression.slice(range.end)
        setFreshState(nextExpression, nextOperand)
      },
      [entryMode, expression, previewMode, setFreshState],
    )

    const insertAtTail = useCallback(
      (token: string, displayToken = token, options?: { implicitMultiply?: boolean }) => {
        const baseExpression = previewMode || entryMode === "equals" || displayValue === "Error" ? "" : expression
        const shouldMultiply =
          options?.implicitMultiply &&
          baseExpression.length > 0 &&
          !isTrailingOperator(baseExpression) &&
          !baseExpression.endsWith("(")

        const nextExpression = `${baseExpression}${shouldMultiply ? "×" : ""}${token}`
        setExpression(nextExpression)
        setDisplayValue(displayToken)
        setEntryMode("input")
        setPreviewMode(false)
      },
      [displayValue, entryMode, expression, previewMode],
    )

    const insertWrappedFunction = useCallback(
      (name: string) => {
        const range = !previewMode && entryMode !== "equals" ? findTrailingOperandRange(expression) : null
        if (!range) {
          insertAtTail(`${name}(`, "0", { implicitMultiply: true })
          maybeResetSecondMode()
          return
        }

        const operand = expression.slice(range.start, range.end)
        const wrapped = `${name}(${operand})`
        const nextExpression =
          expression.slice(0, range.start) + wrapped + expression.slice(range.end)
        const nextDisplay = evaluateScientificExpression(wrapped, { angleMode })

        setExpression(nextExpression)
        setDisplayValue(nextDisplay)
        setEntryMode("input")
        setPreviewMode(false)
        maybeResetSecondMode()
      },
      [angleMode, entryMode, expression, insertAtTail, maybeResetSecondMode, previewMode],
    )

    const handleDigit = useCallback(
      (digit: string) => {
        if (previewMode || entryMode === "equals" || displayValue === "Error") {
          setFreshState(digit)
          return
        }

        const currentOperand = getCurrentOperand(expression)
        if (currentOperand === "0" && !expression.endsWith(".") && !expression.endsWith("E")) {
          replaceCurrentOperand(digit)
          return
        }

        const nextExpression = `${expression}${digit}`
        setFreshState(nextExpression, getCurrentOperand(nextExpression))
      },
      [displayValue, entryMode, expression, previewMode, replaceCurrentOperand, setFreshState],
    )

    const handleDecimal = useCallback(() => {
      if (previewMode || entryMode === "equals" || displayValue === "Error") {
        setFreshState("0.")
        return
      }

      const currentOperand = getCurrentOperand(expression)
      if (currentOperand.includes(".") && !currentOperand.includes("E")) return
      if (currentOperand.includes("E")) return

      if (isTrailingOperator(expression) || expression.endsWith("(")) {
        const nextExpression = `${expression}0.`
        setFreshState(nextExpression, "0.")
        return
      }

      const nextExpression = `${expression}.`
      setFreshState(nextExpression, getCurrentOperand(nextExpression))
    }, [displayValue, entryMode, expression, previewMode, setFreshState])

    const handleOperator = useCallback(
      (operator: "+" | "−" | "×" | "÷" | "^" | "root") => {
        if (displayValue === "Error") {
          setFreshState("0")
          return
        }

        const currentOperand = previewMode || entryMode === "equals" ? displayValue : getCurrentOperand(expression)
        if (currentOperand.endsWith("E") && (operator === "+" || operator === "−")) {
          const exponentSign = operator === "−" ? "-" : "+"
          const nextExpression = `${expression}${exponentSign}`
          setFreshState(nextExpression, getCurrentOperand(nextExpression))
          return
        }

        const baseExpression = previewMode || entryMode === "equals" ? displayValue : expression
        const safeBase = baseExpression === "" ? "0" : baseExpression
        const nextExpression = isTrailingOperator(safeBase)
          ? `${safeBase.slice(0, -getTrailingOperatorLength(safeBase))}${operator}`
          : `${safeBase}${operator}`

        setExpression(nextExpression)
        setDisplayValue(getCurrentOperand(nextExpression))
        setEntryMode("input")
        setPreviewMode(false)
      },
      [displayValue, entryMode, expression, previewMode, setFreshState],
    )

    const handleParenthesis = useCallback(
      (token: "(" | ")") => {
        if (token === "(") {
          insertAtTail("(", "0", { implicitMultiply: true })
          return
        }

        if (previewMode || entryMode === "equals") return
        if (getOpenParenCount(expression) <= 0) return
        if (isTrailingOperator(expression) || expression.endsWith("(")) return

        const nextExpression = `${expression})`
        setExpression(nextExpression)
        setDisplayValue(getCurrentOperand(nextExpression))
        setEntryMode("input")
        setPreviewMode(false)
      },
      [entryMode, expression, insertAtTail, previewMode],
    )

    const handleClear = useCallback(() => {
      setFreshState("0")
    }, [setFreshState])

    const handleDelete = useCallback(() => {
      if (previewMode || displayValue === "Error" || entryMode === "equals") {
        setFreshState("0")
        return
      }

      if (expression.length <= 1) {
        setFreshState("0")
        return
      }

      const nextExpression = expression.slice(0, -1)
      if (nextExpression.length === 0) {
        setFreshState("0")
        return
      }

      const nextDisplay = isTrailingOperator(nextExpression) || nextExpression.endsWith("(")
        ? "0"
        : getCurrentOperand(nextExpression)

      setExpression(nextExpression)
      setDisplayValue(nextDisplay)
      setEntryMode("input")
      setPreviewMode(false)
    }, [displayValue, entryMode, expression, previewMode, setFreshState])

    const handlePercent = useCallback(() => {
      insertWrappedFunction("percent")
    }, [insertWrappedFunction])

    const handleToggleSign = useCallback(() => {
      if (displayValue === "Error") {
        setFreshState("0")
        return
      }

      if (previewMode || entryMode === "equals") {
        setFreshState(toggleSignExpression(displayValue))
        return
      }

      const range = findTrailingOperandRange(expression)
      if (!range) return
      const operand = expression.slice(range.start, range.end)
      const toggled = toggleSignExpression(operand)
      const nextExpression =
        expression.slice(0, range.start) + toggled + expression.slice(range.end)

      setExpression(nextExpression)
      setDisplayValue(toggled)
      setEntryMode("input")
      setPreviewMode(false)
    }, [displayValue, entryMode, expression, previewMode, setFreshState])

    const handleEquals = useCallback(() => {
      const sourceExpression = previewMode ? DEFAULT_EXPRESSION : expression
      const result = evaluateScientificExpression(sourceExpression, { angleMode })
      setExpression(sourceExpression)
      setDisplayValue(result)
      setEntryMode("equals")
      setPreviewMode(false)
    }, [angleMode, expression, previewMode])

    const handleScientificNotation = useCallback(() => {
      if (displayValue === "Error") {
        setFreshState("0")
        return
      }

      const currentOperand = previewMode || entryMode === "equals" ? displayValue : getCurrentOperand(expression)
      const normalized = normalizeOperandToken(currentOperand)
      if (normalized.includes("E")) return
      if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return

      const nextOperand = `${normalized}E`
      if (previewMode || entryMode === "equals") {
        setFreshState(nextOperand)
        return
      }

      replaceCurrentOperand(nextOperand)
    }, [displayValue, entryMode, expression, previewMode, replaceCurrentOperand, setFreshState])

    const handleScientificKey = useCallback(
      (key: ScientificKeyId) => {
        switch (key) {
          case "(":
            handleParenthesis("(")
            return
          case ")":
            handleParenthesis(")")
            return
          case "mc":
            setMemoryValue(null)
            return
          case "m+":
            adjustMemory(displayValue, 1, setMemoryValue)
            return
          case "m-":
            adjustMemory(displayValue, -1, setMemoryValue)
            return
          case "mr":
            if (memoryValue === null) return
            replaceCurrentOperand(formatComputedNumber(memoryValue))
            return
          case "2nd":
            setSecondMode((value) => !value)
            return
          case "x²":
            insertWrappedFunction("square")
            return
          case "x³":
            insertWrappedFunction("cube")
            return
          case "xʸ":
            handleOperator("^")
            return
          case "eˣ":
            insertWrappedFunction(secondMode ? "ln" : "exp")
            return
          case "10ˣ":
            insertWrappedFunction(secondMode ? "log10" : "tenpow")
            return
          case "1/x":
            insertWrappedFunction("inv")
            return
          case "²√x":
            insertWrappedFunction("sqrt")
            return
          case "³√x":
            insertWrappedFunction("cbrt")
            return
          case "ʸ√x":
            handleOperator("root")
            return
          case "ln":
            insertWrappedFunction("ln")
            return
          case "log10":
            insertWrappedFunction("log10")
            return
          case "x!":
            insertWrappedFunction("fact")
            return
          case "sin":
            insertWrappedFunction(secondMode ? "asin" : "sin")
            return
          case "cos":
            insertWrappedFunction(secondMode ? "acos" : "cos")
            return
          case "tan":
            insertWrappedFunction(secondMode ? "atan" : "tan")
            return
          case "e":
            insertAtTail("e", "e", { implicitMultiply: true })
            maybeResetSecondMode()
            return
          case "EE":
            handleScientificNotation()
            return
          case "Rand": {
            const randomLiteral = formatComputedNumber(Math.random())
            insertAtTail(randomLiteral, randomLiteral, {
              implicitMultiply: true,
            })
            maybeResetSecondMode()
            return
          }
          case "sinh":
            insertWrappedFunction(secondMode ? "asinh" : "sinh")
            return
          case "cosh":
            insertWrappedFunction(secondMode ? "acosh" : "cosh")
            return
          case "tanh":
            insertWrappedFunction(secondMode ? "atanh" : "tanh")
            return
          case "π":
            insertAtTail("π", "π", { implicitMultiply: true })
            maybeResetSecondMode()
            return
          case "Rad":
            setAngleMode((value) => (value === "rad" ? "deg" : "rad"))
        }
      },
      [
        displayValue,
        handleOperator,
        handleParenthesis,
        handleScientificNotation,
        insertAtTail,
        insertWrappedFunction,
        maybeResetSecondMode,
        memoryValue,
        replaceCurrentOperand,
        secondMode,
      ],
    )

    return (
      <Screen
        preset="fixed"
        safeAreaEdges={["top", "bottom"]}
        contentContainerStyle={$screen}
        backgroundColor="#141414"
      >
        <View style={$backgroundBase}>
          <LinearGradient
            colors={["#232323", "#141414", "#101010"]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.76, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View pointerEvents="none" style={$verticalTexture} />
          <LinearGradient
            colors={["rgba(255,255,255,0.05)", "transparent", "rgba(0,0,0,0.36)"]}
            start={{ x: 0.12, y: 0 }}
            end={{ x: 0.88, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

      

        <View style={$content}>
          <View style={$expressionRow}>
            {expressionParts.map((token, index) => (
              <Text
                key={`${token.value}-${index}`}
                style={[
                  $expressionToken,
                  token.isOperator ? $expressionOperator : $expressionNumber,
                ]}
              >
                {token.value}
              </Text>
            ))}
          </View>

          <View style={$heroWrap}>
            <ExtrudedDisplay text={heroText} />
          </View>

          <View style={$keypad}>
            {keypadRows.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={$keypadRow}>
                {row.map((item) => (
                  <Pressable
                    key={item.key}
                    hitSlop={8}
                    onPress={() => {
                      switch (item.key) {
                        case "clear":
                          handleClear()
                          break
                        case "percent":
                          handlePercent()
                          break
                        case "delete":
                          handleDelete()
                          break
                        case ".":
                          handleDecimal()
                          break
                        case "sign":
                          handleToggleSign()
                          break
                        case "=":
                          handleEquals()
                          break
                        case "+":
                        case "−":
                        case "×":
                        case "÷":
                          handleOperator(item.key)
                          break
                        default:
                          handleDigit(item.key)
                      }
                    }}
                    style={({ pressed }) => [
                      $key,
                      pressed && $keyPressed,
                      item.tone === "operator" && $operatorKey,
                      item.tone === "equals" && $equalsKey,
                    ]}
                  >
                    <Text
                      style={[
                        $keyLabel,
                        item.tone === "muted" && $keyLabelMuted,
                        item.tone === "operator" && $keyLabelOperator,
                        item.tone === "equals" && $keyLabelEquals,
                        item.key === "sign" && $signLabel,
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
          <ScientificPanel
          angleMode={angleMode}
          hasMemory={memoryValue !== null}
          isOpen={scientificOpen}
          isSecondMode={secondMode}
          onKeyPress={handleScientificKey}
          onToggle={() => setScientificOpen((value) => !value)}
        />
      </Screen>
    )
  }

const ExtrudedText: FC<{ text: string; fontSize: number }> = ({
  text,
  fontSize,
}) => {
  const dynamicStyle = {
    fontSize,
    lineHeight: fontSize,
    letterSpacing: -fontSize * 0.002,
  }

  return (
    <>
      <Text style={[$displayText, dynamicStyle, $displayShadowFar]}>{text}</Text>
      <Text style={[$displayText, dynamicStyle, $displayShadowMid]}>{text}</Text>
      <Text style={[$displayText, dynamicStyle, $displayDepth]}>{text}</Text>
      <Text style={[$displayText, dynamicStyle, $displayFaceShade]}>{text}</Text>
      <Text style={[$displayText, dynamicStyle, $displayFaceHighlight]}>
        {text}
      </Text>
      <Text style={[$displayText, dynamicStyle, $displayFace]}>{text}</Text>
    </>
  )
}


const ExtrudedDisplay: FC<{ text: string }> = ({ text }) => {
  const [containerWidth, setContainerWidth] = useState(0)

  const handleLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width)
  }

  const estimatedCharWidth = BASE_FONT_SIZE * 0.6 
  const estimatedTextWidth = text.length * estimatedCharWidth

  let scale = 1
  if (containerWidth > 0 && estimatedTextWidth > containerWidth) {
    scale = containerWidth / estimatedTextWidth
  }

  const fontSize = Math.max(BASE_FONT_SIZE * scale, MIN_FONT_SIZE)

  return (
    <View style={$displayStack} onLayout={handleLayout}>
      <ExtrudedText text={text} fontSize={fontSize} />
    </View>
  )
}


function adjustMemory(
  displayValue: string,
  direction: 1 | -1,
  setMemoryValue: Dispatch<SetStateAction<number | null>>,
) {
  const parsed = parseDisplayNumber(displayValue)
  if (parsed === null) return
  setMemoryValue((current) => {
    const next = (current ?? 0) + parsed * direction
    return Number.isFinite(next) ? next : current
  })
}

function parseDisplayNumber(value: string) {
  if (value === "Error") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeOperandToken(operand: string) {
  return operand.replace("−", "-")
}

function toggleSignExpression(operand: string) {
  if (operand.includes("E")) {
    return operand.includes("E-") ? operand.replace("E-", "E") : operand.replace("E", "E-")
  }

  return operand.startsWith("-") ? operand.slice(1) : `-${operand}`
}

function findTrailingOperandRange(expression: string): Range | null {
  let end = expression.length
  while (end > 0 && /[!%]/.test(expression[end - 1])) {
    end -= 1
  }
  if (end <= 0) return null

  const suffix = expression.slice(0, end)
  const numberMatch = suffix.match(/-?(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d*)?$/)
  if (numberMatch) {
    return { start: end - numberMatch[0].length, end: expression.length }
  }

  if (suffix.endsWith("π") || suffix.endsWith("e")) {
    return { start: end - 1, end: expression.length }
  }

  const lastChar = suffix[suffix.length - 1]
  if (lastChar === ")") {
    let depth = 1
    let cursor = suffix.length - 2
    while (cursor >= 0) {
      if (suffix[cursor] === ")") depth += 1
      if (suffix[cursor] === "(") depth -= 1
      if (depth === 0) {
        let start = cursor
        while (start > 0 && /[A-Za-z0-9]/.test(suffix[start - 1])) {
          start -= 1
        }
        if (start > 0 && suffix[start - 1] === "-" && isUnaryStart(suffix, start - 1)) {
          start -= 1
        }
        return { start, end: expression.length }
      }
      cursor -= 1
    }
    return null
  }

  const identifierMatch = suffix.match(/[A-Za-z][A-Za-z0-9]*$/)
  if (identifierMatch) {
    const start = end - identifierMatch[0].length
    return { start, end: expression.length }
  }

  return null
}

function isUnaryStart(expression: string, index: number) {
  if (index === 0) return true
  const previous = expression[index - 1]
  return previous === "(" || previous === "+" || previous === "−" || previous === "×" || previous === "÷" || previous === "^"
}

function getCurrentOperand(expression: string) {
  if (isTrailingOperator(expression) || expression.endsWith("(")) return "0"
  const range = findTrailingOperandRange(expression)
  return range ? expression.slice(range.start, range.end) : "0"
}

function getOpenParenCount(expression: string) {
  const open = (expression.match(/\(/g) ?? []).length
  const close = (expression.match(/\)/g) ?? []).length
  return open - close
}

function isTrailingOperator(expression: string) {
  return (
    expression.endsWith("+") ||
    expression.endsWith("−") ||
    expression.endsWith("×") ||
    expression.endsWith("÷") ||
    expression.endsWith("^") ||
    expression.endsWith("root")
  )
}

function getTrailingOperatorLength(expression: string) {
  return expression.endsWith("root") ? 4 : 1
}

const $screen: ViewStyle = {
  flex: 1,
}

const $backgroundBase: ViewStyle = {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: "#111111",
}

const $verticalTexture: ViewStyle = {
  ...StyleSheet.absoluteFillObject,
  opacity: 0.05,
  backgroundColor: "#ffffff",
}

const $content: ViewStyle = {
  flex: 1,
  paddingHorizontal: 26,
  paddingTop: 78,
  paddingBottom: 28,
  position: "relative",
  zIndex: 1,
  elevation: 1,
}

const $expressionRow: ViewStyle = {
  minHeight: 44,
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "flex-end",
  // justifyContent: 'center',
  paddingHorizontal: 2,
}

const $expressionToken: TextStyle = {
  fontFamily: typography.primary.medium,
  fontSize: 24,
  lineHeight: 28,
  letterSpacing: -0.8,
  marginRight: 2,
  textAlign:'center',
}

const $expressionNumber: TextStyle = {
  color: "#87837f",
}

const $expressionOperator: TextStyle = {
  color: "#f1b219",
}

const $heroWrap: ViewStyle = {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingTop: 24,
  paddingBottom: 28,
  position: "relative",
  overflow: "hidden",
  zIndex: 0,
}

const $displayStack: ViewStyle = {
  position: "relative",
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 330,
  overflow: "hidden",
  zIndex: 0,
}

const $displayText: TextStyle = {
  position: "absolute",
  width: "100%",
  fontFamily: typography.primary.bold,
  textAlign: "center",
  includeFontPadding: false,
  textAlignVertical: "center",
  transform: [{ scaleX: 0.6 }],
}

const $displayShadowFar: TextStyle = {
  color: "rgba(0,0,0,0.92)",
  transform: [{ translateX: -26 }, { translateY: 34 }, { scaleX: 0.6 }],
}

const $displayShadowMid: TextStyle = {
  color: "rgba(0,0,0,0.45)",
  transform: [{ translateX: -14 }, { translateY: 18 }, { scaleX: 0.6 }],
}

const $displayDepth: TextStyle = {
  color: "#bababa",
  transform: [{ translateX: -7 }, { translateY: 10 }, { scaleX: 0.6 }],
}

const $displayFaceShade: TextStyle = {
  color: "#d4d4d4",
  transform: [{ translateX: 3 }, { translateY: 3 }, { scaleX: 0.6 }],
}

const $displayFaceHighlight: TextStyle = {
  color: "#ffffff",
  transform: [{ translateX: -1 }, { translateY: -2 }, { scaleX: 0.6 }],
  opacity: 0.9,
}

const $displayFace: TextStyle = {
  color: "#efefef",
}

const $keypad: ViewStyle = {
  gap: 14,
  paddingTop: 8,
}

const $keypadRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
}

const $key: ViewStyle = {
  width: "24%",
  minHeight: 74,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 18,
}

const $keyPressed: ViewStyle = {
  opacity: 0.6,
  transform: [{ scale: 0.96 }],
}

const $operatorKey: ViewStyle = {
  marginLeft: 6,
}

const $equalsKey: ViewStyle = {
  marginLeft: 6,
}

const $keyLabel: TextStyle = {
  fontFamily: typography.primary.medium,
  fontSize: 44,
  lineHeight: 46,
  color: "#f0eeeb",
  letterSpacing: -2.2,
}

const $keyLabelMuted: TextStyle = {
  color: "#7d7a76",
}

const $keyLabelOperator: TextStyle = {
  color: "#f1b219",
}

const $keyLabelEquals: TextStyle = {
  color: "#e7a0ad",
}

const $signLabel: TextStyle = {
  fontSize: 34,
  lineHeight: 38,
  letterSpacing: -1.2,
}
