import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { FlatList, Pressable, TextInput, TextStyle, View, ViewStyle, InteractionManager } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { getRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { ensureSearchTables, getSearchIndexStats, rebuildSearchIndex, search } from "@/locker/search/searchRepo"
import type { HighlightPart, SearchResult, SearchSort } from "@/locker/search/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

const SORT_OPTIONS: SearchSort[] = ["relevance", "updatedAt", "createdAt", "title"]

export const VaultSearchScreen: FC<AppStackScreenProps<"VaultSearch">> = function VaultSearchScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [sort, setSort] = useState<SearchSort>("relevance")
  const [localOnly, setLocalOnly] = useState(false)
  const [conflictsOnly, setConflictsOnly] = useState(false)

  const vaultId = useMemo(() => getRemoteVaultId(), [])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      ensureSearchTables(vaultId ?? null)
      const stats = getSearchIndexStats(vaultId ?? null)
      if (!stats.exists || stats.count === 0) {
        InteractionManager.runAfterInteractions(() => {
          rebuildSearchIndex(vaultId ?? null)
        })
      }
    }, [navigation, vaultId]),
  )

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    const handle = setTimeout(() => {
      try {
        const next = search(query, {
          vaultId: vaultId ?? null,
          limit: 50,
          offset: 0,
          sort,
          filters: {
            localOnly,
            conflictsOnly,
          },
        })
        setResults(next)
        setStatus(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Search failed"
        setStatus(message)
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(handle)
  }, [query, sort, localOnly, conflictsOnly, vaultId])

  const toggleSort = () => {
    const idx = SORT_OPTIONS.indexOf(sort)
    const next = SORT_OPTIONS[(idx + 1) % SORT_OPTIONS.length]
    setSort(next)
  }

  const renderParts = (parts: HighlightPart[], highlight: TextStyle, normal: TextStyle) => (
    <Text style={normal}>
      {parts.map((part, idx) => (
        <Text key={`${idx}-${part.text}`} style={part.highlight ? highlight : normal}>
          {part.text}
        </Text>
      ))}
    </Text>
  )

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Search
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Find notes in this vault
        </Text>
      </View>

      <View style={themed($searchBox)}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search notes"
          placeholderTextColor="#9aa0a6"
          style={themed($input)}
        />
      </View>

      <View style={themed($filtersRow)}>
        <Pressable style={themed($filterButton)} onPress={toggleSort}>
          <Text style={themed($filterText)}>Sort: {sort}</Text>
        </Pressable>
        <Pressable style={themed($filterButton)} onPress={() => setLocalOnly((v) => !v)}>
          <Text style={themed($filterText)}>Local Only: {localOnly ? "on" : "off"}</Text>
        </Pressable>
        <Pressable style={themed($filterButton)} onPress={() => setConflictsOnly((v) => !v)}>
          <Text style={themed($filterText)}>Conflicts: {conflictsOnly ? "on" : "off"}</Text>
        </Pressable>
      </View>

      {!query.trim() ? (
        <View style={themed($emptyCard)}>
          <Text style={themed($emptyText)}>Start typing to search</Text>
        </View>
      ) : null}

      {status ? <Text style={themed($errorText)}>{status}</Text> : null}

      {query.trim() && results.length === 0 && !loading ? (
        <View style={themed($emptyCard)}>
          <Text style={themed($emptyText)}>No results</Text>
        </View>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={themed($list)}
        renderItem={({ item }) => (
          <Pressable
            style={themed($resultCard)}
            onPress={() => navigation.navigate("VaultNote", { noteId: item.id })}
          >
            {renderParts(item.titleParts, themed($highlight), themed($titleText))}
            {renderParts(item.snippetParts, themed($snippetHighlight), themed($snippetText))}
            <View style={themed($metaRow)}>
              <Text style={themed($metaText)}>
                {new Date(item.updatedAt).toLocaleString()}
              </Text>
              {item.conflict ? <Text style={themed($badge)}>Conflict</Text> : null}
              {item.localOnly ? <Text style={themed($badge)}>Local</Text> : null}
            </View>
          </Pressable>
        )}
      />

      <Pressable style={themed($linkButton)} onPress={() => navigation.goBack()}>
        <Text preset="bold" style={themed($linkText)}>
          Back
        </Text>
      </Pressable>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  backgroundColor: colors.palette.neutral900,
  paddingHorizontal: spacing.xl,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: spacing.xl,
  marginBottom: spacing.md,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})

const $searchBox: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $input: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 14,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  color: colors.palette.neutral100,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
})

const $filtersRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  marginBottom: spacing.md,
})

const $filterButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  paddingVertical: spacing.sm,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
  alignItems: "center",
})

const $filterText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  fontSize: 12,
})

const $list: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingBottom: spacing.lg,
  gap: spacing.md,
})

const $resultCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 16,
  padding: spacing.md,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.1)",
})

const $titleText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  marginBottom: 4,
})

const $snippetText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  fontSize: 12,
})

const $highlight: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.primary300,
})

const $snippetHighlight: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.primary300,
})

const $metaRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  marginTop: spacing.sm,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral400,
  fontSize: 11,
})

const $badge: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
  fontSize: 10,
  borderWidth: 1,
  borderColor: colors.palette.neutral600,
  paddingHorizontal: 6,
  paddingVertical: 2,
  borderRadius: 10,
})

const $emptyCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.05)",
  borderRadius: 16,
  padding: spacing.md,
  alignItems: "center",
  marginBottom: spacing.md,
})

const $emptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.angry500,
  marginBottom: spacing.sm,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})
