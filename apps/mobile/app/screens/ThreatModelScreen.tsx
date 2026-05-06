import { FC } from "react";
import { ScrollView, TextStyle, ViewStyle } from "react-native";
import { ShieldAlert } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { GhostButton } from "@/components/vault-note/GhostButton";
import { GlassSection } from "@/components/vault-note/GlassSection";
import {
  VaultScreenBackground,
  VaultScreenHero,
} from "@/components/vault-note/VaultScreenChrome";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";

export const ThreatModelScreen: FC<AppStackScreenProps<"ThreatModel">> =
  function ThreatModelScreen(props) {
    const { navigation } = props;
    const { themed } = useAppTheme();
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);

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
            badge="SECURITY"
            title="Threat Model"
            subtitle="What Locker is designed to protect, and where its limits are."
            icon={<ShieldAlert size={13} color="#FFD8FA" />}
            metaLabel="Reference"
          />

          <GlassSection
            themed={themed}
            title="Protects Against"
            icon={<ShieldAlert size={14} color="#FFC8F3" />}
          >
            <Text style={themed($bodyText)}>
              Casual shoulder-surfing and opportunistic discovery through the
              calculator disguise.
            </Text>
            <Text style={themed($bodyText)}>
              Local disclosure when someone can browse app storage but does not
              control your unlocked device session.
            </Text>
            <Text style={themed($bodyText)}>
              Cloud-side metadata exposure by encrypting vault content before
              sync.
            </Text>
          </GlassSection>

          <GlassSection
            themed={themed}
            title="Does Not Protect Against"
            icon={<ShieldAlert size={14} color="#FFC8F3" />}
          >
            <Text style={themed($bodyText)}>
              Full device compromise, malware, or a rooted device reading memory
              while the vault is unlocked.
            </Text>
            <Text style={themed($bodyText)}>
              A coercive attacker who can force you to unlock the real vault or
              observe your passkey flow.
            </Text>
            <Text style={themed($bodyText)}>
              Unsafe sharing after export. Once exported, the destination and
              transport are outside Locker&apos;s control.
            </Text>
          </GlassSection>

          <GlassSection
            themed={themed}
            title="Security Tradeoffs"
            icon={<ShieldAlert size={14} color="#FFC8F3" />}
          >
            <Text style={themed($bodyText)}>
              Passkey-only unlock removes PIN fallback, which reduces secret
              sprawl but increases permanent lockout risk if device trust is
              lost.
            </Text>
            <Text style={themed($bodyText)}>
              Recovery backup helps key continuity, but only if the passphrase
              is stored separately and updated deliberately.
            </Text>
            <Text style={themed($bodyText)}>
              Sync is limited to one personal vault to keep state paths simple
              and reduce account-switching mistakes.
            </Text>
          </GlassSection>

          <GhostButton
            themed={themed}
            label="Back to Settings"
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

const $bodyText: ThemedStyle<TextStyle> = () => ({
  color: "#F3E7F8",
  lineHeight: 22,
  fontSize: 13,
});
