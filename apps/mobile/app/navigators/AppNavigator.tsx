/**
 * The app navigator (formerly "AppNavigator" and "MainNavigator") is used for the primary
 * navigation flows of your app.
 * Generally speaking, it will contain an auth flow (registration, login, forgot password)
 * and a "main" flow which the user will use once logged in.
 */
import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"

import Config from "@/config"
import { ErrorBoundary } from "@/screens/ErrorScreen/ErrorBoundary"
import { CalculatorScreen } from "@/screens/CalculatorScreen"
import { VaultTabsNavigator } from "@/navigators/VaultTabsNavigator"
import { VaultLockedScreen } from "@/screens/VaultLockedScreen"
import { VaultOnboardingScreen } from "@/screens/VaultOnboardingScreen"
import { VaultPasskeySetupScreen } from "@/screens/VaultPasskeySetupScreen"
import { VaultPinScreen } from "@/screens/VaultPinScreen"
import { CalculatorEntryCodesScreen } from "@/screens/CalculatorEntryCodesScreen"
import { VaultLinkDeviceScreen } from "@/screens/VaultLinkDeviceScreen"
import { RemoteVaultScreen } from "@/screens/RemoteVaultScreen"
import { VaultPairDeviceScreen } from "@/screens/VaultPairDeviceScreen"
import { VaultImportPairingScreen } from "@/screens/VaultImportPairingScreen"
import { ServerUrlScreen } from "@/screens/ServerUrlScreen"
import { VaultDiagnosticsScreen } from "@/screens/VaultDiagnosticsScreen"
import { ThreatModelScreen } from "@/screens/ThreatModelScreen"
import { useAppTheme } from "@/theme/context"

import type { AppStackParamList, NavigationProps } from "./navigationTypes"
import { navigationRef, useBackButtonHandler } from "./navigationUtilities"
import { GestureHandlerRootView } from "react-native-gesture-handler"

/**
 * This is a list of all the route names that will exit the app if the back button
 * is pressed while in that screen. Only affects Android.
 */
const exitRoutes = Config.exitRoutes

// Documentation: https://reactnavigation.org/docs/stack-navigator/
const Stack = createNativeStackNavigator<AppStackParamList>()

const AppStack = () => {
  const {
    theme: { colors },
  } = useAppTheme()

  return (
    <Stack.Navigator
      initialRouteName="Calculator"
      screenOptions={{
        headerShown: false,
        // navigationBarColor: "transparent",
        contentStyle: {
          backgroundColor: "transparent",
        },
      }}
    >
      <Stack.Screen name="Calculator" component={CalculatorScreen} />
      <Stack.Screen name="VaultLocked" component={VaultLockedScreen} />
      <Stack.Screen name="VaultPin" component={VaultPinScreen} />
      <Stack.Screen name="VaultPasskeySetup" component={VaultPasskeySetupScreen} />
      <Stack.Screen name="VaultOnboarding" component={VaultOnboardingScreen} />
      <Stack.Screen name="VaultTabs" component={VaultTabsNavigator} />
      <Stack.Screen name="CalculatorEntryCodes" component={CalculatorEntryCodesScreen} />
      <Stack.Screen name="VaultLinkDevice" component={VaultLinkDeviceScreen} />
      <Stack.Screen name="RemoteVault" component={RemoteVaultScreen} />
      <Stack.Screen name="VaultPairDevice" component={VaultPairDeviceScreen} />
      <Stack.Screen name="VaultImportPairing" component={VaultImportPairingScreen} />
      <Stack.Screen name="VaultDiagnostics" component={VaultDiagnosticsScreen} />
      <Stack.Screen name="ThreatModel" component={ThreatModelScreen} />
      <Stack.Screen name="ServerUrl" component={ServerUrlScreen} />
      {/** 🔥 Your screens go here */}
      {/* IGNITE_GENERATOR_ANCHOR_APP_STACK_SCREENS */}
    </Stack.Navigator>
  )
}

export const AppNavigator = (props: NavigationProps) => {
  const { navigationTheme } = useAppTheme()

  useBackButtonHandler((routeName) => exitRoutes.includes(routeName))

  return (
      // <GestureHandlerRootView style={{ flex: 1 }}>
    <NavigationContainer ref={navigationRef} theme={navigationTheme} {...props}>
      <ErrorBoundary catchErrors={Config.catchErrors}>
        <AppStack />
      </ErrorBoundary>
    </NavigationContainer>
      // </GestureHandlerRootView>
  )
}
