import { Anchor, Container, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { type GameDetail, gameDetail } from "../lib/games";
import { money } from "../lib/money";
import { detailWhen, ordinal, PLACE_COLOR } from "../lib/placement";
import { DISPLAY, PHONE_BG, RED, SOFT } from "../ui/tokens";

type Load = { kind: "loading" } | { kind: "missing" } | { kind: "error" } | { kind: "ready"; game: GameDetail };

/** /games/:gameId: one past game's scoreboard, for anyone who played or watched it. */
export function GameScoreboard() {
  const { gameId = "" } = useParams();
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    void (async () => {
      const result = await gameDetail(gameId);
      if (!live) return;
      if (result.ok) setLoad({ kind: "ready", game: result.data });
      else setLoad({ kind: result.notFound ? "missing" : "error" });
    })();
    return () => {
      live = false;
    };
  }, [gameId]);

  return (
    <div style={{ minHeight: "100dvh", background: PHONE_BG, color: "#fff" }}>
      <Container size="xs" py="lg">
        <Anchor component={Link} to="/games" size="sm" c="slate.2">
          ‹ My games
        </Anchor>
        {load.kind === "loading" && (
          <Group justify="center" mt="xl">
            <Loader color="green.4" />
          </Group>
        )}
        {load.kind === "missing" && <Text mt="xl">This game isn't in your history.</Text>}
        {load.kind === "error" && <Text mt="xl">Couldn't load this game. Try again.</Text>}
        {load.kind === "ready" && <Board game={load.game} />}
      </Container>
    </div>
  );
}

function Board({ game }: { game: GameDetail }) {
  const unfinished = game.status === "abandoned";
  return (
    <Stack gap="xs" mt="md">
      <Text c={SOFT} size="sm">
        {detailWhen(game.startedAt, game.finishedAt)}
      </Text>
      {game.hostDisplayName && (
        <Title order={1} ff={DISPLAY} fw={700} fz={30}>
          Hosted by {game.hostDisplayName}
        </Title>
      )}
      {unfinished && (
        <Text size="sm" c="orange.3" p="xs" style={{ border: "1px solid rgba(255,169,77,.4)", borderRadius: 10 }}>
          Unfinished: these are the scores when the room closed.
        </Text>
      )}
      {game.watched && (
        <Text size="sm" c={SOFT}>
          You watched this game.
        </Text>
      )}
      <ol
        aria-label="Scoreboard"
        style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}
      >
        {game.results
          // Results have no id, and two former players can share a name and score: key by position.
          .map((r, i) => ({ r, key: `row-${i}` }))
          .map(({ r, key }) => {
            const former = r.displayName === "Former player";
            return (
              <li
                key={key}
                aria-current={r.isCaller ? "true" : undefined}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: r.isCaller ? "rgba(148,255,148,.1)" : "rgba(255,255,255,.04)",
                  border: r.isCaller ? "1px solid rgba(148,255,148,.4)" : "1px solid transparent",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <span style={{ width: 38, fontWeight: 800, color: PLACE_COLOR[r.placement] ?? "#8fc7a0" }}>
                    {ordinal(r.placement)}
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontStyle: former ? "italic" : undefined,
                      color: former ? "var(--mantine-color-dimmed)" : undefined,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.displayName}
                    {r.isCaller && <span style={{ fontWeight: 500, color: SOFT }}> (you)</span>}
                  </span>
                  {r.placement === 1 && !unfinished && <span>🏆</span>}
                </span>
                <span
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 600,
                    fontSize: 20,
                    color: r.score < 0 ? RED : "var(--mantine-color-green-4)",
                  }}
                >
                  {money(r.score)}
                </span>
              </li>
            );
          })}
      </ol>
    </Stack>
  );
}
