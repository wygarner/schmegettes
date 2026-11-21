import { Stack } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { type GameStats, type GameSummary, listGames } from "../lib/games";
import { money } from "../lib/money";
import { listMonth, listWhen, ordinal, PLACE_COLOR } from "../lib/placement";
import { isAnonymous } from "../lib/supabase";
import { Callout, Chip, EmptyState, Icon, MenuButton, MenuScreen, numbers, SectionLabel } from "../ui/menu";
import { SignInSheet } from "../ui/SignInSheet";
import { ACCENT, AMBER, BEVEL, FAINT, RED, SOFT, SURFACE } from "../ui/tokens";

type Load = "loading" | "error" | "ready";

/** /games: the player's past games, played or watched, newest first, 20 at a time. */
export function MyGames() {
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>("loading");
  const [games, setGames] = useState<GameSummary[]>([]);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const first = useCallback(async () => {
    setLoad("loading");
    const [page, anon] = await Promise.all([listGames(), isAnonymous().catch(() => false)]);
    setAnonymous(anon);
    if (!page.ok) return setLoad("error");
    setGames(page.data.items);
    setNext(page.data.nextCursor);
    setStats(page.data.stats);
    setLoad("ready");
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

  // An empty history: the empty state replaces the stats.
  const noHistory = games.length === 0;

  let body: React.ReactNode;
  if (load === "error") {
    body = (
      <EmptyState
        icon="warn"
        tint={AMBER}
        title="Couldn't load your games"
        action={
          <MenuButton kind="secondary" onClick={() => void first()}>
            Try again
          </MenuButton>
        }
      >
        Check your connection, then try again.
      </EmptyState>
    );
  } else if (load === "ready" && noHistory) {
    body = (
      <EmptyState
        icon="history"
        tint={SOFT}
        title="No games yet"
        action={
          <MenuButton trailing="arrow" onClick={() => navigate("/join")}>
            Join a game
          </MenuButton>
        }
      >
        Games you play or watch show up here, with everyone's scores.
      </EmptyState>
    );
  } else {
    body = (
      <>
        {stats && stats.played > 0 && <StatStrip stats={stats} />}
        {load === "loading" ? (
          <Skeleton withStats={stats === null} />
        ) : (
          <Stack gap={22}>
            <GameList games={games} onOpen={(id) => navigate(`/games/${id}`)} />
            {next && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <MenuButton kind="ghost" size="md" loading={more} onClick={() => void showMore()}>
                  Show more
                </MenuButton>
              </div>
            )}
          </Stack>
        )}
      </>
    );
  }

  return (
    <MenuScreen title="My games" back={{ label: "Home", to: "/" }}>
      {body}
      {anonymous && load === "ready" && games.length > 0 && (
        <div style={{ padding: "22px 16px 0" }}>
          <Callout
            tone="info"
            title="These games live on this phone"
            action={
              <MenuButton kind="secondary" size="sm" onClick={() => setSigningIn(true)}>
                Sign in to keep them
              </MenuButton>
            }
          >
            Played without an account. Sign in to keep them on any phone.
          </Callout>
        </div>
      )}
      <SignInSheet
        opened={signingIn}
        onClose={() => setSigningIn(false)}
        onSignedIn={() => {
          setSigningIn(false);
          void first();
        }}
      />
    </MenuScreen>
  );
}

function StatStrip({ stats }: { stats: GameStats }) {
  const tiles: [string, string, string][] = [
    ["Games", String(stats.games), "#fff"],
    ["Wins", String(stats.wins), ACCENT],
    ["Best", stats.best === null ? "—" : money(stats.best), stats.best !== null && stats.best < 0 ? RED : "#fff"],
  ];
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, margin: 0, padding: "0 16px 18px" }}>
      {tiles.map(([k, v, c]) => (
        <div key={k} className="sg-in" style={{ ...SURFACE, borderRadius: 20, padding: "14px 14px 12px", minWidth: 0 }}>
          <dt
            style={{ fontSize: 12, color: FAINT, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}
          >
            {k}
          </dt>
          <dd style={{ ...numbers(24), color: c, margin: "8px 0 0", whiteSpace: "nowrap" }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Skeleton({ withStats }: { withStats: boolean }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading your games" style={{ padding: "0 16px" }}>
      {withStats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="mn-skel" style={{ height: 76, borderRadius: 20 }} />
          ))}
        </div>
      )}
      <div className="mn-skel" style={{ width: 120, height: 12, borderRadius: 6, margin: "0 8px 12px" }} />
      <div className="mn-group" style={{ ...SURFACE, borderRadius: 22, overflow: "hidden" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 16px" }}>
            <div className="mn-skel" style={{ width: 48, height: 48, borderRadius: 14 }} />
            <div style={{ flex: 1 }}>
              <div className="mn-skel" style={{ width: "60%", height: 12, borderRadius: 6 }} />
              <div className="mn-skel" style={{ width: "85%", height: 10, borderRadius: 5, marginTop: 9 }} />
            </div>
            <div className="mn-skel" style={{ width: 54, height: 16, borderRadius: 6 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The games, grouped by the month they started in. */
function GameList({ games, onOpen }: { games: GameSummary[]; onOpen: (id: string) => void }) {
  const months: { month: string; games: GameSummary[] }[] = [];
  for (const g of games) {
    const month = listMonth(g.startedAt);
    const last = months[months.length - 1];
    if (last?.month === month) last.games.push(g);
    else months.push({ month, games: [g] });
  }
  return (
    <section aria-label="Your games">
      <Stack gap={22}>
        {months.map((m) => (
          <div key={m.month}>
            <SectionLabel>{m.month}</SectionLabel>
            <ol
              aria-label={m.month}
              className="mn-group"
              style={{
                listStyle: "none",
                margin: "0 16px",
                padding: 0,
                borderRadius: 22,
                overflow: "hidden",
                ...SURFACE,
              }}
            >
              {m.games.map((g) => (
                <li key={g.gameId}>
                  <GameRow game={g} onOpen={() => onOpen(g.gameId)} />
                </li>
              ))}
            </ol>
          </div>
        ))}
      </Stack>
    </section>
  );
}

function GameRow({ game, onOpen }: { game: GameSummary; onOpen: () => void }) {
  const watched = game.watched === true;
  const me = game.callerDisplayName;
  const place = game.placement ?? 0;
  const when = listWhen(game.startedAt);
  return (
    <button
      type="button"
      className="mn-row"
      onClick={onOpen}
      aria-label={`${when}${watched ? ", watched" : `, ${ordinal(place)}, ${money(game.score)}`}${game.status === "abandoned" ? ", unfinished" : ""}`}
      style={{
        all: "unset",
        boxSizing: "border-box",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "12px 14px 12px 12px",
        color: "#fff",
      }}
    >
      <span
        style={{
          width: 48,
          height: 48,
          flexShrink: 0,
          borderRadius: 14,
          display: "grid",
          placeItems: "center",
          background: watched ? "rgba(255,255,255,.05)" : "linear-gradient(180deg, #3b2075, #2a1754)",
          boxShadow: watched
            ? "inset 0 0 0 1px rgba(255,255,255,.08)"
            : `${BEVEL}${place === 1 ? ", 0 0 18px -2px rgba(107,255,179,.55)" : ""}`,
          color: watched ? FAINT : (PLACE_COLOR[place] ?? "#fff"),
        }}
      >
        {watched ? (
          <Icon name="eye" size={20} />
        ) : (
          <span style={numbers(19, { fontWeight: 700 })}>{ordinal(place)}</span>
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontSize: 15,
              fontWeight: 650,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {when}
          </span>
        </span>
        <span
          style={{
            display: "block",
            fontSize: 13,
            color: FAINT,
            marginTop: 3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {game.status === "abandoned" && (
            <span style={{ marginRight: 6 }}>
              <Chip tone="warn">Unfinished</Chip>
            </span>
          )}
          {watched && (
            <span style={{ marginRight: 6 }}>
              <Chip>Watched</Chip>
            </span>
          )}
          {game.players.map((p, i) => {
            const you = p === me;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: names can repeat ("Former player")
              <span key={i}>
                {i > 0 && ", "}
                <span
                  style={{
                    color: you ? "#ece4ff" : undefined,
                    fontWeight: you ? 600 : undefined,
                    fontStyle: p === "Former player" ? "italic" : undefined,
                  }}
                >
                  {you ? "You" : p}
                </span>
              </span>
            );
          })}
        </span>
      </span>
      {!watched && (
        <span style={{ ...numbers(19), color: game.score < 0 ? RED : ACCENT, whiteSpace: "nowrap" }}>
          {money(game.score)}
        </span>
      )}
      <span style={{ color: FAINT, marginLeft: -4 }}>
        <Icon name="right" size={18} />
      </span>
    </button>
  );
}
