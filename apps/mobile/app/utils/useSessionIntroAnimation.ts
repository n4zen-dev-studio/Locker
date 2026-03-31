import { useRef } from "react";

const seenIntroKeys = new Set<string>();

export function useSessionIntroAnimation(key: string, enabled = true) {
  const shouldAnimateRef = useRef<boolean | null>(null);

  if (shouldAnimateRef.current === null) {
    const shouldAnimate = enabled && !seenIntroKeys.has(key);
    shouldAnimateRef.current = shouldAnimate;

    if (shouldAnimate) {
      seenIntroKeys.add(key);
    }
  }

  return enabled ? shouldAnimateRef.current : false;
}
