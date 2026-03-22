import { FC, ReactNode, useMemo, useRef, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  TextStyle,
  UIManager,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { CalculatorKey } from "@/components/CalculatorKey";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { recordSecurityEvent } from "@/locker/security/auditLogRepo";
import { vaultSession } from "@/locker/session";
import {
  matchesDecoyVaultEntryCode,
  matchesRealVaultEntryCode,
} from "@/locker/storage/stealthEntryRepo";
import { getPostUnlockRoute } from "@/navigators/postUnlockRoute";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import {
  createMoldedSurface,
  createSoftShadow,
} from "@/theme/calculatorStyling";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { evaluateExpression } from "@/utils/calc/evaluate";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";
import AuroraButton from "@/components/AuroraButton";
import { BlobGlassButton } from "@/components/BlobGlassButton";

const binaryOperatorSymbols = ["+", "−", "×", "÷", "^"] as const;
const postfixSymbols = ["%", "²"] as const;

type ButtonType = "number" | "operator" | "action" | "equals";

type ButtonConfig = {
  label: string;
  type: ButtonType;
  flex?: number;
};

type HistoryEntry = {
  id: string;
  expression: string;
  result: string;
};

const advancedRows: ButtonConfig[][] = [
  [
    { label: "+/-", type: "action" },
    { label: "√", type: "action" },
    { label: "x²", type: "action" },
    { label: "mod", type: "action" },
    { label: "xʸ", type: "action" },
  ],
];

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
];

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type CalculatorChromeButtonProps = {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const CalculatorChromeButton: FC<CalculatorChromeButtonProps> = ({
  label,
  onPress,
  style,
  textStyle,
}) => {
  const { themed, theme } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        themed($chromeButtonWrap),
        pressed && themed($chromePressed),
        style,
      ]}
    >
      <LinearGradient
        colors={theme.colors.calculator.keyGradients.utility}
        start={{ x: 0.08, y: 0.06 }}
        end={{ x: 0.92, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={themed($chromeShellBloom)} />
      <View pointerEvents="none" style={themed($chromeButtonFace)}>
        <LinearGradient
          colors={theme.colors.calculator.keyFaceGradients.utility}
          start={{ x: 0.1, y: 0.04 }}
          end={{ x: 0.88, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <LinearGradient
        colors={theme.colors.calculator.keyHighlightGradient}
        start={{ x: 0.25, y: 0 }}
        end={{ x: 0.75, y: 1 }}
        style={[StyleSheet.absoluteFillObject, themed($chromeHighlight)]}
      />
      <Text style={[themed($chromeButtonText), textStyle]}>{label}</Text>
    </Pressable>
  );
};

type CalculatorPanelProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  inset?: boolean;
};

const CalculatorPanel: FC<CalculatorPanelProps> = ({
  children,
  style,
  inset,
}) => {
  const { themed, theme } = useAppTheme();

  return (
    <View style={[themed($panelBase), inset && themed($panelInset), style]}>
      <LinearGradient
        colors={
          inset
            ? theme.colors.calculator.surfaceInsetGradient
            : theme.colors.calculator.surfaceGradient
        }
        start={{ x: 0.08, y: 0.04 }}
        end={{ x: 0.92, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={theme.colors.calculator.shellGradient}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[StyleSheet.absoluteFillObject, themed($panelGloss)]}
      />
      <View pointerEvents="none" style={themed($panelBloom)} />
      <View pointerEvents="none" style={themed($panelInnerWash)} />
      <View pointerEvents="none" style={themed($panelOutline)} />
      {children}
    </View>
  );
};

export const CalculatorScreen: FC<AppStackScreenProps<"Calculator">> =
  function CalculatorScreen(props) {
    const { navigation } = props;
    const { themed, theme, toggleTheme } = useAppTheme();
    const $bottomInsets = useSafeAreaInsetsStyle(["bottom"]);

    const [display, setDisplay] = useState("0");
    const [lastAction, setLastAction] = useState<"input" | "equals">("input");
    const [completedExpression, setCompletedExpression] = useState<
      string | null
    >(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [historyExpanded, setHistoryExpanded] = useState(false);
    const [advancedExpanded, setAdvancedExpanded] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);
    const longPressTriggered = useRef(false);

    const expressionText = useMemo(
      () =>
        lastAction === "equals" && completedExpression
          ? "Previous expression"
          : "Current expression",
      [completedExpression, lastAction],
    );

    const resultText = useMemo(() => display, [display]);

    const animateLayout = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    };

    const resetCompletedExpression = () => {
      if (completedExpression !== null) {
        setCompletedExpression(null);
      }
    };

    const handleClear = () => {
      setDisplay("0");
      setLastAction("input");
      resetCompletedExpression();
    };

    const handleBackspace = () => {
      if (display === "Error") {
        setDisplay("0");
        setLastAction("input");
        resetCompletedExpression();
        return;
      }

      if (display.length <= 1) {
        setDisplay("0");
        resetCompletedExpression();
        return;
      }

      if (display.length === 2 && display.startsWith("−")) {
        setDisplay("0");
        resetCompletedExpression();
        return;
      }

      const trailingOperator = getTrailingBinaryOperator(display);
      if (trailingOperator === "mod") {
        setDisplay(display.slice(0, -3) || "0");
        resetCompletedExpression();
        return;
      }

      setDisplay(display.slice(0, -1));
      resetCompletedExpression();
    };

    const handleDigit = (digit: string) => {
      if (display === "Error") {
        setDisplay(digit);
        setLastAction("input");
        resetCompletedExpression();
        return;
      }

      if (lastAction === "equals") {
        setDisplay(digit);
        setLastAction("input");
        resetCompletedExpression();
        return;
      }

      if (display === "0") {
        setDisplay(digit);
        resetCompletedExpression();
        return;
      }

      if (display === "−0") {
        setDisplay(`−${digit}`);
        resetCompletedExpression();
        return;
      }

      if (shouldInsertImplicitMultiplyBeforeNumber(display)) {
        setDisplay(`${display}×${digit}`);
        resetCompletedExpression();
        return;
      }

      setDisplay(`${display}${digit}`);
      resetCompletedExpression();
    };

    const handleDecimal = () => {
      if (display === "Error" || lastAction === "equals") {
        setDisplay("0.");
        setLastAction("input");
        resetCompletedExpression();
        return;
      }

      if (shouldInsertImplicitMultiplyBeforeDecimal(display)) {
        setDisplay(`${display}×0.`);
        resetCompletedExpression();
        return;
      }

      const lastNumberStart = findLastNumberStart(display);
      if (lastNumberStart === null) {
        setDisplay(`${display}0.`);
        resetCompletedExpression();
        return;
      }

      const lastNumber = display.slice(lastNumberStart);
      if (lastNumber.includes(".")) return;

      setDisplay(`${display}.`);
      resetCompletedExpression();
    };

    const handleOperator = (operator: string) => {
      if (display === "Error") {
        if (operator === "−") {
          setDisplay("−");
        } else {
          setDisplay("0");
        }
        setLastAction("input");
        resetCompletedExpression();
        return;
      }

      if (lastAction === "equals") {
        setLastAction("input");
        resetCompletedExpression();
      }

      if (display.length === 0) return;

      if (display === "0" && operator === "−") {
        setDisplay("−");
        resetCompletedExpression();
        return;
      }

      const trailingOperator = getTrailingBinaryOperator(display);
      if (trailingOperator) {
        if (
          operator === "−" &&
          trailingOperator !== "−" &&
          canStartUnary(display)
        ) {
          setDisplay(`${display}${operator}`);
          resetCompletedExpression();
          return;
        }
        setDisplay(`${stripTrailingBinaryOperator(display)}${operator}`);
        resetCompletedExpression();
        return;
      }

      const lastChar = display[display.length - 1];
      if (lastChar === "(" && operator === "−") {
        setDisplay(`${display}${operator}`);
        resetCompletedExpression();
        return;
      }

      if (!canAppendBinaryOperator(display)) return;
      setDisplay(`${display}${operator}`);
      resetCompletedExpression();
    };

    const handleToggleSign = () => {
      if (display === "Error") {
        setDisplay("0");
        resetCompletedExpression();
        return;
      }

      if (lastAction === "equals") {
        setLastAction("input");
        resetCompletedExpression();
      }

      if (display === "0") {
        setDisplay("−0");
        resetCompletedExpression();
        return;
      }

      const lastNumberStart = findLastNumberStart(display);
      if (lastNumberStart === null) {
        if (display.length === 0 || canStartUnary(display)) {
          setDisplay(`${display}−`);
          resetCompletedExpression();
        }
        return;
      }

      const signIndex = lastNumberStart - 1;
      const hasUnaryMinus =
        signIndex >= 0 &&
        display[signIndex] === "−" &&
        (signIndex === 0 || isOperatorChar(display[signIndex - 1]));

      if (hasUnaryMinus) {
        setDisplay(
          display.slice(0, signIndex) + display.slice(lastNumberStart),
        );
      } else {
        setDisplay(
          display.slice(0, lastNumberStart) +
            "−" +
            display.slice(lastNumberStart),
        );
      }
      resetCompletedExpression();
    };

    const handleOpenParenthesis = () => {
      if (display === "Error" || lastAction === "equals") {
        setDisplay("(");
        setLastAction("input");
        resetCompletedExpression();
        return;
      }

      if (display === "0") {
        setDisplay("(");
        resetCompletedExpression();
        return;
      }

      if (shouldInsertImplicitMultiplyBeforeGroup(display)) {
        setDisplay(`${display}×(`);
        resetCompletedExpression();
        return;
      }

      setDisplay(`${display}(`);
      resetCompletedExpression();
    };

    const handleParentheses = () => {
      if (shouldCloseParenthesis(display)) {
        handleCloseParenthesis();
        return;
      }
      handleOpenParenthesis();
    };

    const handleCloseParenthesis = () => {
      if (!canAppendCloseParenthesis(display)) return;
      setDisplay(`${display})`);
      setLastAction("input");
      resetCompletedExpression();
    };

    const handlePercent = () => {
      if (!canAppendPostfix(display)) return;
      if (display.endsWith("%")) return;
      setDisplay(`${display}%`);
      setLastAction("input");
      resetCompletedExpression();
    };

    const handleSquare = () => {
      if (!canAppendPostfix(display)) return;
      if (display.endsWith("²")) return;
      setDisplay(`${display}²`);
      setLastAction("input");
      resetCompletedExpression();
    };

    const handleSquareRoot = () => {
      if (display === "Error" || lastAction === "equals") {
        setDisplay("√(");
        setLastAction("input");
        resetCompletedExpression();
        return;
      }

      if (display === "0") {
        setDisplay("√(");
        resetCompletedExpression();
        return;
      }

      if (shouldInsertImplicitMultiplyBeforeGroup(display)) {
        setDisplay(`${display}×√(`);
        resetCompletedExpression();
        return;
      }

      setDisplay(`${display}√(`);
      resetCompletedExpression();
    };

    const handleModulo = () => {
      handleOperator("mod");
    };

    const handlePower = () => {
      handleOperator("^");
    };

    const handleEquals = () => {
      if (longPressTriggered.current) {
        longPressTriggered.current = false;
        return;
      }

      if (matchesRealVaultEntryCode(display)) {
        if (vaultSession.isUnlocked()) {
          const next = getPostUnlockRoute();
          if (next.name === "VaultOnboarding") {
            navigation.navigate("VaultOnboarding");
          } else {
            navigation.navigate("VaultTabs", next.params);
          }
        } else {
          navigation.navigate("VaultLocked");
        }
        return;
      }

      if (matchesDecoyVaultEntryCode(display)) {
        recordSecurityEvent({
          type: "decoy_vault_open",
          message: "Decoy vault opened from calculator entry code.",
          severity: "info",
        });
        navigation.navigate("VaultTabs", {
          screen: "Security",
          params: { screen: "DecoyVault" },
        });
        return;
      }

      const expression = display;
      const result = evaluateExpression(expression);
      setDisplay(result);
      setLastAction("equals");
      if (result !== "Error") {
        setCompletedExpression(expression);
        setHistory((current) =>
          [
            {
              id: `${Date.now()}-${current.length}`,
              expression,
              result,
            },
            ...current,
          ].slice(0, 24),
        );
      }
    };

    const handleEqualsLongPress = () => {
      longPressTriggered.current = true;
      navigation.navigate("VaultLocked");
    };

    const toggleHistory = () => {
      animateLayout();
      setHistoryExpanded((value) => !value);
      setMenuVisible(false);
    };

    const toggleAdvanced = () => {
      animateLayout();
      setAdvancedExpanded((value) => !value);
    };

    const toggleMenu = () => {
      setMenuVisible((value) => !value);
    };

    const handleClearHistory = () => {
      setHistory([]);
      setMenuVisible(false);
    };

    const handleRestoreHistoryItem = (entry: HistoryEntry) => {
      setDisplay(entry.expression);
      setLastAction("input");
      setCompletedExpression(null);
      animateLayout();
      setHistoryExpanded(false);
    };

    return (
      <Screen
        preset="fixed"
        safeAreaEdges={["top", "bottom"]}
        contentContainerStyle={themed([$screen, $bottomInsets])}
      >
        
        <LinearGradient
          colors={theme.colors.calculator.backgroundGradient}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={theme.colors.calculator.backgroundFieldGradient}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View pointerEvents="none" style={themed($ambientWhiteHaze)} />
        <View pointerEvents="none" style={themed($ambientPinkOrb)} />
        <View pointerEvents="none" style={themed($ambientBlueOrb)} />
        <View pointerEvents="none" style={themed($ambientPurpleOrb)} />
        <View pointerEvents="none" style={themed($ambientBlushOrb)} />

        <View style={themed($shellFrame)}>
          <View style={themed($topBar)}>
            <CalculatorChromeButton
              label={historyExpanded ? "History ▾" : "History ▴"}
              onPress={toggleHistory}
              style={themed($historyTrigger)}
              textStyle={themed($chromeButtonLabelLeft)}
            />
            <CalculatorChromeButton
              label="⋯"
              onPress={toggleMenu}
              style={themed($menuTrigger)}
              textStyle={themed($menuTriggerText)}
            />
          </View>

          <View style={themed($upperSection)}>
            {historyExpanded ? (
              <CalculatorPanel style={themed($historyPanel)}>
                <Text
                  preset="subheading"
                  size="xs"
                  style={themed($historyTitle)}
                >
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
                        style={({ pressed }) => [
                          themed($historyItem),
                          pressed && themed($historyItemPressed),
                        ]}
                      >
                        <Text
                          size="xs"
                          style={themed($historyExpression)}
                          numberOfLines={1}
                        >
                          {entry.expression}
                        </Text>
                        <Text
                          preset="subheading"
                          style={themed($historyResult)}
                          numberOfLines={1}
                        >
                          {entry.result}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </CalculatorPanel>
            ) : null}

            <CalculatorPanel style={themed($displayPanel)}>
              <View style={themed($displayGlow)} pointerEvents="none" />
              <Text
                size="xs"
                style={themed($expressionLabel)}
                numberOfLines={1}
              >
                {expressionText}
              </Text>
              {lastAction === "equals" && completedExpression ? (
                <Text
                  size="sm"
                  style={themed($expressionPreview)}
                  numberOfLines={1}
                >
                  {completedExpression}
                </Text>
              ) : null}
              <Text
                preset="heading"
                style={themed($displayText)}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.45}
              >
                {resultText}
              </Text>
            </CalculatorPanel>
          </View>
{/* <AuroraButton 
          title="Get Started" 
          onPress={() => {}} 
        />

        <BlobGlassButton
          title="Get Started"
          width={340}
          height={120}
          onPress={() => {
            console.log("Pressed")
          }}
        /> */}
          <CalculatorPanel style={themed($keypadPanel)} inset>
            <Pressable
              onPress={toggleAdvanced}
              style={({ pressed }) => [
                themed($advancedToggle),
                pressed && themed($chromePressed),
              ]}
            >
              <LinearGradient
                colors={theme.colors.calculator.surfaceInsetGradient}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Text size="xs" style={themed($advancedToggleText)}>
                {advancedExpanded
                  ? "Advanced functions ▾"
                  : "Advanced functions ▴"}
              </Text>
            </Pressable>

            {advancedExpanded ? (
              <View style={themed($advancedSection)}>
                {advancedRows.map((row, rowIndex) => (
                  <View
                    key={`advanced-row-${rowIndex}`}
                    style={themed($buttonRow)}
                  >
                    {row.map((button) => (
                      <CalculatorKey
                        key={button.label}
                        label={button.label}
                        variant="utility"
                        onPress={() => {
                          switch (button.label) {
                            case "+/-":
                              handleToggleSign();
                              break;
                            case "√":
                              handleSquareRoot();
                              break;
                            case "x²":
                              handleSquare();
                              break;
                            case "mod":
                              handleModulo();
                              break;
                            case "xʸ":
                              handlePower();
                              break;
                          }
                        }}
                      />
                    ))}
                  </View>
                ))}
              </View>
            ) : null}

            <View style={themed($buttonGrid)}>
              {coreRows.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={themed($buttonRow)}>
                  {row.map((button) => {
                    const isEquals = button.label === "=";
                    const onPress = () => {
                      switch (button.label) {
                        case "()":
                          handleParentheses();
                          break;
                        case "AC":
                          handleClear();
                          break;
                        case "⌫":
                          handleBackspace();
                          break;
                        case "+/-":
                          handleToggleSign();
                          break;
                        case "=":
                          handleEquals();
                          break;
                        case ".":
                          handleDecimal();
                          break;
                        case "%":
                          handlePercent();
                          break;
                        default:
                          if (isOperatorButton(button.label)) {
                            handleOperator(button.label);
                          } else {
                            handleDigit(button.label);
                          }
                      }
                    };

                    return (
                      <CalculatorKey
                        key={button.label}
                        label={button.label}
                        variant={getKeyVariant(button.type)}
                        onPress={onPress}
                        onLongPress={
                          isEquals ? handleEqualsLongPress : undefined
                        }
                        delayLongPress={900}
                        style={button.flex ? { flex: button.flex } : undefined}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          </CalculatorPanel>
        </View>

        {menuVisible ? (
          <Pressable
            style={themed($menuBackdrop)}
            onPress={() => setMenuVisible(false)}
          >
            <CalculatorPanel style={themed($menuCard)}>
              <Pressable
                onPress={handleClearHistory}
                style={({ pressed }) => [
                  themed($menuItem),
                  pressed && themed($historyItemPressed),
                ]}
              >
                <Text style={themed($menuItemText)}>Clear history</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  toggleTheme();
                  setMenuVisible(false);
                }}
                style={({ pressed }) => [
                  themed($menuItem),
                  pressed && themed($historyItemPressed),
                ]}
              >
                <Text style={themed($menuItemText)}>Change Theme</Text>
              </Pressable>
            </CalculatorPanel>
          </Pressable>
        ) : null}
      </Screen>
    );
  };

function getKeyVariant(
  type: ButtonType,
): "number" | "operator" | "utility" | "equals" {
  if (type === "action") return "utility";
  return type;
}

function isOperatorChar(value: string) {
  return isBinaryOperatorChar(value);
}

function isBinaryOperatorChar(value: string) {
  return binaryOperatorSymbols.includes(
    value as (typeof binaryOperatorSymbols)[number],
  );
}

function isOperatorButton(value: string) {
  return isBinaryOperatorChar(value) || value === "mod";
}

function findLastNumberStart(value: string): number | null {
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const char = value[i];
    if ((char >= "0" && char <= "9") || char === ".") {
      continue;
    }
    return i === value.length - 1 ? null : i + 1;
  }
  return value.length > 0 ? 0 : null;
}

function shouldInsertImplicitMultiplyBeforeGroup(value: string) {
  if (value.length === 0 || value === "0" || value === "Error") return false;
  const lastChar = value[value.length - 1];
  return (
    isDigitChar(lastChar) ||
    lastChar === ")" ||
    postfixSymbols.includes(lastChar as "²" | "%")
  );
}

function shouldInsertImplicitMultiplyBeforeNumber(value: string) {
  if (value.length === 0 || value === "0" || value === "Error") return false;
  const lastChar = value[value.length - 1];
  return lastChar === ")" || postfixSymbols.includes(lastChar as "²" | "%");
}

function shouldInsertImplicitMultiplyBeforeDecimal(value: string) {
  return shouldInsertImplicitMultiplyBeforeNumber(value);
}

function canAppendBinaryOperator(value: string) {
  if (value.length === 0 || value === "Error") return false;
  const lastChar = value[value.length - 1];
  return (
    isDigitChar(lastChar) ||
    lastChar === "." ||
    lastChar === ")" ||
    postfixSymbols.includes(lastChar as "²" | "%")
  );
}

function canAppendPostfix(value: string) {
  if (value.length === 0 || value === "Error") return false;
  const lastChar = value[value.length - 1];
  return isDigitChar(lastChar) || lastChar === ")" || lastChar === "²";
}

function canAppendCloseParenthesis(value: string) {
  const openCount = (value.match(/\(/g) ?? []).length;
  const closeCount = (value.match(/\)/g) ?? []).length;
  if (openCount <= closeCount) return false;
  const lastChar = value[value.length - 1];
  return (
    isDigitChar(lastChar) ||
    lastChar === ")" ||
    lastChar === "%" ||
    lastChar === "²"
  );
}

function shouldCloseParenthesis(value: string) {
  const openCount = (value.match(/\(/g) ?? []).length;
  const closeCount = (value.match(/\)/g) ?? []).length;
  return openCount > closeCount && canAppendCloseParenthesis(value);
}

function canStartUnary(value: string) {
  const trailingOperator = getTrailingBinaryOperator(value);
  if (trailingOperator) return true;
  const lastChar = value[value.length - 1];
  return lastChar === "(";
}

function isDigitChar(value: string) {
  return value >= "0" && value <= "9";
}

function getTrailingBinaryOperator(value: string) {
  if (value.endsWith("mod")) return "mod";
  const lastChar = value[value.length - 1];
  return isBinaryOperatorChar(lastChar) ? lastChar : null;
}

function stripTrailingBinaryOperator(value: string) {
  if (value.endsWith("mod")) return value.slice(0, -3);
  return value.slice(0, -1);
}

const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  position: "relative",
  overflow: "hidden",
});

