import { LayoutChangeEvent, Pressable, TextStyle, View, ViewStyle } from "react-native";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NavigationState, PartialState, Route } from "@react-navigation/native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { Text } from "@/components/Text";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { VaultNotesHomeScreen } from "@/screens/VaultNotesHomeScreen";
import { VaultNoteScreen } from "@/screens/VaultNoteScreen";
import { SecurityDashboardScreen } from "@/screens/SecurityDashboardScreen";
import { SettingsHomeScreen } from "@/screens/SettingsHomeScreen";
import { DecoyVaultScreen } from "@/screens/DecoyVaultScreen";
import type {
  SecurityStackParamList,
  SettingsStackParamList,
  VaultStackParamList,
  VaultTabsParamList,
} from "@/navigators/navigationTypes";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";

const Tabs = createBottomTabNavigator<VaultTabsParamList>();
const VaultStack = createNativeStackNavigator<VaultStackParamList>();
const SecurityStack = createNativeStackNavigator<SecurityStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

const hiddenVaultScreens: Array<keyof VaultStackParamList> = ["VaultNote"];
const hiddenSecurityScreens: Array<keyof SecurityStackParamList> = [];
const hiddenSettingsScreens: Array<keyof SettingsStackParamList> = [];

const VaultStackScreen = () => {
  return (
    <VaultStack.Navigator screenOptions={{ headerShown: false }}>
      <VaultStack.Screen name="VaultHome" component={VaultNotesHomeScreen} />
      <VaultStack.Screen name="VaultNote" component={VaultNoteScreen} />
    </VaultStack.Navigator>
  );
};

const SecurityStackScreen = () => {
  return (
    <SecurityStack.Navigator screenOptions={{ headerShown: false }}>
      <SecurityStack.Screen name="SecurityDashboard" component={SecurityDashboardScreen} />
      <SecurityStack.Screen name="DecoyVault" component={DecoyVaultScreen} />
    </SecurityStack.Navigator>
  );
};

const SettingsStackScreen = () => {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsHomeScreen} />
    </SettingsStack.Navigator>
  );
};

const TAB_ITEMS: Array<{
  key: keyof VaultTabsParamList;
  label: string;
  icon: "vault" | "security" | "settings";
}> = [
  { key: "Vault", label: "Vault", icon: "vault" },
  { key: "Security", label: "Security", icon: "security" },
  { key: "Settings", label: "Settings", icon: "settings" },
];

const ACTIVE_TAB_WIDTH = 90;

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { themed, theme } = useAppTheme();
  const $safeBottom = useSafeAreaInsetsStyle(["bottom"]);
  const containerWidth = useSharedValue(0);
  const visibleProgress = useSharedValue(1);
  const activeIndexSv = useSharedValue(state.index);

  const shouldHide = state.routes.some((route, index) => {
    if (state.index !== index) return false;
    return shouldHideTabBar(route);
  });

visibleProgress.value = withTiming(shouldHide ? 0 : 1, {
  duration: shouldHide ? 420 : 280,
  easing: Easing.bezier(0.22, 1, 0.36, 1),
})

activeIndexSv.value = withTiming(state.index, {
  duration: 720,
  easing: Easing.bezier(0.2, 0.9, 0.2, 1),
})

  const onLayout = (event: LayoutChangeEvent) => {
    containerWidth.value = event.nativeEvent.layout.width;
  };

  const containerStyle = useAnimatedStyle(() => ({
    opacity: visibleProgress.value,
    transform: [
      {
        translateY: interpolate(visibleProgress.value, [0, 1], [34, 0]),
      },
      {
        scale: interpolate(visibleProgress.value, [0, 1], [0.96, 1]),
      },
    ],
  }));

