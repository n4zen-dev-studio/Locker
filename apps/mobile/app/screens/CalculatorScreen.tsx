import { FC, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
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
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { AnimatedScreenBackground } from "@/components/AnimatedScreenBackground";
import { CalculatorDisplayCard } from "@/components/CalculatorDisplayCard";
import { CalculatorKey } from "@/components/CalculatorKey";
import { CalculatorKeypadPanel } from "@/components/CalculatorKeypadPanel";
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
        colors={theme.colors.calculator.surfaceInsetGradient}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.88, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={themed($chromeGlow)} />
      <View pointerEvents="none" style={themed($chromeOutline)} />
      <Text style={[themed($chromeButtonText), textStyle]}>{label}</Text>
    </Pressable>
  );
};

type CalculatorPanelProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

const CalculatorPanel: FC<CalculatorPanelProps> = ({ children, style }) => {
  const { themed, theme } = useAppTheme();

  return (
    <View style={[themed($panelBase), style]}>
      <LinearGradient
        colors={theme.colors.calculator.surfaceGradient}
        start={{ x: 0.08, y: 0.02 }}
        end={{ x: 0.92, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={theme.colors.calculator.shellGradient}
        start={{ x: 0.16, y: 0 }}
        end={{ x: 0.84, y: 1 }}
        style={[StyleSheet.absoluteFillObject, themed($panelGloss)]}
      />
      <View pointerEvents="none" style={themed($panelEdge)} />
      <View pointerEvents="none" style={themed($panelLine)} />
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
    const [reducedMotion, setReducedMotion] = useState(false);
    const longPressTriggered = useRef(false);

    const expressionText = useMemo(
      () =>
        lastAction === "equals" && completedExpression
          ? "Previous expression"
          : "Current expression",
      [completedExpression, lastAction],
    );

    const resultText = useMemo(() => display, [display]);

    const shellReveal = useSharedValue(0);
    const headerReveal = useSharedValue(0);
    const displayReveal = useSharedValue(0);
    const keypadReveal = useSharedValue(0);

    useEffect(() => {
      AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
      const subscription = AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        setReducedMotion,
      );

      return () => subscription.remove();
    }, []);

    useEffect(() => {
      const duration = reducedMotion ? 0 : 620;
      const easing = Easing.bezier(0.22, 1, 0.36, 1);

      shellReveal.value = withTiming(1, { duration, easing });
      headerReveal.value = withDelay(
        reducedMotion ? 0 : 90,
        withTiming(1, { duration: reducedMotion ? 0 : 480, easing }),
      );
      displayReveal.value = withDelay(
        reducedMotion ? 0 : 140,
        withTiming(1, { duration: reducedMotion ? 0 : 560, easing }),
      );
      keypadReveal.value = withDelay(
        reducedMotion ? 0 : 200,
        withTiming(1, { duration: reducedMotion ? 0 : 620, easing }),
      );
    }, [
      displayReveal,
      headerReveal,
      keypadReveal,
      reducedMotion,
      shellReveal,
    ]);

    const shellRevealStyle = useAnimatedStyle(() => ({
      opacity: shellReveal.value,
      transform: [
        { translateY: 18 - shellReveal.value * 18 },
        { scale: 0.985 + shellReveal.value * 0.015 },
      ],
    }));

    const headerRevealStyle = useAnimatedStyle(() => ({
      opacity: headerReveal.value,
      transform: [{ translateY: 12 - headerReveal.value * 12 }],
    }));

    const displayRevealStyle = useAnimatedStyle(() => ({
      opacity: displayReveal.value,
      transform: [{ translateY: 18 - displayReveal.value * 18 }],
    }));

    const keypadRevealStyle = useAnimatedStyle(() => ({
      opacity: keypadReveal.value,
      transform: [{ translateY: 22 - keypadReveal.value * 22 }],
    }));

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
        <AnimatedScreenBackground reducedMotion={reducedMotion} />

        <Animated.View style={[themed($shellFrame), shellRevealStyle]}>
          <Animated.View style={[themed($topBar), headerRevealStyle]}>
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
          </Animated.View>

          <View style={themed($upperSection)}>
            {historyExpanded ? (
              <Animated.View
                entering={
                  reducedMotion
                    ? undefined
                    : FadeInUp.duration(320).easing(
                        Easing.bezier(0.22, 1, 0.36, 1),
                      )
                }
                layout={LinearTransition}
              >
                <CalculatorPanel style={themed($historyPanel)}>
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
              </Animated.View>
            ) : null}

            <Animated.View style={displayRevealStyle}>
              <CalculatorDisplayCard
                expressionLabel={expressionText}
                completedExpression={
                  lastAction === "equals" ? completedExpression : null
                }
                resultText={resultText}
              />
            </Animated.View>
          </View>

          <Animated.View style={keypadRevealStyle}>
            <CalculatorKeypadPanel style={themed($keypadPanel)}>
              <Pressable
                onPress={toggleAdvanced}
                style={({ pressed }) => [
                  themed($advancedToggle),
                  pressed && themed($chromePressed),
                ]}
              >
                <LinearGradient
                  colors={theme.colors.calculator.surfaceGradient}
                  start={{ x: 0.06, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <View pointerEvents="none" style={themed($advancedToggleGlow)} />
                <Text size="xs" style={themed($advancedToggleText)}>
                  {advancedExpanded
                    ? "Advanced functions ▾"
                    : "Advanced functions ▴"}
                </Text>
              </Pressable>

              {advancedExpanded ? (
                <Animated.View
                  entering={
                    reducedMotion
                      ? undefined
                      : FadeIn.duration(240).easing(
                          Easing.bezier(0.22, 1, 0.36, 1),
                        )
                  }
                  layout={LinearTransition}
                  style={themed($advancedSection)}
                >
                  {advancedRows.map((row, rowIndex) => (
                    <Animated.View
                      key={`advanced-row-${rowIndex}`}
                      entering={
                        reducedMotion
                          ? undefined
                          : FadeInUp.delay(120 + rowIndex * 55)
                              .duration(360)
                              .easing(Easing.bezier(0.22, 1, 0.36, 1))
                      }
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
                    </Animated.View>
                  ))}
                </Animated.View>
              ) : null}

              <View style={themed($buttonGrid)}>
                {coreRows.map((row, rowIndex) => (
                  <Animated.View
                    key={`row-${rowIndex}`}
                    entering={
                      reducedMotion
                        ? undefined
                        : FadeInUp.delay(180 + rowIndex * 55)
                            .duration(420)
                            .easing(Easing.bezier(0.22, 1, 0.36, 1))
                    }
                    style={themed($buttonRow)}
                  >
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
                          onLongPress={isEquals ? handleEqualsLongPress : undefined}
                          delayLongPress={900}
                          style={button.flex ? { flex: button.flex } : undefined}
                        />
                      );
                    })}
                  </Animated.View>
                ))}
              </View>
            </CalculatorKeypadPanel>
          </Animated.View>
        </Animated.View>

        {menuVisible ? (
          <Pressable
            style={themed($menuBackdrop)}
            onPress={() => setMenuVisible(false)}
          >
            <Animated.View
              entering={
                reducedMotion
                  ? undefined
                  : FadeInUp.duration(220).easing(
                      Easing.bezier(0.22, 1, 0.36, 1),
                    )
              }
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
            </Animated.View>
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

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.sm,
  backgroundColor: colors.calculator.backgroundBase,
  position: "relative",
  overflow: "hidden",
});

const $shellFrame: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  width: "100%",
  maxWidth: 460,
  alignSelf: "center",
  gap: spacing.lg,
  paddingBottom: spacing.xs,
});