const $shellFrame: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  ...createMoldedSurface({
    backgroundColor: colors.transparent,
    radius: 42,
  }),
  flex: 1,
  width: "100%",
  maxWidth: 460,
  alignSelf: "center",
  gap: spacing.md,
  paddingTop: spacing.sm,
  paddingHorizontal: spacing.sm,
  paddingBottom: spacing.sm,
});

const $ambientWhiteHaze: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: -30,
  left: -20,
  right: -20,
  height: 340,
  borderRadius: 999,
  backgroundColor: colors.calculator.ambientWhite,
  opacity: 0.5,
});

const $ambientPinkOrb: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  borderRadius: 999,
  width: 380,
  height: 380,
  top: -60,
  right: -110,
  backgroundColor: colors.calculator.ambientPink,
  opacity: 0.82,
});

const $ambientBlueOrb: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  borderRadius: 999,
  width: 300,
  height: 300,
  bottom: 180,
  left: -120,
  backgroundColor: colors.calculator.ambientBlue,
  opacity: 0.7,
});

const $ambientPurpleOrb: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  borderRadius: 999,
  width: 260,
  height: 260,
  bottom: 0,
  right: -70,
  backgroundColor: colors.calculator.ambientPurple,
  opacity: 0.7,
});

const $ambientBlushOrb: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  borderRadius: 999,
  width: 360,
  height: 360,
  top: 220,
  right: -10,
  backgroundColor: colors.calculator.surfaceGlow,
  opacity: 0.62,
});

