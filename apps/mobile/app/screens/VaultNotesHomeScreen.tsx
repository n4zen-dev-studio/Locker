import { FC, useCallback, useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { VaultHeroOrb } from "@/components/VaultHeroOrb";
import { VaultHubBackground } from "@/components/VaultHubBackground";
import { disablePasskeyDevOnly, isPasskeyEnabled } from "@/locker/auth/passkey";
import { ensureUserKeypairUploaded } from "@/locker/keys/userKeyApi";
import { vaultSession } from "@/locker/session";
import { getToken } from "@/locker/auth/tokenStore";
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo";
import { listNotesForVault, Note } from "@/locker/storage/notesRepo";
import { getRemoteVaultId, getRemoteVaultName } from "@/locker/storage/remoteVaultRepo";
import { getMeta } from "@/locker/storage/vaultMetaRepo";
import { getPrivacyPrefs } from "@/locker/security/privacyPrefsRepo";
import { getSyncStatus } from "@/locker/sync/syncEngine";
import { requestSync } from "@/locker/sync/syncCoordinator";
import {
  getVaultItemTypeFromMime,
  isSensitiveClassification,
  VaultClassification,
} from "@/locker/vault/types";
import type { VaultStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";

type VaultFilter =
  | "all"
  | "notes"
  | "images"
  | "pdfs"
  | "files"
  | "sensitive"
  | "recent"
  | "deleted";
type VaultSort = "updated" | "created" | "title" | "classification";

export const VaultNotesHomeScreen: FC<VaultStackScreenProps<"VaultHome">> =
  function VaultNotesHomeScreen(props) {
    const { navigation } = props;
    const { themed, theme } = useAppTheme();
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);

    const [notes, setNotes] = useState<Note[]>([]);
    const [localNotes, setLocalNotes] = useState<Note[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [unlockMethod, setUnlockMethod] = useState<string | null>(null);
    const [metaVersion, setMetaVersion] = useState<1 | 2 | null>(null);
    const [syncStatus, setSyncStatus] = useState(() => getSyncStatus());
    const [tokenPresent, setTokenPresent] = useState(false);
    const [rvkPresent, setRvkPresent] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<VaultFilter>("all");
    const [sort, setSort] = useState<VaultSort>("updated");
    const [hideSensitivePreviews, setHideSensitivePreviews] = useState(
      () => getPrivacyPrefs().hideSensitivePreviews,
    );
    const [reducedMotion, setReducedMotion] = useState(false);
    const unlocked = vaultSession.isUnlocked();

    const [activeVaultId, setActiveVaultId] = useState<string | null>(() =>
      getRemoteVaultId(),
    );
    const [activeVaultName, setActiveVaultName] = useState<string | null>(() =>
      getRemoteVaultName(),
    );

    const refreshActiveVault = useCallback(() => {
      setActiveVaultId(getRemoteVaultId());
      setActiveVaultName(getRemoteVaultName());
    }, []);

    const refreshNotes = useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        return;
      }

      const key = vaultSession.getKey();
      if (!key) return;

      try {
        const vaultNotes = listNotesForVault(key, activeVaultId ?? null);
        const localOnly = listNotesForVault(key, null);
        setNotes(vaultNotes);
        setLocalNotes(localOnly);
        setError(null);
      } catch {
        setError("Vault data error");
      }
    }, [activeVaultId]);

    const refreshMeta = useCallback(async () => {
      const meta = getMeta();
      setMetaVersion(meta ? meta.v : null);
      if (meta?.v === 2 && (await isPasskeyEnabled())) {
        setUnlockMethod("Passkey");
      } else if (meta?.v === 1) {
        setUnlockMethod("Legacy PIN");
      } else {
        setUnlockMethod(null);
      }
    }, []);

    const refreshSyncPrereqs = useCallback(async () => {
      const token = await getToken();
      setTokenPresent(!!token);
      if (!activeVaultId) {
        setRvkPresent(false);
        return;
      }
      const rvk = await getRemoteVaultKey(activeVaultId);
      setRvkPresent(!!rvk);
    }, [activeVaultId]);

    useFocusEffect(
      useCallback(() => {
        if (!vaultSession.isUnlocked()) {
          navigation.replace("VaultLocked");
          return;
        }
        refreshActiveVault();
        refreshNotes();
        refreshMeta();
        setHideSensitivePreviews(getPrivacyPrefs().hideSensitivePreviews);
        refreshSyncPrereqs().catch(() => undefined);
        ensureUserKeypairUploaded().catch(() => undefined);
      }, [
        navigation,
        refreshNotes,
        refreshMeta,
        refreshSyncPrereqs,
        refreshActiveVault,
      ]),
    );

    useFocusEffect(
      useCallback(() => {
        const sub = AppState.addEventListener("change", (state) => {
          if (state === "active" && !vaultSession.isUnlocked()) {
            navigation.replace("VaultLocked");
          }
        });
        refreshActiveVault();
        refreshNotes();
        refreshSyncPrereqs().catch(() => undefined);
        return () => sub.remove();
      }, [navigation, refreshActiveVault, refreshNotes, refreshSyncPrereqs]),
    );

    useEffect(() => {
      refreshMeta().catch(() => undefined);
    }, [refreshMeta]);

    useEffect(() => {
      AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
      const subscription = AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        setReducedMotion,
      );

      return () => subscription.remove();
    }, []);

    useEffect(() => {
      const timer = setInterval(() => {
        setSyncStatus(getSyncStatus());
      }, 2000);
      return () => clearInterval(timer);
    }, []);

    const syncReason = useMemo(() => {
      if (!activeVaultId) return "Select a remote vault";
      if (!tokenPresent) return "Link device";
      if (!unlocked) return "Unlock vault";
      if (!rvkPresent) return "Create sync key";
      return null;
    }, [activeVaultId, tokenPresent, rvkPresent, unlocked]);

    const handleSyncNow = async () => {
      if (syncReason) return;
      setError(null);
      setRefreshing(true);
      try {
        const result = await requestSync("manual", activeVaultId ?? undefined);
        if (result?.errors?.length > 0) {
          setError(
            `Sync completed with ${result.errors.length} error(s): ${result.errors[0].type}`,
          );
        }
        refreshNotes();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sync failed";
        setError(message);
      } finally {
        setRefreshing(false);
        setSyncStatus(getSyncStatus());
      }
    };

    const handleLock = () => {
      vaultSession.clear();
      navigation.popToTop();
      navigation.replace("Calculator");
    };

    const handleDisablePasskey = async () => {
      await disablePasskeyDevOnly();
      refreshMeta().catch(() => undefined);
    };

    const items = useMemo(() => {
      const noteMap = new Map<string, Note>();
      [...notes, ...localNotes].forEach((note) => noteMap.set(note.id, note));

      const list: VaultListItem[] = [];
      for (const note of noteMap.values()) {
        const itemSyncStatus = note.vaultId ? "cloud" : "local";
        list.push({
          id: `note:${note.id}`,
          noteId: note.id,
          type: "note",
          title: note.title || "Untitled",
          preview: note.body,
          updatedAt: note.updatedAt,
          createdAt: note.createdAt,
          classification: note.classification,
          deleted: !!note.deletedAt,
          syncStatus: itemSyncStatus,
        });

        for (const attachment of note.attachments ?? []) {
          list.push({
            id: `attachment:${attachment.id}`,
            noteId: note.id,
            attachmentId: attachment.id,
            type: getVaultItemTypeFromMime(attachment.mime),
            title: attachment.filename ?? "Attachment",
            preview: attachment.mime,
            updatedAt: note.updatedAt,
            createdAt: attachment.createdAt,
            classification: note.classification,
            deleted: !!note.deletedAt,
            syncStatus: itemSyncStatus,
          });
        }
      }

      return list;
    }, [localNotes, notes]);

    const visibleItems = useMemo(() => {
      const normalizedQuery = query.trim().toLowerCase();
      return items
        .filter((item) => {
          if (filter === "deleted") return item.deleted;
          if (item.deleted) return false;
          if (filter === "notes") return item.type === "note";
          if (filter === "images") return item.type === "image";
          if (filter === "pdfs") return item.type === "pdf";
          if (filter === "files") return item.type === "file";
          if (filter === "sensitive")
            return isSensitiveClassification(item.classification);
          if (filter === "recent") {
            return (
              Date.now() - new Date(item.updatedAt).getTime() <= RECENT_WINDOW_MS
            );
          }
          return true;
        })
        .filter((item) => {
          if (!normalizedQuery) return true;
          const haystack = [
            item.title,
            item.preview,
            item.classification,
            item.type,
            item.syncStatus,
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        })
        .sort((a, b) => compareVaultItems(a, b, sort));
    }, [filter, items, query, sort]);

    const heroActions = useMemo(
      () => [
        {
          id: "new-note",
          label: "New Note",
          icon: "note" as const,
          angle: -135,
          distance: 108,
          onPress: () => navigation.navigate("VaultNote"),
        },
        {
          id: "import-image",
          label: "Import Image",
          icon: "image" as const,
          angle: -45,
          distance: 110,
          onPress: () =>
            navigation.navigate("VaultNote", { importType: "image" }),
        },
        {
          id: "import-pdf",
          label: "Import PDF",
          icon: "pdf" as const,
          angle: 135,
          distance: 110,
          onPress: () => navigation.navigate("VaultNote", { importType: "pdf" }),
        },
        {
          id: "import-file",
          label: "Import File",
          icon: "file" as const,
          angle: 45,
          distance: 110,
          onPress: () => navigation.navigate("VaultNote", { importType: "file" }),
        },
      ],
      [navigation],
    );

    return (
      <Screen
        preset="fixed"
        contentContainerStyle={themed([$screen, $insets])}
        systemBarStyle="light"
      >
        <VaultHubBackground reducedMotion={reducedMotion} />

        <ScrollView
          contentContainerStyle={themed($content)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleSyncNow} />
          }
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            entering={
              reducedMotion
                ? undefined
                : FadeInDown.duration(360).easing(
                    Easing.bezier(0.22, 1, 0.36, 1),
                  )
            }
            style={themed($header)}
          >
            <View style={themed($headerTopRow)}>
              <View style={themed($headerCopy)}>
                <Text size="xxs" style={themed($eyebrow)}>
                  Locker
                </Text>
                <Text preset="heading" style={themed($vaultNameText)}>
                  {activeVaultName ?? "Personal Vault"}
                </Text>
                <Text style={themed($metaText)}>
                  {activeVaultId ? "Personal cloud vault" : "Local-only vault"}
                </Text>
              </View>

              <View style={themed($headerActions)}>
                <HeaderPill
                  label="Security"
                  onPress={() =>
                    navigation.navigate("VaultTabs", { screen: "Security" })
                  }
                />
                <HeaderPill
                  label="Settings"
                  onPress={() =>
                    navigation.navigate("VaultTabs", { screen: "Settings" })
                  }
                />
                <Pressable onPress={handleLock} style={themed($lockButton)}>
                  <Icon
                    icon="lock"
                    size={16}
                    color={theme.colors.vaultHub.vaultHubTextPrimary}
                  />
                </Pressable>
              </View>
            </View>

            <View style={themed($headerMetaRow)}>
              {unlockMethod ? (
                <MetaPill label={`Unlock ${unlockMethod}`} />
              ) : null}
              <MetaPill
                label={`Sync ${syncStatus.state} · Queue ${syncStatus.queueSize}`}
              />
              {__DEV__ && metaVersion ? (
                <MetaPill label={`Meta v${metaVersion}`} />
              ) : null}
            </View>
          </Animated.View>

          <Animated.View
            entering={
              reducedMotion
                ? undefined
                : FadeIn.duration(520).easing(Easing.bezier(0.22, 1, 0.36, 1))
            }
            style={themed($heroSection)}
          >
            <VaultHeroOrb actions={heroActions} reducedMotion={reducedMotion} />
          </Animated.View>

          <Animated.View
            entering={
              reducedMotion
                ? undefined
                : FadeInUp.delay(80).duration(360).easing(
                    Easing.bezier(0.22, 1, 0.36, 1),
                  )
            }
            style={themed($toolbarSection)}
          >
            <View style={themed($toolbarHeader)}>
              <Text preset="bold" style={themed($toolbarTitle)}>
                Vault Tools
              </Text>
              <Text style={themed($toolbarHint)}>
                Pull down to sync now
              </Text>
            </View>

            <View style={themed($searchSurface)}>
              <SearchGlyph />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search vault content"
                placeholderTextColor={theme.colors.vaultHub.vaultHubMuted}
                style={themed($searchInput)}
              />
            </View>

            <View style={themed($chipSection)}>
              {FILTER_OPTIONS.map((option) => {
                const selected = option.value === filter;
                return (
                  <Pressable
                    key={option.value}
                    style={themed([$filterChip, selected && $filterChipSelected])}
                    onPress={() => setFilter(option.value)}
                  >
                    <Text
                      style={themed(
                        selected ? $filterChipTextSelected : $filterChipText,
                      )}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={themed($sortButton)}
              onPress={() => setSort(nextVaultSort(sort))}
            >
              <Text style={themed($sortButtonText)}>Sort: {sort}</Text>
            </Pressable>
          </Animated.View>

          {syncReason ? (
            <View style={themed($syncHint)}>
              <Text style={themed($metaText)}>Sync disabled: {syncReason}</Text>
            </View>
          ) : null}

          {error ? (
            <View style={themed($errorCard)}>
              <Text style={themed($errorText)}>{error}</Text>
            </View>
          ) : null}

          <Animated.View
            entering={
              reducedMotion
                ? undefined
                : FadeInUp.delay(140).duration(420).easing(
                    Easing.bezier(0.22, 1, 0.36, 1),
                  )
            }
            style={themed($listSection)}
          >
            <View style={themed($listHeader)}>
              <Text preset="bold" style={themed($sectionTitle)}>
                Vault Content
              </Text>
              <Text style={themed($sectionMeta)}>
                {visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}
              </Text>
            </View>

            {visibleItems.length === 0 ? (
              <View style={themed($emptyCard)}>
                <Text style={themed($emptyText)}>
                  {filter === "deleted"
                    ? "Trash is empty."
                    : "No matching vault items yet."}
                </Text>
              </View>
            ) : (
              visibleItems.map((item, index) => (
                <Animated.View
                  key={item.id}
                  entering={
                    reducedMotion
                      ? undefined
                      : FadeInUp.delay(200 + index * 28)
                          .duration(320)
                          .easing(Easing.bezier(0.22, 1, 0.36, 1))
                  }
                >
                  <Pressable
                    style={({ pressed }) => [
                      themed($noteCard),
                      pressed && themed($notePressed),
                    ]}
                    onPress={() =>
                      navigation.navigate("VaultNote", { noteId: item.noteId })
                    }
                  >
                    <View style={themed($itemHeader)}>
                      <View style={themed($itemHeaderCopy)}>
                        <Text
                          preset="bold"
                          style={themed($noteTitle)}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        <Text style={themed($noteMeta)}>
                          Updated {new Date(item.updatedAt).toLocaleString()}
                        </Text>
                      </View>

                      <View style={themed($itemMetaBadges)}>
                        <Text style={themed($itemBadge)}>{item.type.toUpperCase()}</Text>
                        <Text style={themed($itemBadge)}>{item.classification}</Text>
                        <Text style={themed($itemBadge)}>{item.syncStatus}</Text>
                      </View>
                    </View>

                    <Text style={themed($notePreview)} numberOfLines={2}>
                      {hideSensitivePreviews &&
                      isSensitiveClassification(item.classification)
                        ? `Preview hidden for ${item.classification}`
                        : item.preview || "No preview available"}
                    </Text>
                  </Pressable>
                </Animated.View>
              ))
            )}
          </Animated.View>

          {__DEV__ && metaVersion === 2 ? (
            <Pressable style={themed($devButton)} onPress={handleDisablePasskey}>
              <Text preset="bold" style={themed($devText)}>
                Disable Passkey (Dev)
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </Screen>
    );
  };

const HeaderPill = ({ label, onPress }: { label: string; onPress: () => void }) => {
  const { themed } = useAppTheme();

  return (
    <Pressable style={themed($headerPill)} onPress={onPress}>
      <Text size="xxs" style={themed($headerPillText)}>
        {label}
      </Text>
    </Pressable>
  );
};

const MetaPill = ({ label }: { label: string }) => {
  const { themed } = useAppTheme();

  return (
    <View style={themed($metaPill)}>
      <Text size="xxs" style={themed($metaPillText)}>
        {label}
      </Text>
    </View>
  );
};

const SearchGlyph = () => {
  const { theme, themed } = useAppTheme();

  return (
    <View style={themed($searchIconWrap)}>
      <Svg width={16} height={16} viewBox="0 0 16 16">
        <Circle
          cx="7"
          cy="7"
          r="4.25"
          fill="none"
          stroke={theme.colors.vaultHub.vaultHubMuted}
          strokeWidth="1.6"
        />
        <Path
          d="M10.5 10.5 13.4 13.4"
          fill="none"
          stroke={theme.colors.vaultHub.vaultHubMuted}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
};

type VaultListItem = {
  id: string;
  noteId: string;
  attachmentId?: string;
  type: "note" | "image" | "pdf" | "file";
  title: string;
  preview: string;
  updatedAt: string;
  createdAt: string;
  classification: VaultClassification;
  deleted: boolean;
  syncStatus: "cloud" | "local";
};

const RECENT_WINDOW_MS = 1000 * 60 * 60 * 24 * 14;
const FILTER_OPTIONS: Array<{ label: string; value: VaultFilter }> = [
  { label: "All", value: "all" },
  { label: "Notes", value: "notes" },
  { label: "Images", value: "images" },
  { label: "PDFs", value: "pdfs" },
  { label: "Files", value: "files" },
  { label: "Sensitive", value: "sensitive" },
  { label: "Recent", value: "recent" },
  { label: "Trash", value: "deleted" },
];

function nextVaultSort(current: VaultSort): VaultSort {
  if (current === "updated") return "created";
  if (current === "created") return "title";
  if (current === "title") return "classification";
  return "updated";
}

function compareVaultItems(
  a: VaultListItem,
  b: VaultListItem,
  sort: VaultSort,
): number {
  if (sort === "created") return b.createdAt.localeCompare(a.createdAt);
  if (sort === "title") return a.title.localeCompare(b.title);
  if (sort === "classification")
    return a.classification.localeCompare(b.classification);
  return b.updatedAt.localeCompare(a.updatedAt);
}

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.vaultHub.vaultHubBg,
});

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  paddingBottom: spacing.xl * 2,
  gap: spacing.lg,
});

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
});