const $topBar: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: spacing.sm,
});

const $chromeButtonWrap: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  ...createMoldedSurface({
    backgroundColor: colors.calculator.surfaceElevated,
    radius: 24,
  }),
  minHeight: 52,
  justifyContent: "center",
  paddingHorizontal: spacing.md,
  borderWidth: 1,
  borderColor: colors.calculator.borderSubtle,
  ...createSoftShadow({
    color: colors.calculator.shadowLg,
    opacity: 0.24,
    radius: 14,
    offsetY: 8,
    elevation: 5,
  }),
});

const $chromeGlow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  left: 14,
  right: 14,
  bottom: -14,
  height: 42,
  borderRadius: 999,
  backgroundColor: colors.calculator.accentGlow,
  opacity: 0.12,
});

const $chromeOutline: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  borderRadius: 24,
  borderWidth: 1,
  borderColor: colors.calculator.borderSubtle,
});

const $chromePressed: ThemedStyle<ViewStyle> = () => ({
  transform: [{ scale: 0.984 }, { translateY: 1.5 }],
  opacity: 0.96,
});

const $historyTrigger: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
});

const $menuTrigger: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 56,
  paddingHorizontal: spacing.md,
  alignItems: "center",
});

const $chromeButtonText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.calculator.textSecondary,
  fontFamily: typography.primary.medium,
  fontSize: 15,
  lineHeight: 18,
  letterSpacing: -0.2,
  textAlign: "center",
});

