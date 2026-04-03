/**
 * The app navigator (formerly "AppNavigator" and "MainNavigator") is used for the primary
 * navigation flows of your app.
 * Generally speaking, it will contain an auth flow (registration, login, forgot password)
 * and a "main" flow which the user will use once logged in.
 */
import { useCallback, useEffect } from "react"
import { AppState, AppStateStatus } from "react-native"
import { NavigationContainer } from "@react-navigation/native"
import { StackActions } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { GestureHandlerRootView } from "react-native-gesture-handler"

import Config from "@/config"
import { vaultSession } from "@/locker/session"
import { ErrorBoundary } from "@/screens/ErrorScreen/ErrorBoundary"
import { CalculatorScreen } from "@/screens/CalculatorScreen"
import { CalculatorAltScreen } from "@/screens/CalculatorAltScreen"
import { VaultTabsNavigator } from "@/navigators/VaultTabsNavigator"
import { VaultLockedScreen } from "@/screens/VaultLockedScreen"
import { VaultOnboardingScreen } from "@/screens/VaultOnboardingScreen"
import { VaultSelectionScreen } from "@/screens/VaultSelectionScreen"
import { VaultPasskeySetupScreen } from "@/screens/VaultPasskeySetupScreen"
import { VaultPinScreen } from "@/screens/VaultPinScreen"
import { CalculatorEntryCodesScreen } from "@/screens/CalculatorEntryCodesScreen"
import { VaultLinkDeviceScreen } from "@/screens/VaultLinkDeviceScreen"
import { RemoteVaultScreen } from "@/screens/RemoteVaultScreen"
import { VaultPairDeviceScreen } from "@/screens/VaultPairDeviceScreen"
import { VaultImportPairingScreen } from "@/screens/VaultImportPairingScreen"
import { VaultRecoverySetupScreen } from "@/screens/VaultRecoverySetupScreen"
import { VaultRecoveryAccessScreen } from "@/screens/VaultRecoveryAccessScreen"
import { VaultQrScannerScreen } from "@/screens/VaultQrScannerScreen"
import { ServerUrlScreen } from "@/screens/ServerUrlScreen"
import { VaultDiagnosticsScreen } from "@/screens/VaultDiagnosticsScreen"
import { ThreatModelScreen } from "@/screens/ThreatModelScreen"
import { useAppTheme } from "@/theme/context"

import type { AppStackParamList, NavigationProps } from "./navigationTypes"
import { navigationRef, useBackButtonHandler } from "./navigationUtilities"
import { DecoyVaultScreen } from "@/screens/DecoyVaultScreen"

/**
 * This is a list of all the route names that will exit the app if the back button
 * is pressed while in that screen. Only affects Android.
 */
const exitRoutes = Config.exitRoutes

// Documentation: https://reactnavigation.org/docs/stack-navigator/
const Stack = createNativeStackNavigator<AppStackParamList>()
const protectedRoutes = new Set<keyof AppStackParamList>([
  "VaultSelection",
  "VaultTabs",
  "VaultLinkDevice",
  "RemoteVault",
  "VaultPairDevice",
  "VaultImportPairing",
  "VaultRecoverySetup",
  "VaultRecoveryAccess",
  "VaultQrScanner",
  "VaultDiagnostics",
  "ThreatModel",
  "ServerUrl",
])

function getActiveRootRouteName(): keyof AppStackParamList | undefined {
  if (!navigationRef.isReady()) return undefined
  const state = navigationRef.getRootState()
  const route = state.routes[state.index ?? 0]
  return route?.name as keyof AppStackParamList | undefined
}