const $topBar: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: spacing.sm,
});

const $chromeButtonWrap: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  ...createMoldedSurface({
    backgroundColor: colors.calculator.keyFallback,
    radius: 26,
  }),
  minHeight: 54,
  justifyContent: "center",
  paddingHorizontal: spacing.md,
  ...createSoftShadow({
    color: colors.calculator.keyShadow,
    opacity: 0.1,
    radius: 12,
    offsetY: 6,
    elevation: 3,
  }),
});

const $chromeShellBloom: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: -4,
  left: 8,
  right: 8,
  height: 24,
  borderRadius: 20,
  backgroundColor: colors.calculator.keyBaseGlow,
  opacity: 0.9,
});

const $chromeButtonFace: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  top: 6,
  right: 6,
  bottom: 7,
  left: 6,
  borderRadius: 20,
  overflow: "hidden",
  backgroundColor: colors.calculator.surfaceBloom,
});

const $chromeHighlight: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderRadius: 26,
  opacity: 0.62,
  borderTopWidth: 1,
  borderTopColor: colors.calculator.surfaceHighlight,
});

const $chromePressed: ThemedStyle<ViewStyle> = () => ({
  transform: [{ scale: 0.982 }, { translateY: 1.5 }],
  opacity: 0.96,
});

const $historyTrigger: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
});

