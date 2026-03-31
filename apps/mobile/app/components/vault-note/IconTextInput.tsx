import {
  TextInput,
  type TextInputProps,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import type { ThemedStyle } from "@/theme/types";

import type { VaultTheme, VaultThemed } from "./types";

type Props = TextInputProps & {
  themed: VaultThemed;
  theme: VaultTheme;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  icon: React.ReactNode;
  inputStyle?: TextStyle;
  containerStyle?: ViewStyle;
};

export function IconTextInput(props: Props) {
  const {
    themed,
    theme,
    icon,
    inputStyle,
    containerStyle,
    multiline,
    ...rest
  } = props;
  return (
    <View style={[themed($glassInput), containerStyle]}>
      <View style={themed($glassInputIconWrap)}>{icon}</View>
      <TextInput
        {...rest}
        multiline={multiline}
        placeholderTextColor={theme.colors.textDim}
        style={[themed($glassInputField), inputStyle]}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

const $glassInput: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 10,
  borderRadius: 16,
  paddingHorizontal: 12,
  paddingVertical: 10,
  backgroundColor: "rgba(9,10,15,0.52)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
});

const $glassInputIconWrap: ThemedStyle<ViewStyle> = () => ({
  paddingTop: 2,
});

const $glassInputField: ThemedStyle<TextStyle> = () => ({
  flex: 1,
  color: "#FFF6FF",
  fontSize: 13,
  paddingVertical: 0,
});
