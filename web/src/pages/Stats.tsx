import { Stack } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { type Account, currentAccount } from "../lib/account";
import { money } from "../lib/money";
import { getLeaderboard, getMyStats, type Leaderboard as LeaderboardData, type MyStats } from "../lib/stats";
import { EmptyState, MenuButton, MenuScreen, numbers, SectionLabel } from "../ui/menu";
import { SignInSheet } from "../ui/SignInSheet";
import { AMBER, FAINT, LINE, QUIET, SOFT, SURFACE } from "../ui/tokens";

type Load =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "no-games" }
  | { kind: "error" }
  | { kind: "stats"; data: MyStats }
  | { kind: "leaderboard"; data: LeaderboardData };

/** /stats and /stats/leaderboard: phone-only all-time results. */
export function Stats() {
  const leaderboardTab = useLocation().pathname.endsWith("/leaderboard");
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [signingIn, setSigningIn] = useState(false);

  const refresh = useCallback(async () => {
    setLoad({ kind: "loading" });
    const account: Account | null = await currentAccount();
    if (account?.kind === "guest") return setLoad({ kind: "guest" });
    if (!account) return setLoad({ kind: "error" });
    if (leaderboardTab) {
      const result = await getLeaderboard();
      if (result.kind === "ok") setLoad({ kind: "leaderboard", data: result.data });
      else setLoad({ kind: result.kind });
    } else {
      const result = await getMyStats();
      if (result.kind === "ok") setLoad({ kind: "stats", data: result.data });
      else setLoad({ kind: "error" });
    }
  }, [leaderboardTab]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  let body: React.ReactNode;
  if (load.kind === "loading") body = <Skeleton />;
  else if (load.kind === "guest") {
    body = (
      <EmptyState
        icon="user"
        tint="#c9b3f9"
        title="Sign in to see your stats and the leaderboard."
        action={<MenuButton onClick={() => setSigningIn(true)}>Sign in</MenuButton>}
      />
    );
  } else if (load.kind === "error") {
    body = (
      <EmptyState
        icon="warn"
        tint={AMBER}
        title="Couldn't load stats. Try again."
        action={<MenuButton onClick={() => void refresh()}>Retry</MenuButton>}
      />
    );
  } else if (load.kind === "no-games") {
    body = <NoGames leaderboard />;
  } else if (load.kind === "stats") {
    body = load.data.games === 0 ? <NoGames /> : <You data={load.data} />;
  } else {
    body = <Leaderboard data={load.data} />;
  }

  return (
    <MenuScreen title="Stats" back={{ label: "Home", to: "/" }}>
      <Tabs leaderboard={leaderboardTab} />
      {body}
      <SignInSheet
        opened={signingIn}
        onClose={() => setSigningIn(false)}
        onSignedIn={() => {
          setSigningIn(false);
          void refresh();
        }}
      />
    </MenuScreen>
  );
}

function Tabs({ leaderboard }: { leaderboard: boolean }) {
  return (
    <nav
      aria-label="Stats views"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6,
        margin: "0 16px 24px",
        padding: 5,
        borderRadius: 18,
        ...SURFACE,
      }}
    >
      {[
        ["You", "/stats", !leaderboard],
        ["Leaderboard", "/stats/leaderboard", leaderboard],
      ].map(([label, to, active]) => (
        <Link
          key={String(label)}
          to={String(to)}
          aria-current={active ? "page" : undefined}
          style={{
            padding: "10px 12px",
            borderRadius: 14,
            textAlign: "center",
            textDecoration: "none",
            color: active ? "#fff" : QUIET,
            background: active ? "rgba(145,97,242,.35)" : "transparent",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {String(label)}
        </Link>
      ))}
    </nav>
  );
}

function NoGames({ leaderboard = false }: { leaderboard?: boolean }) {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon="history"
      tint={SOFT}
      title={leaderboard ? "Play a game to see the leaderboard." : "Play a game to see your stats."}
      action={<MenuButton onClick={() => navigate("/join")}>Join a game</MenuButton>}
    />
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: FAINT, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em" }}>
        {label}
      </div>
      <div style={{ ...numbers(23), marginTop: 8, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function You({ data }: { data: MyStats }) {
  const correctPercent = data.correct.judged ? Math.floor((100 * (data.correct.right ?? 0)) / data.correct.judged) : 0;
  return (
    <Stack gap={24} px={16}>
      <section>
        <SectionLabel>Games</SectionLabel>
        <div
          style={{
            ...SURFACE,
            borderRadius: 22,
            padding: 18,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          <Stat label="Games" value={data.games} />
          <Stat label="Wins" value={data.wins ?? "—"} />
          <Stat label="Win rate" value={`${data.winRate ?? 0}%`} />
        </div>
      </section>
      <section>
        <SectionLabel>Scores</SectionLabel>
        <div style={{ ...SURFACE, borderRadius: 22, padding: 18, display: "grid", gap: 18 }}>
          <Stat label="Average" value={money(data.averageScore ?? 0)} />
          <Stat
            label="Best"
            value={
              data.bestGameId ? (
                <Link to={`/games/${data.bestGameId}`} style={{ color: "var(--mantine-color-green-4)" }}>
                  {money(data.bestScore ?? 0)} ›
                </Link>
              ) : (
                "—"
              )
            }
          />
          <Stat label="Career" value={money(data.careerTotal ?? 0)} />
        </div>
      </section>
      <section>
        <SectionLabel>Accuracy</SectionLabel>
        <div style={{ ...SURFACE, borderRadius: 22, padding: 18, display: "grid", gap: 18 }}>
          <Stat
            label="Correct answers"
            value={`${correctPercent}% · ${data.correct.right ?? 0} of ${data.correct.judged ?? 0}`}
          />
          <Stat label="Daily Doubles" value={`${data.dailyDoubles.right ?? 0}–${data.dailyDoubles.wrong ?? 0}`} />
          <Stat label="Final Schmegettes" value={`${data.final.right ?? 0}–${data.final.wrong ?? 0}`} />
        </div>
      </section>
      <LeaderboardState state={data.leaderboard} />
    </Stack>
  );
}

function LeaderboardState({ state }: { state: MyStats["leaderboard"] }) {
  if (state.state === "ranked")
    return <p style={{ margin: 0, color: SOFT }}>Leaderboard rank: {ordinal(state.rank)}</p>;
  if (state.state === "needs-games")
    return <p style={{ margin: 0, color: SOFT }}>Play {state.gamesToGo} more games to get on the leaderboard.</p>;
  return (
    <p style={{ margin: 0, color: SOFT }}>
      You're hidden from the leaderboard. <Link to="/account">Change it in Account.</Link>
    </p>
  );
}

function Leaderboard({ data }: { data: LeaderboardData }) {
  if (data.rows.length === 0) {
    return (
      <div>
        <EmptyState icon="history" tint={SOFT} title="Nobody's played 10 games yet. Keep playing." />
        {data.myState === "hidden" && (
          <p style={{ color: SOFT, textAlign: "center" }}>You're hidden from the leaderboard.</p>
        )}
        {data.myState === "needs-games" && (
          <p style={{ color: SOFT, textAlign: "center" }}>
            Play {data.gamesToGo} more games to get on the leaderboard.
          </p>
        )}
      </div>
    );
  }
  return (
    <div style={{ padding: "0 16px" }}>
      <table
        aria-label="Leaderboard"
        style={{
          ...SURFACE,
          borderRadius: 22,
          overflow: "hidden",
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "fixed",
        }}
      >
        <thead>
          <tr>
            {["#", "Name", "Win%", "Wins", "Games"].map((h, index) => (
              <th
                scope="col"
                key={h}
                style={{
                  ...cellStyle,
                  width: index === 1 ? "auto" : index === 0 ? 34 : 50,
                  color: FAINT,
                  fontSize: 11,
                  textAlign: index < 2 ? "left" : "right",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <LeaderboardRow key={`${row.rank}-${row.name}`} row={row} />
          ))}
          {data.me && (
            <>
              <tr aria-hidden>
                <td colSpan={5} style={{ borderTop: `1px solid ${LINE}`, height: 8, padding: 0 }} />
              </tr>
              <LeaderboardRow row={data.me} />
            </>
          )}
        </tbody>
      </table>
      {data.myState === "needs-games" && (
        <p style={{ color: SOFT }}>Play {data.gamesToGo} more games to get on the leaderboard.</p>
      )}
      {data.myState === "hidden" && <p style={{ color: SOFT }}>You're hidden from the leaderboard.</p>}
      {data.rows.length < 10 && <p style={{ color: QUIET, fontSize: 13 }}>More players appear after 10 games.</p>}
      <p style={{ color: QUIET, fontSize: 13 }}>Win rate across finished games. 10 games to qualify.</p>
    </div>
  );
}

const cellStyle: React.CSSProperties = { padding: "12px 8px", verticalAlign: "middle" };

function LeaderboardRow({ row }: { row: LeaderboardData["rows"][number] }) {
  return (
    <tr style={{ background: row.isMe ? "rgba(107,255,179,.09)" : undefined }}>
      <td style={{ ...cellStyle, ...numbers(16) }}>{row.rank}</td>
      <td style={{ ...cellStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
        {row.name}
        {row.isMe ? " (you)" : ""}
      </td>
      <td style={{ ...cellStyle, ...numbers(15), textAlign: "right" }}>{row.winRate}%</td>
      <td style={{ ...cellStyle, ...numbers(15), textAlign: "right" }}>{row.wins}</td>
      <td style={{ ...cellStyle, ...numbers(15), textAlign: "right" }}>{row.games}</td>
    </tr>
  );
}

function ordinal(n: number) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

function Skeleton() {
  return (
    <div role="status" aria-label="Loading stats" aria-busy="true" style={{ padding: "0 16px" }}>
      {[90, 150, 170].map((height) => (
        <div key={height} className="mn-skel" style={{ height, borderRadius: 22, marginBottom: 18 }} />
      ))}
    </div>
  );
}
