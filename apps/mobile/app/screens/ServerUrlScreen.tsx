import { FC, useCallback, useState } from "react";
import { ScrollView, TextStyle, View, ViewStyle } from "react-native";
import { Globe, Save, Server } from "lucide-react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { GhostButton } from "@/components/vault-note/GhostButton";
import { GlassSection } from "@/components/vault-note/GlassSection";
import { GradientPrimaryButton } from "@/components/vault-note/GradientPrimaryButton";
import { IconTextInput } from "@/components/vault-note/IconTextInput";
import {
  VaultBanner,
  VaultScreenBackground,
  VaultScreenHero,
} from "@/components/vault-note/VaultScreenChrome";
import {
  fetchJson,
  getApiBaseUrl,
  normalizeApiBaseUrl,
} from "@/locker/net/apiClient";
import { getServerUrl, setServerUrl } from "@/locker/storage/serverConfigRepo";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";

export const ServerUrlScreen: FC<AppStackScreenProps<"ServerUrl">> =
  function ServerUrlScreen(props) {
    const { navigation } = props;
    const { themed, theme } = useAppTheme();
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);

    const [url, setUrl] = useState("");
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useFocusEffect(
      useCallback(() => {
        const current = getServerUrl() || getApiBaseUrl();
        setUrl(current);
      }, []),
    );

    const handleSave = () => {
      const normalized = normalizeApiBaseUrl(url);
      setServerUrl(normalized);
      setStatus(`Saved: ${normalized}`);
      setError(null);
    };

    const handlePing = async () => {
      setError(null);
      setStatus(null);
      const normalized = normalizeApiBaseUrl(url);
      try {
        const data = await fetchJson<{ ok?: boolean }>(
          "/health",
          {},
          { baseUrl: normalized, token: null },
        );
        setStatus(`Ping ok: ${JSON.stringify(data)}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ping failed";
        setError(message);
      }
    };

    return (
      <Screen
        preset="scroll"
        contentContainerStyle={themed([$screen, $insets])}
      >
        <VaultScreenBackground />
        <ScrollView
          contentContainerStyle={themed($content)}
          showsVerticalScrollIndicator={false}
        >
          <VaultScreenHero
            themed={themed}
            badge="SERVER"
            title="Server URL"
            subtitle="Configure the API base URL used by this device."
            icon={<Server size={13} color="#FFD8FA" />}
            metaLabel="Advanced"
          />

          <GlassSection
            themed={themed}
            title="Connection Target"
            subtitle="Update the API base URL, then save or ping it."
            icon={<Globe size={14} color="#FFC8F3" />}
          >
            <View style={themed($fieldGroup)}>
              <Text style={themed($label)}>API base URL</Text>
              <IconTextInput
                themed={themed}
                theme={theme}
                icon={<Server size={16} color="#FFD8FA" />}
                placeholder="http://192.168.0.10:4000"
                value={url}
                onChangeText={setUrl}
              />
            </View>

            <GradientPrimaryButton
              themed={themed}
              label="Save"
              onPress={handleSave}
            />
            <GhostButton
              themed={themed}
              label="Ping"
              icon={<Save size={15} color="#F9E7FF" />}
              onPress={() => void handlePing()}
            />
          </GlassSection>

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

const $fieldGroup: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
});

const $label: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,236,255,0.74)",
  fontSize: 12,
  fontWeight: "600",
});