const $menuTrigger: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 52,
  paddingHorizontal: spacing.md,
  alignItems: "center",
});

const $chromeButtonText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.calculator.utilityText,
  fontFamily: typography.primary.medium,
  fontSize: 15,
  lineHeight: 18,
  letterSpacing: -0.2,
  textAlign: "center",
});

const $chromeButtonLabelLeft: ThemedStyle<TextStyle> = () => ({
  textAlign: "left",
});

const $menuTriggerText: ThemedStyle<TextStyle> = () => ({
  fontSize: 28,
  lineHeight: 30,
});

const $upperSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "flex-start",
  gap: spacing.md,
});

const $panelBase: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...createMoldedSurface({
    backgroundColor: colors.calculator.keyFallback,
    radius: 38,
  }),
  position: "relative",
  ...createSoftShadow({
    color: colors.calculator.surfaceRoseShadow,
    opacity: 0.18,
    radius: 26,
    offsetY: 16,
    elevation: 6,
  }),
});

const $panelInset: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...createSoftShadow({
    color: colors.calculator.keyShadowPressed,
    opacity: 0.08,
    radius: 14,
    offsetY: 8,
    elevation: 3,
  }),
});

const $panelGloss: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.74,
});

const $panelBloom: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: -18,
  left: 16,
  right: 16,
  height: 58,
  borderRadius: 32,
  backgroundColor: colors.calculator.surfaceBloom,
  opacity: 0.78,
});

