import { Button, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { type CSSProperties, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { RoomState } from "../lib/room";
import { Icon } from "./menu";
import { Sheet } from "./Sheet";
import { DISPLAY, QUIET, SOFT } from "./tokens";

/** Who is leaving mid-game: it changes what the confirmation says will happen. */
export type HomeConfirm = "contestant" | "host";

const LEAVE_TEXT: Record<HomeConfirm, string> = {
  contestant: "Your score stays. You can rejoin from Home.",
  host: "The game pauses for everyone until you rejoin from Home.",
};

/**
 * The way back to Home from every screen but Home (navigation feature brief). Going Home never
 * leaves the room: the page unmounts, its socket closes, and Home's card offers Rejoin. During
 * a game (`confirm`) it asks first. `disabled` while this player is answering, so leaving can't
 * dodge a wrong answer. `floating` pins it to the top-left of the viewport, for screens with no
 * header of their own.
 */
export function HomeButton({
  confirm,
  disabled = false,
  floating = false,
}: {
  confirm?: HomeConfirm;
  disabled?: boolean;
  floating?: boolean;
}) {
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);

  // The game ended (or never started) while the question was open: nothing left to confirm.
  useEffect(() => {
    if (!confirm) setAsking(false);
  }, [confirm]);

  const position: CSSProperties = floating
    ? {
        position: "fixed",
        top: "max(4px, env(safe-area-inset-top))",
        left: "max(4px, env(safe-area-inset-left))",
        zIndex: 200,
      }
    : {};

  return (
    <>
      <Tooltip label={disabled ? "After your answer" : "Home"} openDelay={400}>
        <UnstyledButton
          aria-label="Home"
          aria-disabled={disabled || undefined}
          onClick={() => {
            if (disabled) return;
            if (confirm) setAsking(true);
            else navigate("/");
          }}
          style={{
            ...position,
            width: 44,
            height: 44,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            borderRadius: 999,
            color: QUIET,
            opacity: disabled ? 0.35 : 1,
            cursor: disabled ? "default" : "pointer",
          }}
        >
          <Icon name="home" size={20} />
        </UnstyledButton>
      </Tooltip>
      {confirm && (
        <Sheet
          opened={asking}
          onClose={() => setAsking(false)}
          bottom={confirm === "contestant"}
          label="Leave the game?"
        >
          <Stack gap="sm" align="stretch" ta="center">
            <div style={{ color: SOFT, display: "grid", placeItems: "center" }}>
              <Icon name="home" size={28} />
            </div>
            <Text ff={DISPLAY} fw={600} fz={28} lh={1.15}>
              Leave the game?
            </Text>
            <Text c={SOFT}>{LEAVE_TEXT[confirm]}</Text>
            <Button color="red" size="lg" radius="xl" onClick={() => navigate("/")}>
              Leave game
            </Button>
            <Button variant="subtle" color="gray" size="lg" radius="xl" onClick={() => setAsking(false)}>
              Stay
            </Button>
          </Stack>
        </Sheet>
      )}
    </>
  );
}

/**
 * Whether the room is in a game in progress (Home asks first): from building the board until
 * the end-of-game scoreboard, paused included. Not the lobby, and not once the results are up.
 */
export function inGame(state: Pick<RoomState, "phase" | "results">): boolean {
  return state.phase !== "lobby" && state.phase !== "finished" && !state.results;
}

/** Whether this player is answering a clue right now (Home is dimmed: no dodging a wrong answer). */
export function answering(state: Pick<RoomState, "phase" | "answeringUserId">, userId: string): boolean {
  return state.phase === "answering" && state.answeringUserId === userId;
}
