import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Dimensions,
  InteractionManager,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import Animated, { Easing, FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { VaultHeroOrb } from "@/components/VaultHeroOrb";
import { VaultHubBackground } from "@/components/VaultHubBackground";
import { VaultSection } from "@/components/vault/VaultSection";
import {
  compareVaultItems,
  nextVaultSort,
  RECENT_WINDOW_MS,
  VaultFilter,
  VaultListItem,
  VaultSort,
  VaultViewMode,
} from "@/components/vault/vaultUi";
import { disablePasskeyDevOnly, isPasskeyEnabled } from "@/locker/auth/passkey";
import { getToken } from "@/locker/auth/tokenStore";
import { ensureUserKeypairUploaded } from "@/locker/keys/userKeyApi";
import { vaultSession } from "@/locker/session";
import { getPrivacyPrefs } from "@/locker/security/privacyPrefsRepo";
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo";
import { listNotesForVault, Note } from "@/locker/storage/notesRepo";
import { getRemoteVaultId, getRemoteVaultName, listRemoteVaults, setRemoteVaultId } from "@/locker/storage/remoteVaultRepo";
import { getMeta } from "@/locker/storage/vaultMetaRepo";
import { requestSync } from "@/locker/sync/syncCoordinator";
import { getSyncStatus } from "@/locker/sync/syncEngine";
import {
  getVaultItemTypeFromMime,
  getVaultItemTypeFromImportType,
  isSensitiveClassification,
} from "@/locker/vault/types";
import type { VaultStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";
import { useSessionIntroAnimation } from "@/utils/useSessionIntroAnimation";
import { Ionicons } from "@expo/vector-icons"
import { GlowFab } from "@/components/GlowFab";

export const VaultNotesHomeScreen: FC<VaultStackScreenProps<"VaultHome">> = function VaultNotesHomeScreen(props) {
  const { navigation } = props;
  const { themed, theme } = useAppTheme();
  const $insets = useSafeAreaInsetsStyle(["top"]);
  const scrollRef = useRef<ScrollView>(null);
  const isFocused = useIsFocused();

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
  const [viewMode, setViewMode] = useState<VaultViewMode>("stack");
  const [hideSensitivePreviews, setHideSensitivePreviews] = useState(() => getPrivacyPrefs().hideSensitivePreviews);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [vaultSectionY, setVaultSectionY] = useState(0);
  const unlocked = vaultSession.isUnlocked();
  const [scrollEnabled, setScrollEnabled] = useState(true)

  const [activeVaultId, setActiveVaultId] = useState<string | null>(() => getRemoteVaultId());
  const [activeVaultName, setActiveVaultName] = useState<string | null>(() => getRemoteVaultName());
  const [availableVaults, setAvailableVaults] = useState(() => listRemoteVaults().filter((vault) => vault.enabledOnDevice));
  const shouldAnimateIntro = useSessionIntroAnimation("vault-home-intro", !reducedMotion);

  const refreshActiveVault = useCallback(() => {
    setActiveVaultId(getRemoteVaultId());
    setActiveVaultName(getRemoteVaultName());
    setAvailableVaults(listRemoteVaults().filter((vault) => vault.enabledOnDevice));
  }, []);

  const refreshNotes = useCallback(() => {
    if (!vaultSession.isUnlocked()) return;

    const key = vaultSession.getKey();
    if (!key) return;

    try {
      setNotes(listNotesForVault(key, activeVaultId ?? null));
      setLocalNotes(listNotesForVault(key, null));
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

      const task = InteractionManager.runAfterInteractions(() => {
        refreshActiveVault();
        refreshNotes();
        refreshMeta();
        setHideSensitivePreviews(getPrivacyPrefs().hideSensitivePreviews);
        refreshSyncPrereqs().catch(() => undefined);
        ensureUserKeypairUploaded().catch(() => undefined);
      });

      return () => task.cancel();
    }, [navigation, refreshActiveVault, refreshMeta, refreshNotes, refreshSyncPrereqs]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && !vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked");
      }
    });

    return () => sub.remove();
  }, [navigation]);

  useEffect(() => {
    refreshMeta().catch(() => undefined);
  }, [refreshMeta]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isFocused) return;

    const timer = setInterval(() => {
      setSyncStatus(getSyncStatus(activeVaultId ?? undefined));
    }, 2000);

    return () => clearInterval(timer);
  }, [activeVaultId, isFocused]);

  const syncReason = useMemo(() => {
    if (!activeVaultId) return "Select a remote vault";
    if (!tokenPresent) return "Link device";
    if (!unlocked) return "Unlock vault";
    if (!rvkPresent) return "Create sync key";
    return null;
  }, [activeVaultId, rvkPresent, tokenPresent, unlocked]);

  const handleSyncNow = async () => {
    if (syncReason) return;

    setError(null);
    setRefreshing(true);

    try {
      const result = await requestSync("manual", activeVaultId ?? undefined);
      if (result?.errors?.length) {
        setError(`Sync completed with ${result.errors.length} error(s): ${result.errors[0].type}`);
      }
      refreshNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setRefreshing(false);
      setSyncStatus(getSyncStatus(activeVaultId ?? undefined));
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
      const itemSyncStatus: "cloud" | "local" = note.vaultId ? "cloud" : "local";
      const primaryAttachment = (note.attachments ?? []).find(
        (attachment) => attachment.id === note.primaryAttachmentId,
      ) ?? note.attachments?.[0];
      list.push({
        id: `note:${note.id}`,
        noteId: note.id,
        type: note.itemType ?? "note",
        title: note.title || "Untitled",
        preview: hideSensitivePreviews && isSensitiveClassification(note.classification)
          ? `Preview hidden for ${note.classification}`
          : note.itemType === "voice"
            ? `Voice recording${note.voiceDurationMs ? ` · ${Math.round(note.voiceDurationMs / 1000)}s` : ""}`
            : note.itemType && note.itemType !== "note"
              ? primaryAttachment?.mime ?? "Encrypted file"
            : note.body,
        updatedAt: note.updatedAt,
        createdAt: note.createdAt,
        classification: note.classification,
        deleted: !!note.deletedAt,
        syncStatus: itemSyncStatus,
      });

      if ((note.itemType ?? "note") !== "note") continue;

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
  }, [hideSensitivePreviews, localNotes, notes]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return items
      .filter((item) => {
        if (filter === "deleted") return item.deleted;
        if (item.deleted) return false;
        if (filter === "notes") return item.type === "note";
        if (filter === "images") return item.type === "image";
        if (filter === "pdfs") return item.type === "pdf";
        if (filter === "files") return item.type === "doc";
        if (filter === "voices") return item.type === "voice";
        if (filter === "sensitive") return isSensitiveClassification(item.classification);
        if (filter === "recent") {
          return Date.now() - new Date(item.updatedAt).getTime() <= RECENT_WINDOW_MS;
        }
        return true;
      })
      .filter((item) => {
        if (!normalizedQuery) return true;

        const haystack = [item.title, item.preview, item.classification, item.type, item.syncStatus]
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
        onPress: () => navigation.navigate("VaultNote", { importType: "image", createType: 'image' }),
      },
      {
        id: "import-pdf",
        label: "Import PDF",
        icon: "pdf" as const,
        angle: 135,
        distance: 110,
        onPress: () => navigation.navigate("VaultNote", { importType: "pdf", createType: 'pdf'  }),
      },
      {
        id: "import-file",
        label: "Import File",
        icon: "file" as const,
        angle: 45,
        distance: 110,
        onPress: () => navigation.navigate("VaultNote", { importType: "file",  createType: 'doc' }),
      },
      {
        id: "voice",
        label: "Secure Voice",
        icon: "voice" as const,
        angle: 45,
        distance: 110,
        onPress: () => navigation.navigate("VaultNote", { createType: getVaultItemTypeFromImportType("voice") }),
      },
    ],
    [navigation],
  );

  const handleOpenVaultItem = useCallback(
    (item: VaultListItem) => {
      navigation.navigate("VaultNote", { noteId: item.noteId, attachmentId: item.attachmentId });
    },
    [navigation],
  );

  const handleSwitchVault = useCallback(
    (vaultId: string, vaultName?: string | null) => {
      setRemoteVaultId(vaultId, vaultName ?? undefined)
      refreshActiveVault()
      refreshNotes()
      refreshSyncPrereqs().catch(() => undefined)
      setSyncStatus(getSyncStatus(vaultId))
    },
    [refreshActiveVault, refreshNotes, refreshSyncPrereqs],
  )

  const handleScrollToVault = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, vaultSectionY), animated: true });
  }, [vaultSectionY]);

    const handleScrollToTop= useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.min(0, vaultSectionY), animated: true });
  }, [vaultSectionY]);

  return (
    <Screen
      preset="fixed"
      backgroundColor={theme.colors.vaultHub.vaultHubBg}
      contentContainerStyle={themed([$screen, $insets])}
      keyboardAvoidingEnabled={false}
      systemBarStyle="light"
    >
      {/* <VaultLockBackground reducedMotion={reducedMotion} /> */}
      <VaultHubBackground reducedMotion={reducedMotion} />

      <ScrollView
        ref={scrollRef}
        scrollEnabled={scrollEnabled}
        contentContainerStyle={themed($content)}
refreshControl={
  <RefreshControl
    refreshing={refreshing}
    onRefresh={handleSyncNow}
    enabled={!scrollEnabled}
  />
}        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={
            reducedMotion || !shouldAnimateIntro
              ? undefined
              : FadeInDown.duration(360).easing(Easing.bezier(0.22, 1, 0.36, 1))
          }
          style={themed($header)}
        >
          <View style={themed($headerTopRow)}>
            <View style={themed($headerCopy)}>
              {/* <Text size="xxs" style={themed($eyebrow)}>
                Locker
              </Text> */}
               <Text size="xxs" style={themed($eyebrow)}>
                 {activeVaultId ? "Synced vault" : "Local-only vault"}
              </Text>
              <Text preset="heading" style={themed($vaultNameText)}>
                {activeVaultName ?? "Personal Vault"}
              </Text>
              {/* <Text style={themed($metaText)}>
                {activeVaultId ? "Personal cloud vault" : "Local-only vault"}
              </Text> */}
            </View>

            <View style={themed($headerActions)}>
              <Pressable onPress={handleLock} style={themed($lockButton)}>
                <Ionicons
              name={"lock-closed"}
              size={18}
              color={'#fff'}
              style={{ padding: 5 }}
            />
                {/* <Lock fill={theme.colors.vaultHub.vaultHubBg} size={18} color={theme.colors.vaultHub.vaultHubTextPrimary}  /> */}
              </Pressable>
            </View>
          </View>

          {/* <View style={themed($headerMetaRow)}>
            {unlockMethod ? <MetaPill label={`Unlock ${unlockMethod}`} /> : null}
            <MetaPill label={`Sync ${syncStatus.state} · Queue ${syncStatus.queueSize}`} />
            {__DEV__ && metaVersion ? <MetaPill label={`Meta v${metaVersion}`} /> : null}
          </View> */}
        </Animated.View>

        <Animated.View
          entering={
            reducedMotion || !shouldAnimateIntro
              ? undefined
              : FadeIn.duration(520).easing(Easing.bezier(0.22, 1, 0.36, 1))
          }
          style={themed($heroSection)}
        >
<VaultHeroOrb
  actions={heroActions}
  reducedMotion={reducedMotion}
  onOrbitDragStateChange={(dragging) => setScrollEnabled(!dragging)}
/>
        </Animated.View>

        <Animated.View
          entering={
            reducedMotion || !shouldAnimateIntro
              ? undefined
              : FadeInUp.delay(80).duration(360).easing(Easing.bezier(0.22, 1, 0.36, 1))
          }
          style={themed($toolbarSection)}
        >
          <View style={themed($toolbarHeader)}>
             <Pressable style={[themed($jumpButton), {flexDirection: 'row', }]} onPress={handleScrollToVault}>
              <Ionicons
              name={"arrow-down"}
              size={18}
              color={'#fff'}
              style={{ paddingVertical: 5 }}
            />
             
            </Pressable>
            <Pressable style={[themed($jumpButton), {flexDirection: 'row', }]} onPress={handleScrollToVault}>
              <Ionicons
              name={"wallet"}
              size={18}
              color={'#fff'}
              style={{ paddingVertical: 5 }}
            />
            </Pressable>
          </View>

         


        </Animated.View>

        {availableVaults.length > 1 ? (
          <View style={themed($vaultSwitcher)}>
            {availableVaults.map((vault) => (
              <Pressable
                key={vault.id}
                style={themed([$vaultChip, activeVaultId === vault.id && $vaultChipActive])}
                onPress={() => handleSwitchVault(vault.id, vault.name)}
              >
                <Text style={themed([$vaultChipText, activeVaultId === vault.id && $vaultChipTextActive])}>
                  {vault.name ?? "Vault"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* {syncReason ? (
          <View style={themed($syncHint)}>
            <Text style={themed($metaText)}>Sync disabled: {syncReason}</Text>
          </View>
        ) : null} */}

        {error ? (
          <View style={themed($errorCard)}>
            <Text style={themed($errorText)}>{error}</Text>
          </View>
        ) : null}
        <View style={{height: 60}}/>

        <VaultSection
          animateOnMount={shouldAnimateIntro}
          filter={filter}
          items={visibleItems}
          sort={sort}
          viewMode={viewMode}
          reducedMotion={reducedMotion}
          onLayout={(event) => setVaultSectionY(event.nativeEvent.layout.y)}
          onChangeFilter={setFilter}
          onChangeViewMode={setViewMode}
          onSortCycle={() => setSort(nextVaultSort(sort))}
          onOpenItem={handleOpenVaultItem}
        />
         <View style={themed($searchSurface)}>
            <SearchGlyph />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search vault contents"
              placeholderTextColor={theme.colors.vaultHub.vaultHubMuted}
              style={themed($searchInput)}
            />
            {query &&
             <Ionicons
              name={"close"}
              size={18}
              color={'#fff'}
              style={{ paddingVertical: 5 }}
              onPress={() => setQuery('')}
            />
            }

          </View>
         <GlowFab onPress={() => handleScrollToTop()} style={{position: 'absolute', right: 20, bottom: 90}}/>
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
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  textTransform: "uppercase",
  letterSpacing: 1.3,
  marginBottom: 6,
});

const $vaultNameText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
});

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  // marginTop: 6,
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
  width: 40,
  height: 40,
  borderRadius: 18,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.vaultHub.vaultHubChipInactive,
  borderWidth: 1.5,
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
  marginTop: 40,
  height: Dimensions.get('screen').height* 0.6 ,
});

const $toolbarSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
});

const $vaultSwitcher: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
});

const $vaultChip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  borderRadius: 999,
  backgroundColor: colors.vaultHub.vaultHubChipInactive,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $vaultChipActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.vaultHub.vaultHubAccentPink,
  borderColor: colors.vaultHub.vaultHubAccentPink,
});

const $vaultChipText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 12,
});

const $vaultChipTextActive: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
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
  lineHeight: 18,
});

const $jumpButton: ThemedStyle<ViewStyle> = ({ spacing, colors }) => ({
  borderRadius: 999,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs + 2,
  backgroundColor: colors.vaultHub.vaultHubChipInactive,
  borderWidth: 1.5,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $jumpButtonText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
});

const $searchSurface: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  borderRadius: 999,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  backgroundColor: colors.vaultHub.vaultHubSurface,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  marginBottom: spacing.lg,
  marginRight: spacing.xxxl,
});

const $searchIconWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginRight: spacing.sm,
});

const $searchInput: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  color: colors.vaultHub.vaultHubTextPrimary,
  minHeight: 24,
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
