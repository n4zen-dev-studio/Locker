import { ComponentProps } from "react"
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs"
import {
  CompositeScreenProps,
  NavigationContainer,
  NavigatorScreenParams,
} from "@react-navigation/native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

export type VaultStackParamList = {
  VaultHome: undefined
  VaultNote: { noteId?: string; importType?: "image" | "pdf" | "file" } | undefined
}

export type SyncStackParamList = {
  SyncDashboard: undefined
}

export type CollabStackParamList = {
  CollabDashboard: undefined
}

export type SecurityStackParamList = {
  SecurityDashboard: undefined
  DecoyVault: undefined
}

export type SettingsStackParamList = {
  SettingsHome: undefined
}

export type VaultTabsParamList = {
  Vault: NavigatorScreenParams<VaultStackParamList> | undefined
  Security: NavigatorScreenParams<SecurityStackParamList> | undefined
  Settings: NavigatorScreenParams<SettingsStackParamList> | undefined
}

// Demo Tab Navigator types
export type DemoTabParamList = {
  DemoCommunity: undefined
  DemoShowroom: { queryIndex?: string; itemIndex?: string }
  DemoDebug: undefined
  DemoPodcastList: undefined
}

// App Stack Navigator types
export type AppStackParamList = {
  Calculator: undefined
  VaultLocked: undefined
  VaultPin: undefined
  VaultPasskeySetup: { mode?: "fresh" | "migrate" | "recovery" } | undefined
  VaultOnboarding: undefined
  VaultTabs: NavigatorScreenParams<VaultTabsParamList>
  Profile: undefined
  VaultSwitcherModal: undefined
  VaultHome: undefined
  VaultSwitcher: undefined
  PairDeviceModal: undefined
  ImportPairingModal: undefined
  VaultFabVaultPicker: undefined
  VaultSettings: undefined
  VaultAccount: undefined
  VaultLinkDevice: undefined
  RemoteVault: undefined
  VaultPairDevice: undefined
  VaultImportPairing: undefined
  VaultShare: undefined
  VaultInvites: undefined
  VaultDiagnostics: undefined
  VaultRecovery: undefined
  VaultSearch: undefined
  ServerUrl: undefined
  Welcome: undefined
  Login: undefined
  Demo: NavigatorScreenParams<DemoTabParamList>
  // 🔥 Your screens go here
  // IGNITE_GENERATOR_ANCHOR_APP_STACK_PARAM_LIST
}

export type AppStackScreenProps<T extends keyof AppStackParamList> = NativeStackScreenProps<
  AppStackParamList,
  T
>

export type VaultStackScreenProps<T extends keyof VaultStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<VaultStackParamList, T>,
  AppStackScreenProps<keyof AppStackParamList>
>

export type SyncStackScreenProps<T extends keyof SyncStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<SyncStackParamList, T>,
  AppStackScreenProps<keyof AppStackParamList>
>

export type CollabStackScreenProps<T extends keyof CollabStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<CollabStackParamList, T>,
  AppStackScreenProps<keyof AppStackParamList>
>

export type SecurityStackScreenProps<T extends keyof SecurityStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<SecurityStackParamList, T>,
  AppStackScreenProps<keyof AppStackParamList>
>

export type SettingsStackScreenProps<T extends keyof SettingsStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<SettingsStackParamList, T>,
  AppStackScreenProps<keyof AppStackParamList>
>

export type DemoTabScreenProps<T extends keyof DemoTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<DemoTabParamList, T>,
  AppStackScreenProps<keyof AppStackParamList>
>

export interface NavigationProps extends Partial<
  ComponentProps<typeof NavigationContainer<AppStackParamList>>
> {}
