import { memo, useCallback, useEffect, useRef } from "react"
import { LayoutChangeEvent, Pressable, View, ViewStyle } from "react-native"
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import type { NavigationState, PartialState, Route } from "@react-navigation/native"
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { VaultNotesHomeScreen } from "@/screens/VaultNotesHomeScreen"
import { VaultNoteScreen } from "@/screens/VaultNoteScreen"
import { SecurityDashboardScreen } from "@/screens/SecurityDashboardScreen"
import { SettingsHomeScreen } from "@/screens/SettingsHomeScreen"
import { DecoyVaultScreen } from "@/screens/DecoyVaultScreen"
import type {
  SecurityStackParamList,
  SettingsStackParamList,
  VaultStackParamList,
  VaultTabsParamList,
} from "@/navigators/navigationTypes"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { Home, Settings, Shield } from "lucide-react-native"

const Tabs = createBottomTabNavigator<VaultTabsParamList>()
const VaultStack = createNativeStackNavigator<VaultStackParamList>()
const SecurityStack = createNativeStackNavigator<SecurityStackParamList>()
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>()

const hiddenVaultScreens: Array<keyof VaultStackParamList> = ["VaultNote"]
const hiddenSecurityScreens: Array<keyof SecurityStackParamList> = []
const hiddenSettingsScreens: Array<keyof SettingsStackParamList> = []

const TRANSPARENT_SCREEN_OPTIONS = {
  headerShown: false,
  contentStyle: {
    backgroundColor: "transparent",
  },
} as const

const TAB_ITEMS: Array<{
  key: keyof VaultTabsParamList
  icon: "vault" | "security" | "settings"
}> = [
  { key: "Vault", icon: "vault" },
  { key: "Security", icon: "security" },
  { key: "Settings", icon: "settings" },
]

const INDICATOR_HORIZONTAL_PADDING = 10
const TAB_BAR_HIDE_TRANSLATE_Y = 24

const SPRING_CONFIG = {
  damping: 18,
  stiffness: 220,
  mass: 0.9,
  overshootClamping: false,
} as const

const VaultStackScreen = () => {
  return (
    <VaultStack.Navigator screenOptions={TRANSPARENT_SCREEN_OPTIONS}>
      <VaultStack.Screen name="VaultHome" component={VaultNotesHomeScreen} />
      <VaultStack.Screen name="VaultNote" component={VaultNoteScreen} />
    </VaultStack.Navigator>
  )
}

const SecurityStackScreen = () => {
  return (
    <SecurityStack.Navigator screenOptions={TRANSPARENT_SCREEN_OPTIONS}>
      <SecurityStack.Screen name="SecurityDashboard" component={SecurityDashboardScreen} />
      <SecurityStack.Screen name="DecoyVault" component={DecoyVaultScreen} />
    </SecurityStack.Navigator>
  )
}

const SettingsStackScreen = () => {
  return (
    <SettingsStack.Navigator screenOptions={TRANSPARENT_SCREEN_OPTIONS}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsHomeScreen} />
    </SettingsStack.Navigator>
  )
}

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { themed } = useAppTheme()
  const $safeBottom = useSafeAreaInsetsStyle(["bottom"])

  const containerWidth = useSharedValue(0)
  const indicatorTranslateX = useSharedValue(0)
  const indicatorWidth = useSharedValue(0)
  const visibleProgress = useSharedValue(1)
  const hasMeasured = useRef(false)

  const shouldHide = state.routes.some((route, index) => {
    if (state.index !== index) return false
    return shouldHideTabBar(route)
  })

  const getIndicatorTranslateX = useCallback((width: number, index: number) => {
    const slotWidth = width / TAB_ITEMS.length
    return slotWidth * index + INDICATOR_HORIZONTAL_PADDING
  }, [])

  useEffect(() => {
    cancelAnimation(visibleProgress)
    visibleProgress.value = withTiming(shouldHide ? 0 : 1, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    })
  }, [shouldHide, visibleProgress])

  useEffect(() => {
    if (!hasMeasured.current || containerWidth.value <= 0) return

    cancelAnimation(indicatorTranslateX)
    indicatorTranslateX.value = withSpring(
      getIndicatorTranslateX(containerWidth.value, state.index),
      SPRING_CONFIG,
    )
  }, [getIndicatorTranslateX, indicatorTranslateX, state.index, containerWidth])

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width
      const slotWidth = width / TAB_ITEMS.length

      containerWidth.value = width
      indicatorWidth.value = Math.max(0, slotWidth - INDICATOR_HORIZONTAL_PADDING * 2)
      indicatorTranslateX.value = getIndicatorTranslateX(width, state.index)
      hasMeasured.current = true
    },
    [containerWidth, getIndicatorTranslateX, indicatorTranslateX, indicatorWidth, state.index],
  )

  const animatedWrapperStyle = useAnimatedStyle(() => {
    return {
      opacity: visibleProgress.value,
      transform: [
        {
          translateY: interpolate(visibleProgress.value, [0, 1], [TAB_BAR_HIDE_TRANSLATE_Y, 0]),
        },
        {
          scale: interpolate(visibleProgress.value, [0, 1], [0.985, 1]),
        },
      ],
    }
  })

  const indicatorStyle = useAnimatedStyle(() => {
    return {
      width: indicatorWidth.value,
      transform: [{ translateX: indicatorTranslateX.value }],
    }
  })

  return (
    <View pointerEvents="box-none" style={themed($tabBarPortal)}>
      <Animated.View
        pointerEvents={shouldHide ? "none" : "auto"}
        style={[themed($tabBarAnimatedWrapper), themed($safeBottom), animatedWrapperStyle]}
      >
        <View style={themed($tabBarFrame)}>
          <View onLayout={onLayout} style={themed($tabBarShell)}>
            <Animated.View
              pointerEvents="none"
              style={[themed($activeBubble), indicatorStyle]}
            >
              <View style={themed($activeBubbleCore)} />
            </Animated.View>

            {TAB_ITEMS.map((tab, index) => {
              const route = state.routes[index]
              const isFocused = state.index === index
              const { options } = descriptors[route.key]

              const onPress = () => {
                if (isFocused) return

                if (hasMeasured.current && containerWidth.value > 0) {
                  cancelAnimation(indicatorTranslateX)
                  indicatorTranslateX.value = withSpring(
                    getIndicatorTranslateX(containerWidth.value, index),
                    SPRING_CONFIG,
                  )
                }

                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                })

                if (!event.defaultPrevented) {
                  navigation.navigate(route.name, route.params)
                }
              }

              const onLongPress = () => {
                navigation.emit({
                  type: "tabLongPress",
                  target: route.key,
                })
              }

              return (
                <MemoizedTabBarItem
                  key={tab.key}
                  accessibilityLabel={options.tabBarAccessibilityLabel}
                  icon={tab.icon}
                  isFocused={isFocused}
                  onLongPress={onLongPress}
                  onPress={onPress}
                />
              )
            })}
          </View>
        </View>
      </Animated.View>
    </View>
  )
}