const $headerTopRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: spacing.md,
});

const $headerCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
});

const $eyebrow: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontFamily: typography.primary.medium,
  textTransform: "uppercase",
  letterSpacing: 1.3,
  marginBottom: 6,
});

const $vaultNameText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
});

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  marginTop: 6,
  fontSize: 12,
});

const $headerActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
});

const $headerPill: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 999,
  paddingHorizontal: spacing.md,
  paddingVertical: 8,
  backgroundColor: colors.vaultHub.vaultHubChipInactive,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $headerPillText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontFamily: typography.primary.medium,
});

const $lockButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 36,
  height: 36,
  borderRadius: 18,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.vaultHub.vaultHubChipInactive,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $headerMetaRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
});

const $metaPill: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 999,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  backgroundColor: colors.vaultHub.vaultHubSurface,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $metaPillText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontFamily: typography.primary.medium,
});

const $heroSection: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
});

const $toolbarSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
});

const $toolbarHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: spacing.md,
});

const $toolbarTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
});

const $toolbarHint: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 12,
});

const $searchSurface: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  borderRadius: 22,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  backgroundColor: colors.vaultHub.vaultHubSurface,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $searchIconWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginRight: spacing.sm,
});

const $searchInput: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  color: colors.vaultHub.vaultHubTextPrimary,
  minHeight: 24,
});