const $panelInnerWash: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  top: 10,
  right: 10,
  bottom: 10,
  left: 10,
  borderRadius: 30,
  backgroundColor: colors.calculator.surfaceGlow,
  opacity: 0.18,
});

const $panelOutline: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  borderRadius: 38,
  borderTopWidth: 1,
  borderTopColor: colors.calculator.surfaceHighlight,
  borderLeftWidth: 1,
  borderLeftColor: colors.calculator.surfaceHighlight,
  borderRightWidth: 1,
  borderRightColor: colors.calculator.surfaceEdge,
  borderBottomWidth: 1,
  borderBottomColor: colors.calculator.surfaceEdge,
  opacity: 0.32,
});

const $historyPanel: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  paddingBottom: spacing.sm,
  maxHeight: 240,
});

const $historyTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.calculator.labelText,
  marginBottom: 8,
});

const $historyScroll: ThemedStyle<ViewStyle> = () => ({
  flexGrow: 0,
});

const $historyScrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
});

const $historyItem: ThemedStyle<ViewStyle> = ({ spacing, colors }) => ({
  ...createMoldedSurface({
    backgroundColor: colors.glassHeavy,
    radius: 24,
  }),
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
});

const $historyItemPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.82,
  transform: [{ scale: 0.99 }],
});

