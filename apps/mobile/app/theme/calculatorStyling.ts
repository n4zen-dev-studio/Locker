import type { ViewStyle } from "react-native";

type SoftShadowConfig = {
  color: string;
  opacity: number;
  radius: number;
  offsetY: number;
  offsetX?: number;
  elevation: number;
};

export function createSoftShadow({
  color,
  opacity,
  radius,
  offsetY,
  offsetX = 0,
  elevation,
}: SoftShadowConfig): ViewStyle {
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: offsetX, height: offsetY },
    elevation,
  };
}

export function createMoldedSurface({
  backgroundColor,
  radius,
}: {
  backgroundColor: string;
  radius: number;
}): ViewStyle {
  return {
    borderRadius: radius,
    backgroundColor,
    overflow: "hidden",
  };
}

export function createPressedInset({
  top,
  bottom,
  left = top,
  right = top,
  radius,
}: {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
  radius?: number;
}): ViewStyle {
  return {
    top,
    bottom,
    left,
    right,
    ...(radius !== undefined ? { borderRadius: radius } : null),
  };
}

export function createCalculatorOuterShell({
  radius,
  backgroundColor,
}: {
  radius: number;
  backgroundColor: string;
}): ViewStyle {
  return {
    borderRadius: radius,
    backgroundColor,
    overflow: "hidden",
  };
}

export function createCalculatorInnerCap({
  inset = 8,
  radius,
  backgroundColor,
}: {
  inset?: number;
  radius: number;
  backgroundColor: string;
}): ViewStyle {
  return {
    position: "absolute",
    top: inset,
    right: inset,
    bottom: inset + 2,
    left: inset,
    borderRadius: radius,
    backgroundColor,
    overflow: "hidden",
  };
}

export function createCalculatorCenterDip({
  inset = 14,
  radius,
  backgroundColor,
  opacity = 0.14,
}: {
  inset?: number;
  radius: number;
  backgroundColor: string;
  opacity?: number;
}): ViewStyle {
  return {
    position: "absolute",
    top: inset,
    right: inset,
    bottom: inset - 1,
    left: inset,
    borderRadius: radius,
    backgroundColor,
    opacity,
  };
}

export function createTopEdgeHighlight({
  color,
  radius,
  height = 12,
  insetX = 8,
  opacity = 0.28,
}: {
  color: string;
  radius: number;
  height?: number;
  insetX?: number;
  opacity?: number;
}): ViewStyle {
  return {
    position: "absolute",
    top: 1,
    left: insetX,
    right: insetX,
    height,
    borderRadius: radius,
    backgroundColor: color,
    opacity,
  };
}

export function createBottomDepth({
  color,
  radius,
  height = 14,
  insetX = 8,
  bottom = 4,
  opacity = 0.1,
}: {
  color: string;
  radius: number;
  height?: number;
  insetX?: number;
  bottom?: number;
  opacity?: number;
}): ViewStyle {
  return {
    position: "absolute",
    left: insetX,
    right: insetX,
    bottom,
    height,
    borderRadius: radius,
    backgroundColor: color,
    opacity,
  };
}

export function createSideEdgeLight({
  color,
  radius,
  width = 8,
  left = 2,
  top = 8,
  bottom = 10,
  opacity = 0.1,
}: {
  color: string;
  radius: number;
  width?: number;
  left?: number;
  top?: number;
  bottom?: number;
  opacity?: number;
}): ViewStyle {
  return {
    position: "absolute",
    left,
    top,
    bottom,
    width,
    borderRadius: radius,
    backgroundColor: color,
    opacity,
  };
}