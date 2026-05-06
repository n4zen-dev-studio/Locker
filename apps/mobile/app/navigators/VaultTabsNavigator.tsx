import { useCallback, useMemo } from "react"
import { Pressable, View, ViewStyle, TextStyle } from "react-native"
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs"
import { createNativeStackNavigator } from "@react-navigation/native-stack"

import { VaultNotesHomeScreen } from "@/screens/VaultNotesHomeScreen"
import { VaultNoteScreen } from "@/screens/VaultNoteScreen"
import { SyncDashboardScreen } from "@/screens/SyncDashboardScreen"
import { CollabDashboardScreen } from "@/screens/CollabDashboardScreen"
import { SecurityDashboardScreen } from "@/screens/SecurityDashboardScreen"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import type {
  CollabStackParamList,
  SecurityStackParamList,
  SyncStackParamList,
  VaultStackParamList,
  VaultTabsParamList,
} from "@/navigators/navigationTypes"
import { GlowFab } from "@/components/GlowFab"
import { Text } from "@/components/Text"
import { navigate } from "@/navigators/navigationUtilities"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

const Tabs = createBottomTabNavigator<VaultTabsParamList>()
const VaultStack = createNativeStackNavigator<VaultStackParamList>()
const SyncStack = createNativeStackNavigator<SyncStackParamList>()
const CollabStack = createNativeStackNavigator<CollabStackParamList>()
const SecurityStack = createNativeStackNavigator<SecurityStackParamList>()

const VaultStackScreen = () => {
  return (
    <VaultStack.Navigator screenOptions={{ headerShown: false }}>
      <VaultStack.Screen name="VaultHome" component={VaultNotesHomeScreen} />
      <VaultStack.Screen name="VaultNote" component={VaultNoteScreen} />
    </VaultStack.Navigator>
  )
}

const SyncStackScreen = () => {
  return (
    <SyncStack.Navigator screenOptions={{ headerShown: false }}>
      <SyncStack.Screen name="SyncDashboard" component={SyncDashboardScreen} />
    </SyncStack.Navigator>
  )
}

const CollabStackScreen = () => {
  return (
    <CollabStack.Navigator screenOptions={{ headerShown: false }}>
      <CollabStack.Screen name="CollabDashboard" component={CollabDashboardScreen} />
    </CollabStack.Navigator>
  )
}

const SecurityStackScreen = () => {
  return (
    <SecurityStack.Navigator screenOptions={{ headerShown: false }}>
      <SecurityStack.Screen name="SecurityDashboard" component={SecurityDashboardScreen} />
    </SecurityStack.Navigator>
  )
}

const TabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const { themed } = useAppTheme()
  const $safeBottom = useSafeAreaInsetsStyle(["bottom"])
  const handleFabPress = useCallback(() => {
    navigate("VaultTabs", { screen: "Vault", params: { screen: "VaultNote", params: {} } })
  }, [])
  const handleFabLongPress = useCallback(() => {
    navigate("VaultFabVaultPicker")
  }, [])

  const tabs = useMemo(
    () => [
      { key: "Vault", label: "Vault" },
      { key: "Sync", label: "Sync" },
      { key: "Collab", label: "Collab" },
      { key: "Security", label: "Security" },
    ],
    [],
  )

  return (
    <View style={themed([$tabBar, $safeBottom])}>
      {tabs.slice(0, 2).map((tab, index) => {
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

      <View style={themed($fabSlot)}>
        <GlowFab onPress={handleFabPress} onLongPress={handleFabLongPress} />
      </View>

      {tabs.slice(2).map((tab, offset) => {
        const routeIndex = offset + 2
        const route = state.routes[routeIndex]
        const isFocused = state.index === routeIndex
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
      <Tabs.Screen name="Sync" component={SyncStackScreen} />
      <Tabs.Screen name="Collab" component={CollabStackScreen} />
      <Tabs.Screen name="Security" component={SecurityStackScreen} />
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

const $fabSlot: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
  marginTop: -26,
  marginHorizontal: 12,
})
