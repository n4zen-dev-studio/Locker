import { useCallback, useEffect, useMemo, useState } from "react";
import { Dimensions, Pressable, TextStyle, useWindowDimensions, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

import { Text } from "@/components/Text";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { Ionicons } from '@expo/vector-icons'

import { formatVaultDate, VaultListItem } from "./vaultUi";

type VaultStackCarouselProps = {
  items: VaultListItem[];
  reducedMotion?: boolean;
  emptyLabel: string;
  onOpenItem: (item: VaultListItem) => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);


function getVaultIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "note":
      return "document-text-outline";
    case "image":
      return "image-outline";
    case "pdf":
      return "document-attach-outline"; // closest match
    case "file":
    case "doc":
      return "document-outline";
    case "voice":
      return "mic-outline";
    default:
      return "document-outline";
  }
}

export function VaultStackCarousel(props: VaultStackCarouselProps) {
  const { items, reducedMotion, emptyLabel, onOpenItem } = props;
  const { themed } = useAppTheme();
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexSv = useSharedValue(0);
  const dragX = useSharedValue(0);
  const openingIndex = useSharedValue(-1);
  const openProgress = useSharedValue(0);

  useEffect(() => {
    if (items.length === 0) {
      setActiveIndex(0);
      activeIndexSv.value = 0;
      return;
    }

    if (activeIndex > items.length - 1) {
      const next = Math.max(0, items.length - 1);
      setActiveIndex(next);
      activeIndexSv.value = next;
    }
  }, [activeIndex, activeIndexSv, items.length]);

  const snapTo = useCallback(
    (nextIndex: number) => {
      if (items.length === 0) return;
      const clamped = Math.max(0, Math.min(nextIndex, items.length - 1));
      setActiveIndex(clamped);
      dragX.value = withSpring(0, { damping: 24, stiffness: 240 });
      activeIndexSv.value = withSpring(clamped, {
        damping: 22,
        stiffness: 220,
        mass: 0.9,
      });
    },
    [activeIndexSv, dragX, items.length],
  );

  const handlePress = useCallback(
    (item: VaultListItem, index: number) => {
      if (index !== activeIndex) {
        snapTo(index);
        return;
      }

      if (reducedMotion) {
        onOpenItem(item);
        return;
      }

      openingIndex.value = index;
      openProgress.value = 0;
      openProgress.value = withTiming(
        1,
        {
          duration: 220,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
        },
        (finished) => {
          if (finished) {
            runOnJS(onOpenItem)(item);
            openingIndex.value = -1;
            openProgress.value = 0;
          }
        },
      );
    },
    [activeIndex, onOpenItem, openProgress, openingIndex, reducedMotion, snapTo],
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(items.length > 1)
        .onUpdate((event) => {
          dragX.value = event.translationX;
        })
        .onEnd((event) => {
          const threshold = width * 0.14;
          const velocityThreshold = 620;
          let nextIndex = activeIndex;

          if (event.translationX < -threshold || event.velocityX < -velocityThreshold) {
            nextIndex = activeIndex + 1;
          } else if (event.translationX > threshold || event.velocityX > velocityThreshold) {
            nextIndex = activeIndex - 1;
          }

          runOnJS(snapTo)(nextIndex);
        }),
    [activeIndex, dragX, items.length, snapTo, width],
  );

  const renderedItems = useMemo(() => {
    if (items.length <= 5) {
      return items.map((item, index) => ({ item, index }));
    }

    return items
      .map((item, index) => ({ item, index }))
      .filter(({ index }) => Math.abs(index - activeIndex) <= 2);
  }, [activeIndex, items]);

  if (items.length === 0) {
    return (
      <View style={themed($emptyCard)}>
        <Text style={themed($emptyText)}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView>
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(320)} style={themed($stack)}>
    
{/* <View style={{height: 60}}/> */}
<View style={themed($metaRow)}>
        <Text style={themed($metaText)}>
          Card {activeIndex + 1} / {items.length}
        </Text>
        <View style={themed($navRow)}>
          <NavButton label="Prev" disabled={activeIndex === 0} onPress={() => snapTo(activeIndex - 1)} />
          <NavButton
            label="Next"
            disabled={activeIndex === items.length - 1}
            onPress={() => snapTo(activeIndex + 1)}
          />
        </View>
      </View>
      <GestureDetector gesture={gesture}>
        <View style={themed($deckShell)}>
          {renderedItems.map(({ item, index }) => (
            <StackCard
              key={item.id}
              item={item}
              index={index}
              activeIndex={activeIndex}
              activeIndexSv={activeIndexSv}
              dragX={dragX}
              openingIndex={openingIndex}
              openProgress={openProgress}
              cardWidth={Math.min(width - 128, 340)}
              onPress={handlePress}
            />
          ))}
        </View>
      </GestureDetector>

        {/* <View style={themed($metaRow)}>
        <Text style={themed($metaText)}>
          Card {activeIndex + 1} / {items.length}
        </Text>
        <View style={themed($navRow)}>
          <NavButton label="Prev" disabled={activeIndex === 0} onPress={() => snapTo(activeIndex - 1)} />
          <NavButton
            label="Next"
            disabled={activeIndex === items.length - 1}
            onPress={() => snapTo(activeIndex + 1)}
          />
        </View>
      </View> */}
    </Animated.View>
    </GestureHandlerRootView>
  );
}

