import { CloseButton, Group, Text } from "@mantine/core";
import { useState } from "react";
import { needsHomeScreenTip } from "../lib/fullscreen";
import { SOFT } from "./tokens";

// Dismissed for good on this device. Storage can be missing or blocked (private windows), so
// reads and writes are guarded; without storage the tip just shows again next time.
const KEY = "schmegettes.homeScreenTip.dismissed";

function dismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * iPhone and iPad Safari can't hide their toolbar from a page; the Home Screen app opens full
 * screen. A slim banner in the host lobby says so. Rules:
 * docs/product-docs/features/lobby/feature-brief.md, "Full screen on iPhone and iPad".
 */
export function HomeScreenTip() {
  const [show, setShow] = useState(() => needsHomeScreenTip() && !dismissed());
  if (!show) return null;
  return (
    <Group
      role="note"
      aria-label="Full screen tip"
      wrap="nowrap"
      gap={6}
      mb={4}
      px={10}
      py={4}
      style={{ borderRadius: 8, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)" }}
    >
      <Text size="xs" c={SOFT} lh={1.25} lineClamp={2} style={{ flex: 1, minWidth: 0 }}>
        ⤴ <b>For full screen, add Schmegettes to your Home Screen:</b> tap Share, then Add to Home Screen.
      </Text>
      <CloseButton
        size="sm"
        aria-label="Hide this tip"
        onClick={() => {
          try {
            window.localStorage.setItem(KEY, "1");
          } catch {
            // Not remembered: it shows again next visit.
          }
          setShow(false);
        }}
      />
    </Group>
  );
}