function VaultSessionNavigationGate() {
  const redirectToCalculatorIfLocked = useCallback(() => {
    if (!navigationRef.isReady() || vaultSession.isUnlocked()) return

    const rootRouteName = getActiveRootRouteName()
    if (!rootRouteName || !protectedRoutes.has(rootRouteName)) return

    navigationRef.dispatch(StackActions.replace("Calculator"))
  }, [])

  useEffect(() => {
    const unsubscribe = vaultSession.subscribe((unlocked) => {
      if (!unlocked) {
        redirectToCalculatorIfLocked()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [redirectToCalculatorIfLocked])

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        redirectToCalculatorIfLocked()
      }
    }

    const sub = AppState.addEventListener("change", handleAppStateChange)
    return () => sub.remove()
  }, [redirectToCalculatorIfLocked])

  return null
}

const AppStack = () => {
  const {
    theme: { colors },
  } = useAppTheme()

  return (
    <Stack.Navigator
      initialRouteName="Calculator"
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: "transparent",
        },
      }}
    >
      <Stack.Screen name="Calculator" component={CalculatorScreen} />
      <Stack.Screen name="CalculatorAlt" component={CalculatorAltScreen} />
      <Stack.Screen name="VaultLocked" component={VaultLockedScreen} />
      <Stack.Screen name="VaultPin" component={VaultPinScreen} />
      <Stack.Screen name="VaultPasskeySetup" component={VaultPasskeySetupScreen} />
      <Stack.Screen name="VaultOnboarding" component={VaultOnboardingScreen} />
      <Stack.Screen name="VaultSelection" component={VaultSelectionScreen} />
      <Stack.Screen name="VaultTabs" component={VaultTabsNavigator} />
      <Stack.Screen name="CalculatorEntryCodes" component={CalculatorEntryCodesScreen} />
      <Stack.Screen name="VaultLinkDevice" component={VaultLinkDeviceScreen} />
      <Stack.Screen name="RemoteVault" component={RemoteVaultScreen} />
      <Stack.Screen name="VaultPairDevice" component={VaultPairDeviceScreen} />
      <Stack.Screen name="VaultImportPairing" component={VaultImportPairingScreen} />
      <Stack.Screen name="VaultRecoverySetup" component={VaultRecoverySetupScreen} />
      <Stack.Screen name="VaultRecoveryAccess" component={VaultRecoveryAccessScreen} />
      <Stack.Screen name="VaultQrScanner" component={VaultQrScannerScreen} />
      <Stack.Screen name="VaultDiagnostics" component={VaultDiagnosticsScreen} />
      <Stack.Screen name="ThreatModel" component={ThreatModelScreen} />
      <Stack.Screen name="ServerUrl" component={ServerUrlScreen} />
      <Stack.Screen name="DecoyVault" component={DecoyVaultScreen} />
    </Stack.Navigator>
  )
}

export const AppNavigator = (props: NavigationProps) => {
  const { navigationTheme } = useAppTheme()
  const { onReady, onStateChange, ...restProps } = props

  useBackButtonHandler((routeName) => exitRoutes.includes(routeName))

  const redirectToCalculatorIfLocked = useCallback(() => {
    if (!vaultSession.isUnlocked()) {
      const rootRouteName = getActiveRootRouteName()
      if (rootRouteName && protectedRoutes.has(rootRouteName)) {
        navigationRef.dispatch(StackActions.replace("Calculator"))
      }
    }
  }, [])

  const handleReady = useCallback(() => {
    onReady?.()
    redirectToCalculatorIfLocked()
  }, [onReady, redirectToCalculatorIfLocked])

  const handleStateChange = useCallback(
    (state: Parameters<NonNullable<NavigationProps["onStateChange"]>>[0]) => {
      onStateChange?.(state)
      redirectToCalculatorIfLocked()
    },
    [onStateChange, redirectToCalculatorIfLocked],
  )

  return (
    // <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer
        ref={navigationRef}
        theme={navigationTheme}
        onReady={handleReady}
        onStateChange={handleStateChange}
        {...restProps}
      >
        <ErrorBoundary catchErrors={Config.catchErrors}>
          <VaultSessionNavigationGate />
          <AppStack />
        </ErrorBoundary>
      </NavigationContainer>
    // </GestureHandlerRootView>
  )
}