const $chipSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
});

const $filterChip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 999,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  backgroundColor: colors.vaultHub.vaultHubChipInactive,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $filterChipSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.vaultHub.vaultHubChipActive,
  borderColor: colors.vaultHub.vaultHubAccentPink,
});

const $filterChipText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 12,
});

const $filterChipTextSelected: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 12,
});

const $sortButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignSelf: "flex-start",
  borderRadius: 999,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  backgroundColor: colors.vaultHub.vaultHubChipInactive,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $sortButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontSize: 12,
});

const $syncHint: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 18,
  padding: spacing.md,
  backgroundColor: colors.vaultHub.vaultHubSurface,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $errorCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 18,
  padding: spacing.md,
  backgroundColor: "rgba(192, 52, 3, 0.18)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
});

const $listSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
});

const $listHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: spacing.md,
});

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
});

const $sectionMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 12,
});

const $noteCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 22,
  padding: spacing.md,
  backgroundColor: colors.vaultHub.vaultHubCard,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $notePressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.86,
  transform: [{ scale: 0.992 }],
});

const $itemHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: spacing.md,
});

const $itemHeaderCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
});

const $itemMetaBadges: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: spacing.xs,
  flexShrink: 1,
  maxWidth: "44%",
});

const $itemBadge: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontSize: 10,
});

const $noteTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  marginBottom: 6,
});

const $noteMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 12,
});

const $notePreview: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontSize: 13,
  marginTop: spacing.sm,
});

const $emptyCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 20,
  padding: spacing.lg,
  alignItems: "center",
  backgroundColor: colors.vaultHub.vaultHubSurface,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $emptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
});

const $devButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  paddingVertical: spacing.sm,
  borderRadius: 14,
  backgroundColor: colors.vaultHub.vaultHubChipInactive,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $devText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
});
