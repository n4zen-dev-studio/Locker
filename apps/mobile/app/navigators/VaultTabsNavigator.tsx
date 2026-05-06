import { useMemo } from "react"
import { Pressable, View, ViewStyle, TextStyle } from "react-native"
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs"
import { createNativeStackNavigator } from "@react-navigation/native-stack"

import { VaultNotesHomeScreen } from "@/screens/VaultNotesHomeScreen"
import { VaultNoteScreen } from "@/screens/VaultNoteScreen"
import { SecurityDashboardScreen } from "@/screens/SecurityDashboardScreen"
import { SettingsHomeScreen } from "@/screens/SettingsHomeScreen"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import type {
  SecurityStackParamList,
  SettingsStackParamList,
  VaultStackParamList,
  VaultTabsParamList,
} from "@/navigators/navigationTypes"
import { Text } from "@/components/Text"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

const Tabs = createBottomTabNavigator<VaultTabsParamList>()
const VaultStack = createNativeStackNavigator<VaultStackParamList>()
const SecurityStack = createNativeStackNavigator<SecurityStackParamList>()
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>()

const VaultStackScreen = () => {
  return (
    <VaultStack.Navigator screenOptions={{ headerShown: false }}>
      <VaultStack.Screen name="VaultHome" component={VaultNotesHomeScreen} />
      <VaultStack.Screen name="VaultNote" component={VaultNoteScreen} />
    </VaultStack.Navigator>
  )
}

const SecurityStackScreen = () => {
  return (
    <SecurityStack.Navigator screenOptions={{ headerShown: false }}>
      <SecurityStack.Screen name="SecurityDashboard" component={SecurityDashboardScreen} />
    </SecurityStack.Navigator>
  )
}

const SettingsStackScreen = () => {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsHomeScreen} />
    </SettingsStack.Navigator>
  )
}

const TabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const { themed } = useAppTheme()
  const $safeBottom = useSafeAreaInsetsStyle(["bottom"])

  const tabs = useMemo(
    () => [
      { key: "Vault", label: "Vault" },
      { key: "Security", label: "Security" },
      { key: "Settings", label: "Settings" },
    ],
    [],
  )

  return (
    <View style={themed([$tabBar, $safeBottom])}>
      {tabs.map((tab, index) => {
        const route = state.routes[index]
        const isFocused = state.index === index
        return (
          <Pressable
            key={tab.key}
            onPress={() => navigation.navigate(route.name)}
            style={themed([$tabButton, isFocused && $tabButtonActive])}
          >
            <View style={themed([$tabDot, isFocused && $tabDotActive])} />
            <View style={themed($tabLabelWrap)}>
              <View style={themed([$tabLabelPill, isFocused && $tabLabelPillActive])}>
                <TabLabel label={tab.label} isFocused={isFocused} />
              </View>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

const TabLabel = ({ label, isFocused }: { label: string; isFocused: boolean }) => {
  const { themed } = useAppTheme()
  return (
    <Text preset="bold" style={themed(isFocused ? $tabLabelTextActive : $tabLabelText)}>
      {label}
    </Text>
  )
}

export const VaultTabsNavigator = () => {
  return (
    <Tabs.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="Vault" component={VaultStackScreen} />
      <Tabs.Screen name="Security" component={SecurityStackScreen} />
      <Tabs.Screen name="Settings" component={SettingsStackScreen} />
    </Tabs.Navigator>
  )
}

const $tabBar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: 18,
  paddingBottom: 18,
  paddingTop: 10,
  backgroundColor: "rgba(10, 14, 24, 0.95)",
  borderTopWidth: 1,
  borderTopColor: colors.glassBorder,
})

const $tabButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 6,
})

const $tabButtonActive: ThemedStyle<ViewStyle> = () => ({
  opacity: 1,
})

const $tabDot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 6,
  height: 6,
  borderRadius: 3,
  backgroundColor: "transparent",
  marginBottom: 6,
  borderWidth: 1,
  borderColor: colors.glassBorder,
})

const $tabDotActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.accentPink,
  borderColor: colors.accentPink,
})

const $tabLabelWrap: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
})

const $tabLabelPill: ThemedStyle<ViewStyle> = ({ colors }) => ({
  paddingHorizontal: 10,
  paddingVertical: 4,
  borderRadius: 999,
  backgroundColor: "rgba(255, 255, 255, 0.03)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.06)",
})

const $tabLabelPillActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255, 110, 199, 0.14)",
  borderColor: "rgba(255, 110, 199, 0.4)",
})

const $tabLabelText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  fontSize: 11,
  letterSpacing: 0.3,
})

const $tabLabelTextActive: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
  fontSize: 11,
  letterSpacing: 0.4,
})
