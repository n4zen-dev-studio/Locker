import { Dimensions, LayoutChangeEvent, Pressable, ScrollView, TextStyle, View, ViewStyle } from "react-native";
import Animated, { FadeInUp, LinearTransition } from "react-native-reanimated";

import { Text } from "@/components/Text";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";

import { VaultFilterRail } from "./VaultFilterRail";
import { VaultListView } from "./VaultListView";
import { VaultStackCarousel } from "./VaultStackCarousel";
import { VaultViewToggle } from "./VaultViewToggle";
import { VaultFilter, VaultListItem, VaultSort, VaultViewMode } from "./vaultUi";

type VaultSectionProps = {
  filter: VaultFilter;
  items: VaultListItem[];
  sort: VaultSort;
  viewMode: VaultViewMode;
  animateOnMount?: boolean;
  reducedMotion?: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  onChangeFilter: (filter: VaultFilter) => void;
  onChangeViewMode: (mode: VaultViewMode) => void;
  onSortCycle: () => void;
  onOpenItem: (item: VaultListItem) => void;
};

export function VaultSection(props: VaultSectionProps) {
  const {
    animateOnMount = true,
    filter,
    items,
    sort,
    viewMode,
    reducedMotion,
    onLayout,
    onChangeFilter,
    onChangeViewMode,
    onSortCycle,
    onOpenItem,
  } =
    props;
  const { themed } = useAppTheme();
  const emptyLabel = filter === "deleted" ? "Trash is empty." : "No matching vault items yet.";

  return (
    <Animated.View
      onLayout={onLayout}
      entering={reducedMotion || !animateOnMount ? undefined : FadeInUp.delay(120).duration(360)}
      layout={LinearTransition.springify().damping(20).stiffness(180)}
      style={themed($section)}
    >
      <View style={themed($header)}>
        <View style={themed($headerCopy)}>
          <Text preset="bold" style={themed($title)}>
            Contents
          </Text>
          <Text style={themed($meta)}>
            {items.length} item{items.length === 1 ? "" : "s"} ready
          </Text>
        </View>

        <View style={themed($controls)}>
          <Pressable onPress={onSortCycle} style={themed($sortPill)}>
            <Text style={themed($sortText)}>Sort: {sort}</Text>
          </Pressable>
          <VaultViewToggle mode={viewMode} onChangeMode={onChangeViewMode} />
        </View>
      </View>

      <View style={themed($workspace)}>
        <VaultFilterRail filter={filter} onChangeFilter={onChangeFilter} reducedMotion={reducedMotion} />
        <Animated.View layout={LinearTransition.springify().damping(22).stiffness(190)} style={themed($content)}>
          {viewMode === "stack" ? (
            <VaultStackCarousel items={items} reducedMotion={reducedMotion} emptyLabel={emptyLabel} onOpenItem={onOpenItem} />
          ) : (
            // <ScrollView scrollEnabled={true} pointerEvents="auto" showsVerticalScrollIndicator={false}>
              <VaultListView items={items} reducedMotion={reducedMotion} emptyLabel={emptyLabel} onOpenItem={onOpenItem} />

            // </ScrollView>

          )}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  height: Dimensions.get('screen').height * 0.78
});

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  // flexDirection: "column",
  // justifyContent: "space-between",
  alignItems: "center",
  gap: spacing.md,
});

const $headerCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
});

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
});

const $meta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  marginTop: 4,
  fontSize: 12,
});

const $controls: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
});

const $sortPill: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 999,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs + 2,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $sortText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
});

const $workspace: ThemedStyle<ViewStyle> = () => ({
  position: "relative",
});

const $content: ThemedStyle<ViewStyle> = () => ({
  paddingLeft: 74,
  minHeight: 420,
});
