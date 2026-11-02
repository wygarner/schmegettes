import { Box, Center, Stack, Text, Title } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { ReactNode } from "react";

/**
 * The host screen, designed for an iPhone in landscape (844 × 390; no scrolling from
 * 667 × 320) and mirrored to the TV: the stage on the left, the player column on the right,
 * inside the notch's safe areas. Held upright on a phone, it asks to be turned sideways;
 * the game keeps running underneath.
 */
export function HostLayout({ stage, column }: { stage: ReactNode; column: ReactNode }) {
  const upright = useMediaQuery("(orientation: portrait) and (max-width: 600px)");
  return (
    <Box
      h="100dvh"
      w="100%"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) clamp(180px, 28vw, 280px)",
        gap: 8,
        overflow: "hidden",
        padding:
          "max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left))",
      }}
    >
      <Box style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>{stage}</Box>
      <Stack gap={8} style={{ minWidth: 0, minHeight: 0 }} aria-label="Players">
        {column}
      </Stack>
      {upright && (
        <Center
          role="dialog"
          aria-label="Turn your phone sideways"
          bg="dark.8"
          p="md"
          style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000 }}
        >
          <Stack align="center" gap="xs" ta="center">
            <Text fz={48}>↻</Text>
            <Title order={2}>Turn your phone sideways</Title>
          </Stack>
        </Center>
      )}
    </Box>
  );
}