const $chromeButtonLabelLeft: ThemedStyle<TextStyle> = () => ({
  textAlign: "left",
});

const $menuTriggerText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.calculator.accentPinkSoft,
  fontSize: 28,
  lineHeight: 30,
});

const $upperSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "flex-end",
  gap: spacing.md,
});

const $panelBase: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...createMoldedSurface({
    backgroundColor: colors.calculator.surface,
    radius: 28,
  }),
  borderWidth: 1,
  borderColor: colors.calculator.borderSubtle,
  ...createSoftShadow({
    color: colors.calculator.shadowLg,
    opacity: 0.34,
    radius: 24,
    offsetY: 14,
    elevation: 8,
  }),
});

const $panelGloss: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.64,
});

const $panelEdge: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  borderRadius: 28,
  borderTopWidth: 1,
  borderLeftWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderTopColor: colors.calculator.surfaceHighlight,
  borderLeftColor: colors.calculator.surfaceHighlight,
  borderRightColor: colors.calculator.borderStrong,
  borderBottomColor: colors.calculator.borderStrong,
  opacity: 0.14,
});

const $panelLine: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 0,
  left: 18,
  right: 18,
  height: 1,
  backgroundColor: colors.calculator.accentPinkSoft,
  opacity: 0.42,
});

const $historyPanel: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  paddingBottom: spacing.sm,
  maxHeight: 220,
});

const $historyTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.calculator.textSecondary,
  marginBottom: 8,
});

const $historyScroll: ThemedStyle<ViewStyle> = () => ({
  flexGrow: 0,
});

const $historyScrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
});

const $historyItem: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  ...createMoldedSurface({
    backgroundColor: colors.calculator.surfaceElevated,
    radius: 22,
  }),
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderWidth: 1,
  borderColor: colors.calculator.borderSubtle,
});

const $historyItemPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.86,
  transform: [{ scale: 0.99 }],
});

const $historyExpression: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.calculator.textMuted,
  textAlign: "right",
});

const $historyResult: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.calculator.textPrimary,
  textAlign: "right",
});

const $historyEmptyState: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.lg,
});

const $historyEmptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.calculator.textMuted,
  textAlign: "center",
});

const $keypadPanel: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
});

const $advancedToggle: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  ...createMoldedSurface({
    backgroundColor: colors.calculator.surface,
    radius: 22,
  }),
  alignSelf: "flex-start",
  minHeight: 48,
  paddingHorizontal: spacing.lg,
  justifyContent: "center",
  borderWidth: 1,
  borderColor: colors.calculator.borderSubtle,
});

const $advancedToggleGlow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  left: 12,
  right: 12,
  bottom: -10,
  height: 28,
  borderRadius: 999,
  backgroundColor: colors.calculator.accentGlow,
  opacity: 0.12,
});

const $advancedToggleText: ThemedStyle<TextStyle> = ({
  colors,
  typography,
}) => ({
  color: colors.calculator.textSecondary,
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
  justifyContent: "flex-start",
});

const $menuCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  top: spacing.xl * 2,
  right: spacing.lg,
  minWidth: 180,
  paddingVertical: spacing.xs,
});

const $menuItem: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  ...createMoldedSurface({
    backgroundColor: colors.transparent,
    radius: 20,
  }),
  marginHorizontal: spacing.xs,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
});

const $menuItemText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.calculator.textPrimary,
  fontFamily: typography.primary.medium,
});