function TabBarItem({
  accessibilityLabel,
  icon,
  isFocused,
  onLongPress,
  onPress,
}: {
  accessibilityLabel?: string
  icon: "vault" | "security" | "settings"
  isFocused: boolean
  onLongPress: () => void
  onPress: () => void
}) {
  const { themed } = useAppTheme()

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected: isFocused }}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [
        themed($tabButton),
        isFocused && themed($tabButtonFocused),
        pressed && themed($tabButtonPressed),
      ]}
    >
      <View style={themed($tabInner)}>
        <MemoizedVaultTabIcon
          color={isFocused ? "#000000" : "#ffffffcd"}
          focused={isFocused}
          icon={icon}
        />
      </View>
    </Pressable>
  )
}

const MemoizedTabBarItem = memo(TabBarItem)

function VaultTabIcon({
  color,
  focused,
  icon,
}: {
  color: string
  focused: boolean
  icon: "vault" | "security" | "settings"
}) {
  if (icon === "vault") {
    return <Home size={20} fill={focused ? color : undefined} fillOpacity={0.2} color={color} />
  }

  if (icon === "security") {
    return <Shield size={20} fill={focused ? color : undefined} color={color} />
  }

  return <Settings size={20} fill={focused ? color : undefined} fillOpacity={0.2} color={color} />
}

const MemoizedVaultTabIcon = memo(VaultTabIcon)

function shouldHideTabBar(
  route: Route<string> & { state?: NavigationState | PartialState<NavigationState> },
) {
  const focused = getDeepFocusedRouteName(route)

  if (!focused) return false

  if (route.name === "Vault") return hiddenVaultScreens.includes(focused as keyof VaultStackParamList)
  if (route.name === "Security") {
    return hiddenSecurityScreens.includes(focused as keyof SecurityStackParamList)
  }
  if (route.name === "Settings") {
    return hiddenSettingsScreens.includes(focused as keyof SettingsStackParamList)
  }
  return false
}

function getDeepFocusedRouteName(
  route: Route<string> & { state?: NavigationState | PartialState<NavigationState> },
): string | undefined {
  const nestedState = route.state
  if (!nestedState || !nestedState.routes.length) return undefined

  const nestedIndex = nestedState.index ?? 0
  const nestedRoute = nestedState.routes[nestedIndex] as Route<string> & {
    state?: NavigationState | PartialState<NavigationState>
  }

  if (nestedRoute.state) {
    return getDeepFocusedRouteName(nestedRoute) ?? nestedRoute.name
  }

  return nestedRoute.name
}

export const VaultTabsNavigator = () => {
  return (
    <Tabs.Navigator
      // detachInactiveScreens={true}
      screenOptions={{
        headerShown: false,
        animation: "none",
        freezeOnBlur: true,
        sceneStyle: {
          backgroundColor: "transparent",
        },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen name="Vault" component={VaultStackScreen} />
      <Tabs.Screen name="Security" component={SecurityStackScreen} />
      <Tabs.Screen name="Settings" component={SettingsStackScreen} />
    </Tabs.Navigator>
  )
}

const $tabBarPortal: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  backgroundColor: "transparent",
  left: 0,
  right: 0,
  bottom: 0,
  alignItems: "center",
})

const $tabBarAnimatedWrapper: ThemedStyle<ViewStyle> = () => ({
  width: "70%",
})

const $tabBarFrame: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.md + 8,
})

const $tabBarShell: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "relative",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: 76,
  paddingHorizontal: 0,
  paddingVertical: spacing.xs,
  borderRadius: 38,
  backgroundColor: "rgba(4, 3, 9, 0.94)",
  borderWidth: 1,
  borderColor: "#a1a15666",
  shadowColor: "#000000",
  shadowOpacity: 0.18,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6,
  overflow: "hidden",
})

const $activeBubble: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  left: 0,
  top: 10,
  bottom: 10,
  zIndex: 0,
})

const $activeBubbleCore: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  borderRadius: 28,
  backgroundColor: "#F2FE0D",
  shadowColor: "#F2FE0D",
  shadowOpacity: 0.16,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
})

const $tabButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 56,
  zIndex: 1,
})

const $tabButtonFocused: ThemedStyle<ViewStyle> = () => ({
  transform: [{ translateY: -1 }],
})

const $tabButtonPressed: ThemedStyle<ViewStyle> = () => ({
  transform: [{ scale: 0.985 }],
})

const $tabInner: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xs - 6,
})