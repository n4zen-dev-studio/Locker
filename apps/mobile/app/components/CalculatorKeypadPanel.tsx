import { FC, PropsWithChildren } from "react";
import { StyleProp, View, ViewStyle } from "react-native";

import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";

type CalculatorKeypadPanelProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

export const CalculatorKeypadPanel: FC<CalculatorKeypadPanelProps> = ({
  children,
  style,
}) => {
  const { themed } = useAppTheme();

  return <View style={[themed($panel), style]}>{children}</View>;
};

const $panel: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: spacing.sm,
  paddingBottom: spacing.sm,
});
