import { FC, useCallback, useState } from "react";
import { ScrollView, Share, TextStyle, View, ViewStyle } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Database, RefreshCw } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { GhostButton } from "@/components/vault-note/GhostButton";
import { GlassSection } from "@/components/vault-note/GlassSection";
import { GradientPrimaryButton } from "@/components/vault-note/GradientPrimaryButton";
import { MetaChip } from "@/components/vault-note/MetaChip";
import {
  VaultBanner,
  VaultGlassPanel,
  VaultScreenBackground,
  VaultScreenHero,
} from "@/components/vault-note/VaultScreenChrome";
import {
  buildDiagnosticsSnapshot,
  exportDiagnosticsJson,
  exportEncryptedVaultBackup,
} from "@/locker/diagnostics/diagnostics";
import { rebuildSearchIndex } from "@/locker/search/searchRepo";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";

export const VaultDiagnosticsScreen: FC<
  AppStackScreenProps<"VaultDiagnostics">
> = function VaultDiagnosticsScreen(props) {
  const { navigation } = props;
  const { themed } = useAppTheme();
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);

  const [snapshot, setSnapshot] = useState<Awaited<
    ReturnType<typeof buildDiagnosticsSnapshot>
  > | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await buildDiagnosticsSnapshot();
    setSnapshot(next);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const handleExport = async () => {
    setError(null);
    setStatus(null);
    try {
      const text = await exportDiagnosticsJson();
      await Share.share({ message: text });
      setStatus("Diagnostics exported.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      setError(message);
    }
  };

  const handleExportBackup = async () => {
    setError(null);
    setStatus(null);
    try {
      const text = exportEncryptedVaultBackup();
      await Share.share({ message: text });
      setStatus("Encrypted backup exported.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      setError(message);
    }
  };

  const handleRebuildSearch = () => {
    setError(null);
    setStatus(null);
    try {
      rebuildSearchIndex(snapshot?.vaultId ?? null);
      setStatus("Search index rebuilt.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Rebuild failed";
      setError(message);
    }
  };

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <VaultScreenBackground />
      <ScrollView
        contentContainerStyle={themed($content)}
        showsVerticalScrollIndicator={false}
      >
        <VaultScreenHero
          themed={themed}
          badge="DIAGNOSTICS"
          title="Diagnostics"
          subtitle="Demo-safe technical state and protected export tools."
          icon={<Database size={13} color="#FFD8FA" />}
          metaLabel={snapshot ? "Loaded" : "Snapshot pending"}
        />

        <GlassSection
          themed={themed}
          title="Snapshot"
          subtitle="Current device, account, sync, and security state."
          icon={<RefreshCw size={14} color="#FFC8F3" />}
          rightSlot={
            <MetaChip
              themed={themed}
              label={`Outbox ${snapshot?.outboxSize ?? 0}`}
            />
          }
        >
          <VaultGlassPanel themed={themed}>
            <View style={themed($statList)}>
              <Text style={themed($metaText)}>
                Vault ID: {snapshot?.vaultId ?? "n/a"}
              </Text>
              <Text style={themed($metaText)}>
                Device ID: {snapshot?.deviceId ?? "n/a"}
              </Text>
              <Text style={themed($metaText)}>
                User ID: {snapshot?.userId ?? "n/a"}
              </Text>
              <Text style={themed($metaText)}>
                User Email: {snapshot?.userEmail ?? "n/a"}
              </Text>
              <Text style={themed($metaText)}>
                Token Present: {snapshot?.tokenPresent ? "yes" : "no"}
              </Text>
              <Text style={themed($metaText)}>
                RVK Present: {snapshot?.rvkPresent ? "yes" : "no"}
              </Text>
              <Text style={themed($metaText)}>
                Cursor: {snapshot?.cursor ?? 0}
              </Text>
              <Text style={themed($metaText)}>
                Lamport: {snapshot?.lamport ?? 0}
              </Text>
              <Text style={themed($metaText)}>
                Outbox: {snapshot?.outboxSize ?? 0}
              </Text>
              <Text style={themed($metaText)}>
                Last Sync: {snapshot?.lastSyncAt ?? "n/a"}
              </Text>
              <Text style={themed($metaText)}>
                Notes: {snapshot?.counts.notes ?? 0}
              </Text>
              <Text style={themed($metaText)}>
                Tombstones: {snapshot?.counts.tombstones ?? 0}
              </Text>
              <Text style={themed($metaText)}>
                Index Size: {snapshot?.counts.indexSize ?? 0}
              </Text>
              <Text style={themed($metaText)}>
                Trust: {snapshot?.security.trustState ?? "n/a"}
              </Text>
              <Text style={themed($metaText)}>
                Auto-lock:{" "}
                {snapshot?.security.lockOnBackground
                  ? "background"
                  : `${snapshot?.security.inactivityLockSeconds ?? 0}s inactivity`}
              </Text>
              <Text style={themed($metaText)}>
                Hide previews:{" "}
                {snapshot?.security.hideSensitivePreviews ? "yes" : "no"}
              </Text>
            </View>
          </VaultGlassPanel>
        </GlassSection>

        <GhostButton
          themed={themed}
          label="Refresh"
          onPress={() => void refresh()}
        />
        <GradientPrimaryButton
          themed={themed}
          label="Export Diagnostics"
          onPress={() => void handleExport()}
        />
        <GhostButton
          themed={themed}
          label="Export Encrypted Vault Backup"
          onPress={() => void handleExportBackup()}
        />
        {__DEV__ ? (
          <GhostButton
            themed={themed}
            label="Rebuild Search Index"
            onPress={handleRebuildSearch}
          />
        ) : null}

        {error ? (
          <VaultBanner themed={themed} tone="error" text={error} />
        ) : null}
        {status ? (
          <VaultBanner themed={themed} tone="status" text={status} />
        ) : null}

        <GhostButton
          themed={themed}
          label="Back"
          onPress={() => navigation.goBack()}
        />
      </ScrollView>
    </Screen>
  );
};

const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 1,
  paddingHorizontal: spacing.lg,
});

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  paddingTop: spacing.lg,
  paddingBottom: spacing.xl,
});

const $statList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
});

const $metaText: ThemedStyle<TextStyle> = () => ({
  color: "#F3E7F8",
  fontSize: 12,
  lineHeight: 18,
});
