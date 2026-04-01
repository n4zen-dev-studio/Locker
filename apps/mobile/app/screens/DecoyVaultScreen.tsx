import { FC, useEffect, useMemo, useState } from "react"
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"
import Animated, { Easing, FadeInDown, FadeInUp } from "react-native-reanimated"
import { Ionicons } from "@expo/vector-icons"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { VaultHubBackground } from "@/components/VaultHubBackground"
import { VaultSection } from "@/components/vault/VaultSection"
import {
  compareVaultItems,
  nextVaultSort,
  RECENT_WINDOW_MS,
  VaultFilter,
  VaultListItem,
  VaultSort,
  VaultViewMode,
} from "@/components/vault/vaultUi"
import { recordSecurityEvent } from "@/locker/security/auditLogRepo"
import type { SecurityStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

const DECOY_ITEMS: VaultListItem[] = [
  {
    id: "decoy-travel-budget",
    noteId: "decoy-travel-budget",
    type: "note",
    title: "Travel Budget",
    preview: "Flights, hotel deposits, and day-by-day spending plan for June.",
    updatedAt: "2026-03-27T09:14:00.000Z",
    createdAt: "2026-03-12T16:20:00.000Z",
    classification: "Financial",
    deleted: false,
    syncStatus: "local",
  },
  {
    id: "decoy-tuition-receipts",
    noteId: "decoy-tuition-receipts",
    type: "pdf",
    title: "Tuition Receipts",
    preview: "Spring semester payment confirmations and bursar statements.",
    updatedAt: "2026-03-24T14:42:00.000Z",
    createdAt: "2026-02-18T10:11:00.000Z",
    classification: "Archive",
    deleted: false,
    syncStatus: "cloud",
  },
  {
    id: "decoy-warranty-scans",
    noteId: "decoy-warranty-scans",
    type: "image",
    title: "Warranty Scans",
    preview: "Appliance serial labels and store receipts for household devices.",
    updatedAt: "2026-03-22T18:05:00.000Z",
    createdAt: "2026-01-09T08:55:00.000Z",
    classification: "Personal",
    deleted: false,
    syncStatus: "cloud",
  },
  {
    id: "decoy-insurance-copy",
    noteId: "decoy-insurance-copy",
    type: "doc",
    title: "Insurance Copy",
    preview: "Vehicle and renter policy summaries kept for quick reference.",
    updatedAt: "2026-03-19T07:36:00.000Z",
    createdAt: "2026-03-01T13:28:00.000Z",
    classification: "Legal",
    deleted: false,
    syncStatus: "local",
  },
  {
    id: "decoy-personal-notes",
    noteId: "decoy-personal-notes",
    type: "note",
    title: "Personal Notes",
    preview: "Home maintenance reminders, delivery dates, and errands.",
    updatedAt: "2026-03-16T21:10:00.000Z",
    createdAt: "2026-02-27T19:05:00.000Z",
    classification: "Private",
    deleted: false,
    syncStatus: "local",
  },
]

export const DecoyVaultScreen: FC<SecurityStackScreenProps<"DecoyVault">> = function DecoyVaultScreen(
  props,
) {
  const { navigation } = props
  const { themed, theme } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<VaultFilter>("all")
  const [sort, setSort] = useState<VaultSort>("updated")
  const [viewMode, setViewMode] = useState<VaultViewMode>("stack")
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion)
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion)
    return () => subscription.remove()
  }, [])

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return DECOY_ITEMS
      .filter((item) => {
        if (filter === "deleted") return item.deleted
        if (item.deleted) return false
        if (filter === "notes") return item.type === "note"
        if (filter === "images") return item.type === "image"
        if (filter === "pdfs") return item.type === "pdf"
        if (filter === "files") return item.type === "doc"
        if (filter === "voices") return item.type === "voice"
        if (filter === "sensitive") return item.classification !== "Archive" && item.classification !== "Personal"
        if (filter === "recent") {
          return Date.now() - new Date(item.updatedAt).getTime() <= RECENT_WINDOW_MS
        }
        return true
      })
      .filter((item) => {
        if (!normalizedQuery) return true

        const haystack = [item.title, item.preview, item.classification, item.type, item.syncStatus]
          .join(" ")
          .toLowerCase()
        return haystack.includes(normalizedQuery)
      })
      .sort((a, b) => compareVaultItems(a, b, sort))
  }, [filter, query, sort])

  return (
    <Screen
      preset="fixed"
      backgroundColor={theme.colors.vaultHub.vaultHubBg}
      contentContainerStyle={themed([$screen, $insets])}
      keyboardAvoidingEnabled={false}
      systemBarStyle="light"
    >
      <VaultHubBackground reducedMotion={reducedMotion} />

      <ScrollView contentContainerStyle={themed($content)} showsVerticalScrollIndicator={false}>
        <Animated.View
          entering={
            reducedMotion
              ? undefined
              : FadeInDown.duration(320).easing(Easing.bezier(0.22, 1, 0.36, 1))
          }
          style={themed($header)}
        >
          <View style={themed($heroTopRow)}>
            <Text size="xs" style={themed($heroEyebrow)}>
              Personal Vault
            </Text>

            <Pressable
              onPress={() => {
                recordSecurityEvent({
                  type: "decoy_vault_close",
                  message: "Decoy vault closed.",
                  severity: "info",
                })
                navigation.goBack()
              }}
              style={themed($closePill)}
            >
                <Ionicons
                            name={"lock-closed"}
                            size={12}
                            color={'#fff'}
                            style={{ paddingRight: 5 }}
                          />              
                          <Text style={themed($closePillText)}>Lock Vault</Text>
             
            </Pressable>
          </View>

          <Text preset="heading" style={themed($heroTitle)}>
            Home
          </Text>

          
        </Animated.View>

        <Animated.View
          entering={
            reducedMotion
              ? undefined
              : FadeInUp.delay(60).duration(340).easing(Easing.bezier(0.22, 1, 0.36, 1))
          }
          style={themed($sectionWrap)}
        >
          <VaultSection
            animateOnMount={!reducedMotion}
            filter={filter}
            items={visibleItems}
            sort={sort}
            viewMode={viewMode}
            reducedMotion={reducedMotion}
            onLayout={() => undefined}
            onChangeFilter={setFilter}
            onChangeViewMode={setViewMode}
            onSortCycle={() => setSort(nextVaultSort(sort))}
            onOpenItem={() => undefined}
          >
            <View style={themed($searchSurface)}>
              <Ionicons name="search" size={16} color={theme.colors.vaultHub.vaultHubMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search home contents"
                placeholderTextColor={theme.colors.vaultHub.vaultHubMuted}
                style={themed($searchInput)}
              />
              {query ? (
                <Pressable hitSlop={8} onPress={() => setQuery("")}>
                  <Ionicons name="close" size={16} color="#fff" />
                </Pressable>
              ) : null}
            </View>
          </VaultSection>
        </Animated.View>
      </ScrollView>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl * 2,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  // paddingTop: spacing.xl,
  marginBottom: spacing.xl,
  gap: spacing.sm,
})

const $heroTopRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: spacing.md,
})

const $heroEyebrow: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontFamily: typography.primary.medium,
  letterSpacing: 0.8,
  textTransform: "uppercase",
})

const $heroTitle: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  marginTop: -20,
})

const $heroSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  maxWidth: "86%",
})

const $closePill: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  borderRadius: 999,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs + 2,
  backgroundColor: colors.vaultHub.vaultHubChipInactive,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
})

const $closeIcon: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginRight: spacing.xs,
})

const $closePillText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
})

const $sectionWrap: ThemedStyle<ViewStyle> = () => ({
  minHeight: 1,
})

const $searchSurface: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  backgroundColor: "rgba(255,255,255,0.04)",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
})

const $searchInput: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  flex: 1,
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.normal,
  fontSize: 14,
  paddingVertical: 0,
})