type StackCardProps = {
  item: VaultListItem;
  index: number;
  activeIndex: number;
  activeIndexSv: SharedValue<number>;
  dragX: SharedValue<number>;
  openingIndex: SharedValue<number>;
  openProgress: SharedValue<number>;
  cardWidth: number;
  onPress: (item: VaultListItem, index: number) => void;
};

function StackCard(props: StackCardProps) {
  const { item, index, activeIndex, activeIndexSv, dragX, openingIndex, openProgress, cardWidth, onPress } = props;
  const { themed } = useAppTheme();
  const isActive = index === activeIndex;

  const animatedStyle = useAnimatedStyle(() => {
    const relative = index - activeIndexSv.value - dragX.value / Math.max(cardWidth, 1);
    const opening = openingIndex.value === index ? openProgress.value : 0;
    const translateX = interpolate(
      relative,
      [-2, -1, 0, 1, 2],
      [-cardWidth * 0.46, -cardWidth * 0.18, 0, cardWidth * 0.18, cardWidth * 0.38],
      Extrapolation.CLAMP,
    );
    const translateY = interpolate(relative, [-2, -1, 0, 1, 2], [36, 18, 0, 18, 38], Extrapolation.CLAMP);
    const scale = interpolate(relative, [-2, -1, 0, 1, 2], [0.84, 0.92, 1, 0.95, 0.88], Extrapolation.CLAMP);
    const opacity = interpolate(relative, [-2, -1, 0, 1, 2], [0.22, 0.54, 1, 0.56, 0.24], Extrapolation.CLAMP);
    const rotate = `${interpolate(relative, [-2, -1, 0, 1, 2], [-7, -4, 0, 4, 7], Extrapolation.CLAMP)}deg`;

    return {
      opacity: interpolate(opening, [0, 1], [opacity, 1]),
      transform: [
        { translateX: interpolate(opening, [0, 1], [translateX, 0]) },
        { translateY: interpolate(opening, [0, 1], [translateY, -18]) },
        { scale: interpolate(opening, [0, 1], [scale, 1.04]) },
        { rotate: opening > 0.001 ? "0deg" : rotate },
      ],
      zIndex: 40 - Math.abs(index - Math.round(activeIndexSv.value)),
    };
  });

  return (
    <AnimatedPressable style={[themed($cardShell), { width: cardWidth }, animatedStyle]} onPress={() => onPress(item, index)}>
      <LinearGradient
        colors={
          isActive
            ? ["rgba(121, 72, 156, 0.55)", "rgba(144, 64, 116, 0.18)", "rgba(13, 12, 18, 0.92)"]
            : ["rgba(255,255,255,0.08)", "rgba(28, 26, 34, 0.08)", "rgba(13, 12, 18, 0.84)"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={themed($cardGradient)}
      >
        <View style={themed($statusStub)} />

        <View style={themed($cardHeader)}>
          <View style={themed($cardCopy)}>
            <Text preset="bold" style={themed($cardTitle)} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={themed($cardSubtitle)}>{formatVaultDate(item.updatedAt)}</Text>
          </View>
          <Capsule label={item.type} active={isActive} />
        </View>

        <View style={themed($orbWrap)}>
          <View style={themed($orbOuter)}>
           <View style={themed($orbInner)}>
  <Ionicons
    name={getVaultIcon(item.type)}
    size={42}
    color="rgba(255,255,255,0.9)"
    style={{alignSelf:'center', justifyContent: 'center', alignItems: 'center', paddingTop: 40}}
  />
</View>
          </View>
          <Text preset="bold" style={themed($focusTitle)}>
            {item.classification}
          </Text>
          <Text style={themed($focusMeta)}>
            {item.syncStatus === "cloud" ? "Cloud-linked item" : "Local-only item"}
          </Text>
        </View>

        <View style={themed($infoBand)}>
          <Capsule label={item.syncStatus} active />
          <Capsule label={item.classification} />
        </View>

        <Text style={themed($preview)} numberOfLines={3}>
          {item.preview || "No preview available"}
        </Text>
      </LinearGradient>
    </AnimatedPressable>
  );
}

function NavButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { themed } = useAppTheme();

  return (
    <Pressable onPress={onPress} disabled={disabled} style={themed([$navButton, disabled && $navButtonDisabled])}>
      <Text style={themed(disabled ? $navButtonTextDisabled : $navButtonText)}>{label}</Text>
    </Pressable>
  );
}

function Capsule({ label, active = false }: { label: string; active?: boolean }) {
  const { themed } = useAppTheme();

  return (
    <View style={themed([$capsule, active && $capsuleActive])}>
      <Text style={themed(active ? $capsuleTextActive : $capsuleText)}>{label.toUpperCase()}</Text>
    </View>
  );
}

const $stack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
});

