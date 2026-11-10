import { Anchor, Badge, Button, Container, Group, Loader, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { type GameSummary, listGames } from "../lib/games";
import { money } from "../lib/money";
import { listWhen, ordinal, PLACE_COLOR } from "../lib/placement";
import { isAnonymous } from "../lib/supabase";
import { GoldButton } from "../ui/GoldButton";
import { BEVEL, CELL, DISPLAY, PHONE_BG, RED, SOFT } from "../ui/tokens";

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready" };

/** /games: the player's past games, played or watched, newest first, 20 at a time. */
export function MyGames() {
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [games, setGames] = useState<GameSummary[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [anonymous, setAnonymous] = useState(false);

  const first = useCallback(async () => {
    setLoad({ kind: "loading" });
    const [page, anon] = await Promise.all([listGames(), isAnonymous().catch(() => false)]);
    setAnonymous(anon);
    if (!page.ok) return setLoad({ kind: "error" });
    setGames(page.data.items);
    setNext(page.data.nextCursor);
    setLoad({ kind: "ready" });
  }, []);

  useEffect(() => {
    void first();
  }, [first]);

  async function showMore() {
    if (!next || more) return;
    setMore(true);
    const page = await listGames(next);
    setMore(false);
    if (!page.ok) return;
    setGames((g) => [...g, ...page.data.items]);
    setNext(page.data.nextCursor);
  }

  let body: React.ReactNode;
  if (load.kind === "loading") {
    body = (
      <Group justify="center" mt="xl">
        <Loader color="yellow.4" />
      </Group>
    );
  } else if (load.kind === "error") {
    body = (
      <Stack align="center" mt="xl" gap="sm">
        <Text>Couldn't load your games. Try again.</Text>
        <Button variant="light" onClick={() => void first()}>
          Try again
        </Button>
      </Stack>
    );
  } else if (games.length === 0) {
    body = (
      <Stack align="center" ta="center" mt={64} gap="sm">
        <Text fz={44}>🎲</Text>
        <Text fw={700} size="lg">
          No games yet
        </Text>
        <Text size="sm" c={SOFT} maw={260}>
          Games you play or watch show up here, with everyone's scores.
        </Text>
        <GoldButton onClick={() => navigate("/join")}>Join a game</GoldButton>
      </Stack>
    );
  } else {
    body = (
      <Stack gap={8}>
        <ol
          aria-label="Your games"
          style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}
        >
          {games.map((g) => (
            <li key={g.gameId}>
              <GameRow game={g} onOpen={() => navigate(`/games/${g.gameId}`)} />
            </li>
          ))}
        </ol>
        {next && (
          <Button variant="subtle" loading={more} onClick={() => void showMore()}>
            Show more
          </Button>
        )}
      </Stack>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: PHONE_BG, color: "#fff" }}>
      <Container size="xs" py="lg">
        <Group justify="space-between" mb="md">
          <Title order={1} ff={DISPLAY} fw={700} fz={34}>
            My games
          </Title>
          <Anchor component={Link} to="/" size="sm" c="boardBlue.2">
            Home
          </Anchor>
        </Group>
        {body}
        {anonymous && load.kind === "ready" && games.length > 0 && (
          <Text size="xs" c="dimmed" ta="center" mt="md">
            Played without an account. Link Google or email to keep these if you switch phones.
          </Text>
        )}
      </Container>
    </div>
  );
}

function GameRow({ game, onOpen }: { game: GameSummary; onOpen: () => void }) {
  const watched = game.watched === true;
  const me = game.callerDisplayName;
  const players = game.players.map((p) => (p === me ? "You" : p)).join(", ");
  return (
    <UnstyledButton
      onClick={onOpen}
      aria-label={`${listWhen(game.startedAt)}${watched ? ", watched" : `, ${ordinal(game.placement ?? 0)}, ${money(game.score)}`}${game.status === "abandoned" ? ", unfinished" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "10px 12px",
        borderRadius: 14,
        background: "rgba(255,255,255,.05)",
        border: "1px solid rgba(255,255,255,.07)",
        color: "#fff",
      }}
    >
      <span
        style={{
          width: 46,
          height: 46,
          flexShrink: 0,
          borderRadius: 12,
          background: watched ? "rgba(255,255,255,.06)" : CELL,
          boxShadow: watched ? "none" : BEVEL,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: watched ? 10 : 18,
          letterSpacing: watched ? ".06em" : 0,
          color: watched ? "#a5abee" : (PLACE_COLOR[game.placement ?? 0] ?? "#fff"),
        }}
      >
        {watched ? "WATCHED" : ordinal(game.placement ?? 0)}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Text fw={700} size="sm">
            {listWhen(game.startedAt)}
          </Text>
          {game.status === "abandoned" && (
            <Badge size="xs" color="gray" variant="outline">
              Unfinished
            </Badge>
          )}
        </span>
        <Text size="xs" c={SOFT} truncate="end">
          {players}
        </Text>
      </span>
      {!watched && (
        <Text ff={DISPLAY} fw={600} fz={18} c={game.score < 0 ? RED : "yellow.4"}>
          {money(game.score)}
        </Text>
      )}
      <Text c="dimmed" aria-hidden>
        ›
      </Text>
    </UnstyledButton>
  );
}