const indicatorStyle = useAnimatedStyle(() => {
  const slotWidth =
    containerWidth.value > 0 ? containerWidth.value / TAB_ITEMS.length : ACTIVE_TAB_WIDTH
  const offset = (slotWidth - ACTIVE_TAB_WIDTH) / 2

  const translateX = activeIndexSv.value * slotWidth + offset

  return {
    transform: [
      { translateX },
      {
        scaleX: interpolate(
          Math.abs(activeIndexSv.value - Math.round(activeIndexSv.value)),
          [0, 0.5],
          [1, 1.06],
        ),
      },
      {
        scaleY: interpolate(
          Math.abs(activeIndexSv.value - Math.round(activeIndexSv.value)),
          [0, 0.5],
          [1, 0.96],
        ),
      },
    ],
  }
})

  return (
    <View pointerEvents="box-none" style={themed($tabBarPortal)}>
      <Animated.View
        pointerEvents={shouldHide ? "none" : "auto"}
        style={[themed($tabBarFrame), themed($safeBottom), containerStyle]}
      >
        <View onLayout={onLayout} style={themed($tabBarShell)}>
          <Animated.View style={[themed($activeBubble), indicatorStyle]}>
            <View style={themed($activeBubbleCore)} />
          </Animated.View>

          {TAB_ITEMS.map((tab, index) => {
            const route = state.routes[index];
            const isFocused = state.index === index;
            const { options } = descriptors[route.key];

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: "tabLongPress",
                target: route.key,
              });
            };

            return (
              <TabBarItem
                key={tab.key}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                icon={tab.icon}
                isFocused={isFocused}
                label={tab.label}
                onLongPress={onLongPress}
                onPress={onPress}
              />
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

function TabBarItem({
  accessibilityLabel,
  icon,
  isFocused,
  label,
  onLongPress,
  onPress,
}: {
  accessibilityLabel?: string;
  icon: "vault" | "security" | "settings";
  isFocused: boolean;
  label: string;
  onLongPress: () => void;
  onPress: () => void;
}) {
  const { themed, theme } = useAppTheme();

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
        <VaultTabIcon
          color={
            isFocused ? '#000' : '#ffffffcd'
          }
          focused={isFocused}
          icon={icon}
        />
        {/* <Text style={themed(isFocused ? $tabLabelActive : $tabLabel)}>{label}</Text> */}
      </View>
    </Pressable>
  );
}

function VaultTabIcon({
  color,
  focused,
  icon,
}: {
  color: string;
  focused: boolean;
  icon: "vault" | "security" | "settings";
}) {
  if (icon === "vault") {
    return (
      <Svg width={25} height={25} viewBox="0 0 22 22" fill="none">
        <Path
          d="M5.5 9.4c0-2.3 1.6-4.2 3.8-4.8l1.7-.5 1.7.5c2.2.6 3.8 2.5 3.8 4.8v5.1c0 1.4-1.1 2.5-2.5 2.5H8c-1.4 0-2.5-1.1-2.5-2.5V9.4Z"
          stroke={color}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        <Circle cx="11" cy="13.4" r="1.75" stroke={color} strokeWidth={1.8} />
      </Svg>
    );
  }

  if (icon === "security") {
    return (
      <Svg width={25} height={25} viewBox="0 0 22 22" fill="none">
        <Circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth={1.8} strokeDasharray="1.8 3.2" />
        <Path d="M11 6.3V11l3 1.9" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx="11" cy="11" r="1.7" fill={color} />
      </Svg>
    );
  }

  return (
    <Svg width={25} height={25} viewBox="0 0 22 22" fill="none">
      <Circle cx="11" cy="11" r="3.2" stroke={color} strokeWidth={1.8} />
      <Path
        d="M11 2.8v2.4M11 16.8v2.4M19.2 11h-2.4M5.2 11H2.8M16.8 5.2l-1.7 1.7M6.9 15.1l-1.7 1.7M16.8 16.8l-1.7-1.7M6.9 6.9 5.2 5.2"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      {focused ? <Circle cx="11" cy="11" r="8.8" stroke={color} strokeOpacity={0.18} /> : null}
    </Svg>
  );
}

function shouldHideTabBar(route: Route<string> & { state?: NavigationState | PartialState<NavigationState> }) {
  const focused = getDeepFocusedRouteName(route);

  if (!focused) return false;

  if (route.name === "Vault") return hiddenVaultScreens.includes(focused as keyof VaultStackParamList);
  if (route.name === "Security") return hiddenSecurityScreens.includes(focused as keyof SecurityStackParamList);
  if (route.name === "Settings") return hiddenSettingsScreens.includes(focused as keyof SettingsStackParamList);
  return false;
}

function getDeepFocusedRouteName(
  route: Route<string> & { state?: NavigationState | PartialState<NavigationState> },
): string | undefined {
  const nestedState = route.state;
  if (!nestedState || !nestedState.routes.length) return undefined;

  const nestedIndex = nestedState.index ?? 0;
  const nestedRoute = nestedState.routes[nestedIndex] as Route<string> & {
    state?: NavigationState | PartialState<NavigationState>;
  };

  if (nestedRoute.state) {
    return getDeepFocusedRouteName(nestedRoute) ?? nestedRoute.name;
  }

  return nestedRoute.name;
}

export const VaultTabsNavigator = () => {
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false, 
        sceneStyle: {
          backgroundColor: "transparent",
        },
    }} tabBar={(props) => <FloatingTabBar {...props} />}>
      <Tabs.Screen name="Vault" component={VaultStackScreen} />
      <Tabs.Screen name="Security" component={SecurityStackScreen} />
      <Tabs.Screen name="Settings" component={SettingsStackScreen} />
    </Tabs.Navigator>
  );
};

const $tabBarPortal: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  backgroundColor: 'transparent',
  left: 0,
  right: 0,
  bottom: 0,
  alignItems: "center",
});

const $tabBarFrame: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "70%",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.md + 8,
});

const $tabBarShell: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  position: "relative",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: 76,
  paddingHorizontal: 0,
  paddingVertical: spacing.xs,
  borderRadius: 38,
  backgroundColor: "rgba(4, 3, 9, 0.92)",
  borderWidth: 1,
  borderColor: '#a1a15679',
  shadowColor: "rgba(0, 0, 0, 0.85)",
  shadowOpacity: 0.42,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 18 },
  elevation: 16,
  overflow: "hidden",
});

const $activeBubble: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  left: 0,
  top: 10,
  width: ACTIVE_TAB_WIDTH,
  height: 56,
  paddingHorizontal: spacing.sm,
  zIndex: 0,
});

const $activeBubbleCore: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  borderRadius: 28,
  backgroundColor: '#F2FE0D',
  shadowColor: colors.vaultHub.vaultHubGlow,
  shadowOpacity: 0.48,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 12,
});

const $tabButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 56,
  zIndex: 1,
});

const $tabButtonFocused: ThemedStyle<ViewStyle> = () => ({
  transform: [{ translateY: -1 }],
});

const $tabButtonPressed: ThemedStyle<ViewStyle> = () => ({
  transform: [{ scale: 0.985 }],
});

const $tabInner: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xs -6,
});

const $tabLabel: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: '#ffffffcd',
  fontFamily: typography.primary.medium,
  fontSize: 11,
  letterSpacing: 0.35,
});

const $tabLabelActive: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: '#000',
  fontFamily: typography.primary.medium,
  fontSize: 11,
  letterSpacing: 0.4,
});