const $metaRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: spacing.md,
});

const $metaText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontFamily: typography.primary.medium,
  fontSize: 12,
});

const $navRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
});

const $navButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 999,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs + 2,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $navButtonDisabled: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.42,
});

const $navButtonText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
});

const $navButtonTextDisabled: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontFamily: typography.primary.medium,
  fontSize: 12,
});

const $deckShell: ThemedStyle<ViewStyle> = () => ({
  height: Dimensions.get('screen').height* 0.5,
  alignItems: "center",
  justifyContent: "center",
});

const $cardShell: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  height: Dimensions.get('screen').height* 0.5,
  borderRadius: 34,
  overflow: "hidden",
  backgroundColor: colors.vaultHub.vaultHubCard,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  shadowColor: "#000000",
  shadowOpacity: 0.44,
  shadowRadius: 28,
  shadowOffset: { width: 0, height: 18 },
  elevation: 20,
});

const $cardGradient: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  paddingBottom: spacing.lg,
});

const $statusStub: ThemedStyle<ViewStyle> = () => ({
  alignSelf: "center",
  width: 124,
  height: 10,
  borderRadius: 999,
  marginBottom: 25,
  backgroundColor: "rgba(0,0,0,0.46)",
});

const $cardHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: spacing.md,
});

const $cardCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  gap: spacing.xs,
});

const $cardTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 28,
  lineHeight: 32,
});

const $cardSubtitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.7)",
  fontSize: 16,
});

const $orbWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.md,
  paddingTop: spacing.lg,
});

const $orbOuter: ThemedStyle<ViewStyle> = () => ({
  width: 166,
  height: 166,
  borderRadius: 83,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(15, 15, 20, 0.76)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.06)",
});

const $orbInner: ThemedStyle<ViewStyle> = () => ({
  width: 126,
  height: 126,
  borderRadius: 63,
  backgroundColor: "rgba(114, 95, 95, 0.07)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.03)",
});

const $focusTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 20,
});

const $focusMeta: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255, 214, 90, 0.92)",
  fontSize: 15,
});

const $infoBand: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  gap: spacing.sm,
  marginTop: spacing.lg,
});

const $capsule: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 999,
  paddingHorizontal: spacing.sm,
  paddingVertical: 6,
  backgroundColor: "rgba(0,0,0,0.22)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $capsuleActive: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255, 77, 186, 0.14)",
  borderColor: "rgba(255, 154, 219, 0.48)",
});

const $capsuleText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontFamily: typography.primary.medium,
  fontSize: 10,
});

const $capsuleTextActive: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  fontSize: 10,
});

const $preview: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  textAlign: "center",
  lineHeight: 22,
  marginTop: spacing.lg,
});

const $emptyCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 24,
  padding: spacing.lg,
  backgroundColor: colors.vaultHub.vaultHubSurface,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $emptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
});
