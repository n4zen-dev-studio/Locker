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
    const [displayExpression, setDisplayExpression] = useState(DEFAULT_EXPRESSION)
    const [displayValue, setDisplayValue] = useState(DEFAULT_DISPLAY)
    const [entryMode, setEntryMode] = useState<EntryMode>("input")
    const [previewMode, setPreviewMode] = useState(true)
    const [scientificOpen, setScientificOpen] = useState(false)
    const [secondMode, setSecondMode] = useState(false)
    const [angleMode, setAngleMode] = useState<AngleMode>("rad")
    const [memoryValue, setMemoryValue] = useState<number | null>(null)

    const expressionParts = useMemo(
      () => formatDisplayExpressionParts(displayExpression),
      [displayExpression],
    )
    const heroText = displayValue === "Error" ? "ERR" : formatHeroValue(displayValue)

    const setFreshState = useCallback(
      (
        nextExpression: string,
        nextDisplayExpression = nextExpression,
        nextDisplayValue = nextDisplayExpression,
      ) => {
        setExpression(nextExpression)
        setDisplayExpression(nextDisplayExpression)
        setDisplayValue(nextDisplayValue)
        setEntryMode("input")
        setPreviewMode(false)
      },
      [],
    )

    const maybeResetSecondMode = useCallback(() => {
      setSecondMode((value) => (value ? false : value))
    }, [])

    const replaceCurrentOperand = useCallback(
      (nextOperand: string, nextDisplayOperand = nextOperand) => {
        if (previewMode || entryMode === "equals") {
          setFreshState(nextOperand, nextDisplayOperand, nextDisplayOperand)
          return
        }

        const expressionRange = findTrailingOperandRange(expression)
        const displayRange = findTrailingDisplayOperandRange(displayExpression)
        if (!expressionRange || !displayRange) {
          if (isTrailingOperator(expression) || expression.endsWith("(")) {
            const nextExpression = `${expression}${nextOperand}`
            const nextDisplayExpression = `${displayExpression}${nextDisplayOperand}`
            setFreshState(nextExpression, nextDisplayExpression, nextDisplayOperand)
            return
          }

          setFreshState(nextOperand, nextDisplayOperand, nextDisplayOperand)
          return
        }

        const nextExpression =
          expression.slice(0, expressionRange.start) +
          nextOperand +
          expression.slice(expressionRange.end)
        const nextDisplayExpression =
          displayExpression.slice(0, displayRange.start) +
          nextDisplayOperand +
          displayExpression.slice(displayRange.end)
        setFreshState(nextExpression, nextDisplayExpression, nextDisplayOperand)
      },
      [displayExpression, entryMode, expression, previewMode, setFreshState],
    )

    const insertAtTail = useCallback(
      (
        token: string,
        displayToken = token,
        options?: { displayValue?: string; implicitMultiply?: boolean },
      ) => {
        const baseExpression = previewMode || entryMode === "equals" || displayValue === "Error" ? "" : expression
        const baseDisplayExpression =
          previewMode || entryMode === "equals" || displayValue === "Error" ? "" : displayExpression
        const shouldMultiply =
          options?.implicitMultiply &&
          baseExpression.length > 0 &&
          !isTrailingOperator(baseExpression) &&
          !baseExpression.endsWith("(")

        const nextExpression = `${baseExpression}${shouldMultiply ? "×" : ""}${token}`
        const nextDisplayExpression = `${baseDisplayExpression}${shouldMultiply ? "×" : ""}${displayToken}`
        setExpression(nextExpression)
        setDisplayExpression(nextDisplayExpression)
        setDisplayValue(options?.displayValue ?? displayToken)
        setEntryMode("input")
        setPreviewMode(false)
      },
      [displayExpression, displayValue, entryMode, expression, previewMode],
    )

    const applyUnaryScientificOperation = useCallback(
      (
        buildExpression: (operand: string) => string,
        buildDisplayExpression: (operand: string) => string,
      ) => {
        const canReplaceOperand =
          !previewMode &&
          entryMode !== "equals" &&
          displayValue !== "Error" &&
          !isTrailingOperator(expression) &&
          !expression.endsWith("(")
        const expressionRange = canReplaceOperand ? findTrailingOperandRange(expression) : null
        const displayRange = canReplaceOperand
          ? findTrailingDisplayOperandRange(displayExpression)
          : null

        const baseOperandExpression =
          expressionRange && displayRange ? expression.slice(expressionRange.start, expressionRange.end) : "0"
        const baseOperandDisplay =
          expressionRange && displayRange
            ? displayExpression.slice(displayRange.start, displayRange.end)
            : "0"
        const wrappedExpression = buildExpression(baseOperandExpression)
        const wrappedDisplayExpression = buildDisplayExpression(baseOperandDisplay)
        const nextDisplayValue = evaluateScientificExpression(wrappedExpression, { angleMode })

        if (expressionRange && displayRange) {
          const nextExpression =
            expression.slice(0, expressionRange.start) +
            wrappedExpression +
            expression.slice(expressionRange.end)
          const nextDisplayExpression =
            displayExpression.slice(0, displayRange.start) +
            wrappedDisplayExpression +
            displayExpression.slice(displayRange.end)
          setFreshState(nextExpression, nextDisplayExpression, nextDisplayValue)
          maybeResetSecondMode()
          return
        }

        if (!previewMode && entryMode !== "equals" && displayValue !== "Error") {
          const baseExpression =
            expression === "" || expression === "0" ? "" : expression
          const baseDisplayExpression =
            displayExpression === "" || displayExpression === "0" ? "" : displayExpression
          if (isTrailingOperator(expression) || expression.endsWith("(") || baseExpression.length > 0) {
            const nextExpression = `${baseExpression}${wrappedExpression}`
            const nextDisplayExpression = `${baseDisplayExpression}${wrappedDisplayExpression}`
            setFreshState(nextExpression, nextDisplayExpression, nextDisplayValue)
            maybeResetSecondMode()
            return
          }
        }

        setFreshState(wrappedExpression, wrappedDisplayExpression, nextDisplayValue)
        maybeResetSecondMode()
      },
      [
        angleMode,
        displayExpression,
        displayValue,
        entryMode,
        expression,
        maybeResetSecondMode,
        previewMode,
        setFreshState,
      ],
    )

    const handleDigit = useCallback(
      (digit: string) => {
        if (previewMode || entryMode === "equals" || displayValue === "Error") {
          setFreshState(digit, digit, digit)
          return
        }

        const currentOperand = getCurrentOperand(expression)
        if (!isEditableOperand(currentOperand)) {
          replaceCurrentOperand(digit, digit)
          return
        }

        if (currentOperand === "0" && !expression.endsWith(".") && !expression.endsWith("E")) {
          replaceCurrentOperand(digit, digit)
          return
        }

        const nextExpression = `${expression}${digit}`
        const nextDisplayExpression = `${displayExpression}${digit}`
        setFreshState(nextExpression, nextDisplayExpression, getCurrentOperand(nextExpression))
      },
      [
        displayExpression,
        displayValue,
        entryMode,
        expression,
        previewMode,
        replaceCurrentOperand,
        setFreshState,
      ],
    )

    const handleDecimal = useCallback(() => {
      if (previewMode || entryMode === "equals" || displayValue === "Error") {
        setFreshState("0.", "0.", "0.")
        return
      }

      const currentOperand = getCurrentOperand(expression)
      if (!isEditableOperand(currentOperand)) {
        replaceCurrentOperand("0.", "0.")
        return
      }

      if (currentOperand.includes(".") && !currentOperand.includes("E")) return
      if (currentOperand.includes("E")) return

      if (isTrailingOperator(expression) || expression.endsWith("(")) {
        const nextExpression = `${expression}0.`
        const nextDisplayExpression = `${displayExpression}0.`
        setFreshState(nextExpression, nextDisplayExpression, "0.")
        return
      }

      const nextExpression = `${expression}.`
      const nextDisplayExpression = `${displayExpression}.`
      setFreshState(nextExpression, nextDisplayExpression, getCurrentOperand(nextExpression))
    }, [
      displayExpression,
      displayValue,
      entryMode,
      expression,
      previewMode,
      replaceCurrentOperand,
      setFreshState,
    ])

    const handleOperator = useCallback(
      (
        operator: "+" | "−" | "×" | "÷" | "^" | "root",
        displayOperator = operator === "root" ? "ʸ√" : operator,
      ) => {
        if (displayValue === "Error") {
          setFreshState("0", "0", "0")
          return
        }

        const currentOperand = previewMode || entryMode === "equals" ? displayValue : getCurrentOperand(expression)
        if (currentOperand.endsWith("E") && (operator === "+" || operator === "−")) {
          const exponentSign = operator === "−" ? "-" : "+"
          const nextExpression = `${expression}${exponentSign}`
          const nextDisplayExpression = `${displayExpression}${exponentSign}`
          setFreshState(nextExpression, nextDisplayExpression, getCurrentOperand(nextExpression))
          return
        }

        const baseExpression = previewMode || entryMode === "equals" ? displayValue : expression
        const baseDisplayExpression =
          previewMode || entryMode === "equals" ? displayValue : displayExpression
        const safeBase = baseExpression === "" ? "0" : baseExpression
        const safeDisplayBase = baseDisplayExpression === "" ? "0" : baseDisplayExpression
        const nextExpression = isTrailingOperator(safeBase)
          ? `${safeBase.slice(0, -getTrailingOperatorLength(safeBase))}${operator}`
          : `${safeBase}${operator}`
        const nextDisplayExpression = isTrailingDisplayOperator(safeDisplayBase)
          ? `${safeDisplayBase.slice(0, -getTrailingDisplayOperatorLength(safeDisplayBase))}${displayOperator}`
          : `${safeDisplayBase}${displayOperator}`

        setExpression(nextExpression)
        setDisplayExpression(nextDisplayExpression)
        setDisplayValue(getCurrentOperand(nextExpression))
        setEntryMode("input")
        setPreviewMode(false)
      },
      [displayExpression, displayValue, entryMode, expression, previewMode, setFreshState],
    )

    const handleParenthesis = useCallback(
      (token: "(" | ")") => {
        if (token === "(") {
          insertAtTail("(", "(", { displayValue: "0", implicitMultiply: true })
          return
        }

        if (previewMode || entryMode === "equals") return
        if (getOpenParenCount(expression) <= 0) return
        if (isTrailingOperator(expression) || expression.endsWith("(")) return

        const nextExpression = `${expression})`
        const nextDisplayExpression = `${displayExpression})`
        setExpression(nextExpression)
        setDisplayExpression(nextDisplayExpression)
        setDisplayValue(getCurrentOperand(nextExpression))
        setEntryMode("input")
        setPreviewMode(false)
      },
      [displayExpression, entryMode, expression, insertAtTail, previewMode],
    )

    const handleClear = useCallback(() => {
      setFreshState("0", "0", "0")
    }, [setFreshState])

    const handleDelete = useCallback(() => {
      if (previewMode || displayValue === "Error" || entryMode === "equals") {
        setFreshState("0", "0", "0")
        return
      }

      if (expression.length <= 1) {
        setFreshState("0", "0", "0")
        return
      }

      const currentOperand = getCurrentOperand(expression)
      const currentDisplayOperand = getCurrentDisplayOperand(displayExpression)
      if (shouldDeleteWholeOperand(currentOperand, currentDisplayOperand)) {
        const expressionRange = findTrailingOperandRange(expression)
        const displayRange = findTrailingDisplayOperandRange(displayExpression)
        if (expressionRange && displayRange) {
          const nextExpression =
            expressionRange.start === 0
              ? "0"
              : `${expression.slice(0, expressionRange.start)}0`
          const nextDisplayExpression =
            displayRange.start === 0
              ? "0"
              : `${displayExpression.slice(0, displayRange.start)}0`
          setFreshState(nextExpression, nextDisplayExpression, "0")
          return
        }
      }

      const nextExpression = expression.slice(0, -1)
      const nextDisplayExpression = displayExpression.slice(0, -1)
      if (nextExpression.length === 0) {
        setFreshState("0", "0", "0")
        return
      }

      const nextDisplay = isTrailingOperator(nextExpression) || nextExpression.endsWith("(")
        ? "0"
        : getCurrentOperand(nextExpression)

      setExpression(nextExpression)
      setDisplayExpression(nextDisplayExpression)
      setDisplayValue(nextDisplay)
      setEntryMode("input")
      setPreviewMode(false)
    }, [displayExpression, displayValue, entryMode, expression, previewMode, setFreshState])

    const handlePercent = useCallback(() => {
      applyUnaryScientificOperation(
        (operand) => `percent(${operand})`,
        (operand) => `${operand}%`,
      )
    }, [applyUnaryScientificOperation])

    const handleToggleSign = useCallback(() => {
      if (displayValue === "Error") {
        setFreshState("0", "0", "0")
        return
      }

      if (previewMode || entryMode === "equals") {
        const toggled = toggleSignExpression(displayValue)
        setFreshState(toggled, toggled, toggled)
        return
      }

      const expressionRange = findTrailingOperandRange(expression)
      const displayRange = findTrailingDisplayOperandRange(displayExpression)
      if (!expressionRange || !displayRange) return
      const operand = expression.slice(expressionRange.start, expressionRange.end)
      const displayOperand = displayExpression.slice(displayRange.start, displayRange.end)
      const toggled = toggleSignExpression(operand)
      const toggledDisplay = toggleSignExpression(displayOperand)
      const nextExpression =
        expression.slice(0, expressionRange.start) + toggled + expression.slice(expressionRange.end)
      const nextDisplayExpression =
        displayExpression.slice(0, displayRange.start) +
        toggledDisplay +
        displayExpression.slice(displayRange.end)

      setExpression(nextExpression)
      setDisplayExpression(nextDisplayExpression)
      setDisplayValue(evaluateScientificExpression(toggled, { angleMode }))
      setEntryMode("input")
      setPreviewMode(false)
    }, [angleMode, displayExpression, displayValue, entryMode, expression, previewMode, setFreshState])

    const handleEquals = useCallback(() => {
      const sourceExpression = previewMode ? DEFAULT_EXPRESSION : expression
      const sourceDisplayExpression = previewMode ? DEFAULT_EXPRESSION : displayExpression
      const result = evaluateScientificExpression(sourceExpression, { angleMode })
      setExpression(sourceExpression)
      setDisplayExpression(sourceDisplayExpression)
      setDisplayValue(result)
      setEntryMode("equals")
      setPreviewMode(false)
    }, [angleMode, displayExpression, expression, previewMode])

    const handleScientificNotation = useCallback(() => {
      if (displayValue === "Error") {
        setFreshState("0", "0", "0")
        return
      }

      const currentOperand = previewMode || entryMode === "equals" ? displayValue : getCurrentOperand(expression)
      const normalized = normalizeOperandToken(currentOperand)
      if (normalized.includes("E")) return
      if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return

      const nextOperand = `${normalized}E`
      if (previewMode || entryMode === "equals") {
        setFreshState(nextOperand, nextOperand, nextOperand)
        return
      }

      replaceCurrentOperand(nextOperand, nextOperand)
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
            replaceCurrentOperand(formatComputedNumber(memoryValue), formatComputedNumber(memoryValue))
            return
          case "2nd":
            setSecondMode((value) => !value)
            return
          case "x²":
            applyUnaryScientificOperation(
              (operand) => `square(${operand})`,
              (operand) => `${operand}²`,
            )
            return
          case "x³":
            applyUnaryScientificOperation(
              (operand) => `cube(${operand})`,
              (operand) => `${operand}³`,
            )
            return
          case "xʸ":
            handleOperator("^", "^")
            return
          case "eˣ":
            if (secondMode) {
              applyUnaryScientificOperation(
                (operand) => `ln(${operand})`,
                (operand) => `ln(${operand})`,
              )
              return
            }
            applyUnaryScientificOperation(
              (operand) => `exp(${operand})`,
              (operand) => `e^${operand}`,
            )
            return
          case "10ˣ":
            if (secondMode) {
              applyUnaryScientificOperation(
                (operand) => `log10(${operand})`,
                (operand) => `log10(${operand})`,
              )
              return
            }
            applyUnaryScientificOperation(
              (operand) => `tenpow(${operand})`,
              (operand) => `10^${operand}`,
            )
            return
          case "1/x":
            applyUnaryScientificOperation(
              (operand) => `inv(${operand})`,
              (operand) => `1/${operand}`,
            )
            return
          case "²√x":
            applyUnaryScientificOperation(
              (operand) => `sqrt(${operand})`,
              (operand) => `²√${operand}`,
            )
            return
          case "³√x":
            applyUnaryScientificOperation(
              (operand) => `cbrt(${operand})`,
              (operand) => `³√${operand}`,
            )
            return
          case "ʸ√x":
            handleOperator("root", "ʸ√")
            return
          case "ln":
            applyUnaryScientificOperation(
              (operand) => `ln(${operand})`,
              (operand) => `ln(${operand})`,
            )
            return
          case "log10":
            applyUnaryScientificOperation(
              (operand) => `log10(${operand})`,
              (operand) => `log10(${operand})`,
            )
            return
          case "x!":
            applyUnaryScientificOperation(
              (operand) => `fact(${operand})`,
              (operand) => `${operand}!`,
            )
            return
          case "sin":
            applyUnaryScientificOperation(
              (operand) => `${secondMode ? "asin" : "sin"}(${operand})`,
              (operand) => `${secondMode ? "asin" : "sin"}(${operand})`,
            )
            return
          case "cos":
            applyUnaryScientificOperation(
              (operand) => `${secondMode ? "acos" : "cos"}(${operand})`,
              (operand) => `${secondMode ? "acos" : "cos"}(${operand})`,
            )
            return
          case "tan":
            applyUnaryScientificOperation(
              (operand) => `${secondMode ? "atan" : "tan"}(${operand})`,
              (operand) => `${secondMode ? "atan" : "tan"}(${operand})`,
            )
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
            applyUnaryScientificOperation(
              (operand) => `${secondMode ? "asinh" : "sinh"}(${operand})`,
              (operand) => `${secondMode ? "asinh" : "sinh"}(${operand})`,
            )
            return
          case "cosh":
            applyUnaryScientificOperation(
              (operand) => `${secondMode ? "acosh" : "cosh"}(${operand})`,
              (operand) => `${secondMode ? "acosh" : "cosh"}(${operand})`,
            )
            return
          case "tanh":
            applyUnaryScientificOperation(
              (operand) => `${secondMode ? "atanh" : "tanh"}(${operand})`,
              (operand) => `${secondMode ? "atanh" : "tanh"}(${operand})`,
            )
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
        applyUnaryScientificOperation,
        insertAtTail,
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

function findTrailingDisplayOperandRange(expression: string): Range | null {
  let end = expression.length
  while (end > 0 && /[²³!%]/.test(expression[end - 1])) {
    end -= 1
  }
  if (end <= 0) return null

  const suffix = expression.slice(0, end)
  const numberMatch = suffix.match(/-?(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d*)?$/)
  if (numberMatch) {
    let start = end - numberMatch[0].length
    if (start >= 2) {
      const prefix = suffix.slice(start - 2, start)
      if (prefix === "²√" || prefix === "³√") start -= 2
    }
    if (start >= 2 && suffix.slice(start - 2, start) === "1/") {
      start -= 2
    }
    return { start, end: expression.length }
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
        if (start >= 2) {
          const prefix = suffix.slice(start - 2, start)
          if (prefix === "²√" || prefix === "³√" || prefix === "1/") {
            start -= 2
          }
        }
        return { start, end: expression.length }
      }
      cursor -= 1
    }
    return null
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

function getCurrentDisplayOperand(expression: string) {
  if (isTrailingDisplayOperator(expression) || expression.endsWith("(")) return "0"
  const range = findTrailingDisplayOperandRange(expression)
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

function isTrailingDisplayOperator(expression: string) {
  return (
    expression.endsWith("+") ||
    expression.endsWith("−") ||
    expression.endsWith("×") ||
    expression.endsWith("÷") ||
    expression.endsWith("^") ||
    expression.endsWith("ʸ√")
  )
}

function getTrailingDisplayOperatorLength(expression: string) {
  return expression.endsWith("ʸ√") ? 2 : 1
}

function isEditableOperand(operand: string) {
  return /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d*)?$/.test(operand)
}

function shouldDeleteWholeOperand(operand: string, displayOperand: string) {
  if (operand !== displayOperand) return true
  return (
    operand.includes("(") ||
    operand.includes("π") ||
    operand === "e" ||
    displayOperand.includes("²") ||
    displayOperand.includes("³") ||
    displayOperand.includes("√")
  )
}

function formatDisplayExpressionParts(expression: string) {
  const parts: { value: string; isOperator: boolean }[] = []
  const functionNames = [
    "asinh",
    "acosh",
    "atanh",
    "asin",
    "acos",
    "atan",
    "sinh",
    "cosh",
    "tanh",
    "log10",
    "sin",
    "cos",
    "tan",
    "ln",
  ]
  let index = 0

  while (index < expression.length) {
    const segment = expression.slice(index)

    if (segment.startsWith("ʸ√") || segment.startsWith("²√") || segment.startsWith("³√")) {
      parts.push({ value: segment.slice(0, 2), isOperator: true })
      index += 2
      continue
    }

    const functionName = functionNames.find((name) => segment.startsWith(name))
    if (functionName) {
      parts.push({ value: functionName, isOperator: true })
      index += functionName.length
      continue
    }

    const numberMatch = segment.match(/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d*)?/)
    if (numberMatch) {
      parts.push({ value: numberMatch[0], isOperator: false })
      index += numberMatch[0].length
      continue
    }

    const char = expression[index]
    if (char === "-" || char === "+") {
      parts.push({ value: char === "-" ? "−" : char, isOperator: true })
      index += 1
      continue
    }

    if ("×÷^/()!%²³".includes(char)) {
      parts.push({ value: char, isOperator: char !== "(" && char !== ")" })
      index += 1
      continue
    }

    if (char === "π" || char === "e") {
      parts.push({ value: char, isOperator: false })
      index += 1
      continue
    }

    parts.push({ value: char, isOperator: false })
    index += 1
  }

  return parts.length > 0 ? parts : formatExpressionParts(expression)
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