const $historyExpression: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.calculator.labelText,
  textAlign: "right",
});

const $historyResult: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  textAlign: "right",
});

const $historyEmptyState: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.lg,
});

const $historyEmptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.calculator.labelText,
  textAlign: "center",
});

const $displayPanel: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 196,
  justifyContent: "flex-end",
  paddingHorizontal: spacing.xl,
  paddingVertical: spacing.xl,
});

const $displayGlow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: -30,
  right: -20,
  width: 300,
  height: 300,
  borderRadius: 999,
  backgroundColor: colors.calculator.displayGlow,
  opacity: 0.48,
});

const $expressionLabel: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.calculator.labelText,
  textAlign: "right",
  fontFamily: typography.primary.medium,
  letterSpacing: 0.6,
  textTransform: "uppercase",
});

const $expressionPreview: ThemedStyle<TextStyle> = ({
  colors,
  spacing,
  typography,
}) => ({
  color: colors.calculator.labelText,
  textAlign: "right",
  marginTop: spacing.xs,
  marginBottom: spacing.sm,
  fontFamily: typography.primary.medium,
});

const $displayText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.calculator.displayValue,
  textAlign: "right",
  fontFamily: typography.primary.light,
  fontSize: 60,
  lineHeight: 66,
  letterSpacing: -2.6,
  textShadowColor: "rgba(255,255,255,0.22)",
  textShadowRadius: 14,
  textShadowOffset: { width: 0, height: 0 },
});

