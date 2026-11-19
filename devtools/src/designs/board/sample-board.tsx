import { Alert, Box, Button, Group, MantineProvider, Modal, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";

// PROTOTYPE — sample of the format /designer produces. Mock data inline, no API calls.
const theme = {
  primaryColor: "boardBlue",
  colors: {
    boardBlue: [
      "#e8eaff",
      "#c9cdf7",
      "#a5abee",
      "#7f87e6",
      "#5f68df",
      "#4a53da",
      "#3f48d9",
      "#3139c1",
      "#2932ad",
      "#060ce9",
    ] as const,
  },
  headings: { fontFamily: "Oswald, Impact, sans-serif" },
};

const CATEGORIES = ["WORLD CAPITALS", "SCIENCE", "BEFORE & AFTER", "POP MUSIC", "3-LETTER WORDS"];
const VALUES = [200, 400, 600, 800, 1000];

export default function SampleBoard() {
  const [played, setPlayed] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<{ category: string; value: number } | null>(null);

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Stack>
        <Alert color="yellow" title="PROTOTYPE — not production code" />
        <Title order={2}>Single round</Title>
        <SimpleGrid cols={5} spacing={4}>
          {CATEGORIES.map((c) => (
            <Box key={c} bg="boardBlue.9" p="sm" ta="center">
              <Text fw={700} c="white" size="sm">
                {c}
              </Text>
            </Box>
          ))}
          {VALUES.flatMap((v) =>
            CATEGORIES.map((c) => {
              const key = `${c}-${v}`;
              const done = played.has(key);
              return (
                <Button
                  key={key}
                  h={64}
                  radius={0}
                  color="boardBlue.9"
                  disabled={done}
                  onClick={() => setOpen({ category: c, value: v })}
                >
                  <Text fw={800} c="yellow.4" size="xl">
                    {done ? "" : `$${v}`}
                  </Text>
                </Button>
              );
            }),
          )}
        </SimpleGrid>
        <Modal opened={open !== null} onClose={() => setOpen(null)} title={open?.category} size="lg" centered>
          <Stack>
            <Text size="xl">This clue text appears once the clue is revealed.</Text>
            <Group>
              <Button
                onClick={() => {
                  if (open) setPlayed(new Set(played).add(`${open.category}-${open.value}`));
                  setOpen(null);
                }}
              >
                Mark played
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </MantineProvider>
  );
}