const $keypadPanel: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.md,
  gap: spacing.md,
  marginTop: -4,
});

const $advancedToggle: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  ...createMoldedSurface({
    backgroundColor: colors.calculator.keyFallback,
    radius: 24,
  }),
  alignSelf: "flex-start",
  minHeight: 50,
  paddingHorizontal: spacing.lg,
  justifyContent: "center",
  ...createSoftShadow({
    color: colors.calculator.utilityShadow,
    opacity: 0.1,
    radius: 10,
    offsetY: 5,
    elevation: 3,
  }),
});

const $advancedToggleText: ThemedStyle<TextStyle> = ({
  colors,
  typography,
}) => ({
  color: colors.calculator.utilityText,
  fontFamily: typography.primary.medium,
  fontSize: 14,
  lineHeight: 18,
  letterSpacing: 0.1,
});

const $advancedSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
});

const $buttonGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
});

const $buttonRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
});

const $menuBackdrop: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  backgroundColor: colors.calculator.menuBackdrop,
});

const $menuCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  top: spacing.xl * 2,
  right: spacing.lg,
  minWidth: 180,
  paddingVertical: spacing.xs,
});

const $menuItem: ThemedStyle<ViewStyle> = ({ spacing, colors }) => ({
  ...createMoldedSurface({
    backgroundColor: colors.transparent,
    radius: 22,
  }),
  marginHorizontal: spacing.xs,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
});

const $menuItemText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.calculator.keyText,
  fontFamily: typography.primary.medium,
});
