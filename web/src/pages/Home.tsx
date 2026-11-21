import { Stack } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { type Account, currentAccount } from "../lib/account";
import { setSignedOutNotice, shouldShowSavePrompt, signedOutNotice, snoozeSavePrompt } from "../lib/accountFlags";
import { getPrefillName, isValidName, MAX_NAME, setLastName } from "../lib/displayName";
import { type GameSummary, lastGame } from "../lib/games";
import { getHostAccess } from "../lib/hostAccess";
import { money } from "../lib/money";
import { listWhen, ordinal } from "../lib/placement";
import { type CurrentRoom, createRoom, currentRoom } from "../lib/rooms";
import {
  Avatar,
  Callout,
  CodeInput,
  Eyebrow,
  Field,
  GroupList,
  MenuButton,
  MenuScreen,
  MenuSheet,
  Row,
  Spinner,
} from "../ui/menu";
import { SignInSheet } from "../ui/SignInSheet";
import { AMBER, FAINT, QUIET, RED, SOFT, SURFACE } from "../ui/tokens";
import { Wordmark } from "../ui/Wordmark";
import { HostCodeSheet } from "./HostCodeSheet";

export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

/** "Last: Today · 4th · −$400" under My games. */
function lastLine(g: GameSummary | null) {
  if (!g) return "Games you've played and watched";
  const day = listWhen(g.startedAt).split(" · ")[0];
  if (g.watched || g.placement == null) return `Last: ${day} · watched`;
  return (
    <>
      Last: {day} · {ordinal(g.placement)} ·{" "}
      <span style={{ color: g.score < 0 ? RED : "var(--mantine-color-green-4)", fontVariantNumeric: "tabular-nums" }}>
        {money(g.score)}
      </span>
    </>
  );
}

export function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [askingCode, setAskingCode] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [signIn, setSignIn] = useState<"sign-in" | "save" | null>(null);
  const [signedOut, setSignedOut] = useState(signedOutNotice);
  const [last, setLast] = useState<GameSummary | null>(null);
  // The room this account is in, to rejoin (rejoin-games feature brief).
  const [room, setRoom] = useState<CurrentRoom | null>(null);
  const [roomEnded, setRoomEnded] = useState(false);

  useEffect(() => {
    let live = true;
    void currentAccount().then((a) => {
      if (!live) return;
      setAccount(a);
      // A guest contestant back from a finished game: offer to save it.
      if (a?.kind === "guest" && shouldShowSavePrompt()) setSignIn("save");
    });
    void lastGame().then((g) => {
      if (live) setLast(g);
    });
    void currentRoom().then((r) => {
      if (live) setRoom(r);
    });
    return () => {
      live = false;
    };
  }, []);

  /** Rejoin: the TV view for the host, the seat for a contestant; a resume invite joins at once. */
  async function rejoin(r: CurrentRoom) {
    const still = await currentRoom();
    if (!still || still.roomId !== r.roomId) {
      setRoom(null);
      setRoomEnded(true);
      return;
    }
    if (r.role === "host") navigate(`/host/${r.code}`);
    else navigate(r.kind === "resume_invite" ? `/join/${r.code}?resume=1` : `/join/${r.code}`);
  }

  function closeSignIn() {
    if (signIn === "save") snoozeSavePrompt();
    setSignIn(null);
  }

  function dismissSignedOut() {
    setSignedOutNotice(false);
    setSignedOut(false);
  }

  function join() {
    if (code.length === 5) navigate(`/join/${code}`);
  }

  // Hosting is invite-only: a device without host access enters its host code first.
  async function hostAGame() {
    if (checking) return;
    setFailed(false);
    setChecking(true);
    const canHost = await getHostAccess();
    setChecking(false);
    if (canHost === null) setFailed(true);
    else if (canHost) openNaming();
    else setAskingCode(true);
  }

  function openNaming() {
    setName(getPrefillName());
    setFailed(false);
    setNaming(true);
  }

  async function create(event: { preventDefault(): void }) {
    event.preventDefault();
    if (creating || !isValidName(name)) return;
    setCreating(true);
    const result = await createRoom(name.trim());
    setCreating(false);
    if (!result.ok) {
      setNaming(false);
      // Host access was removed since the check: ask for a new code.
      if (result.problem === "not-a-host") setAskingCode(true);
      else setFailed(true);
      return;
    }
    setLastName(name);
    navigate(`/host/${result.data.room.code}`);
  }

  const corner =
    account?.kind === "guest" ? (
      <MenuButton kind="secondary" size="sm" onClick={() => setSignIn("sign-in")}>
        Sign in
      </MenuButton>
    ) : account?.kind === "signed-in" ? (
      <Link to="/account" aria-label="Account" className="mn-press" style={{ display: "block", borderRadius: 999 }}>
        <Avatar name={account.name} size={40} />
      </Link>
    ) : null;

  return (
    <MenuScreen right={corner}>
      <div className="sg-in" style={{ textAlign: "center", padding: "8px 20px 30px" }}>
        <h1 style={{ margin: 0 }}>
          <Wordmark size="clamp(42px, 13vw, 58px)" gradient />
        </h1>
        <p
          className="mn-balance"
          style={{ margin: "14px auto 0", maxWidth: 260, color: QUIET, fontSize: 16, lineHeight: 1.4 }}
        >
          The quiz show for your living room
        </p>
      </div>

      <Stack gap={14} px={16}>
        {signedOut && (
          <Callout
            tone="warn"
            title="You've been signed out"
            onClose={dismissSignedOut}
            action={
              <MenuButton kind="secondary" size="sm" onClick={() => setSignIn("sign-in")}>
                Sign in
              </MenuButton>
            }
          >
            Sign in to get your games back. You can still play as a guest.
          </Callout>
        )}
        {room && (
          <Callout
            tone="success"
            title={
              room.kind === "game"
                ? `Game in progress · ${room.code}`
                : room.kind === "lobby"
                  ? `You're in a lobby · ${room.code}`
                  : `${room.hostDisplayName} is resuming your game · ${room.code}`
            }
            action={
              <MenuButton kind="primary" size="sm" onClick={() => void rejoin(room)}>
                {room.kind === "resume_invite" ? "Join" : "Rejoin"}
              </MenuButton>
            }
          >
            {room.playerNames.join(", ") || "Waiting for players"}
          </Callout>
        )}
        {roomEnded && <Callout tone="info">That game has ended.</Callout>}
        {failed && <Callout tone="danger">Couldn't create a room. Try again.</Callout>}

        <div className="sg-in" style={{ ...SURFACE, borderRadius: 28, padding: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <Eyebrow>Join a game</Eyebrow>
            <span style={{ fontSize: 13, color: FAINT }}>Enter the code on the TV</span>
          </div>
          <CodeInput value={code} onChange={(v) => setCode(normalizeRoomCode(v))} onSubmit={join} />
          <div style={{ marginTop: 16 }}>
            <MenuButton full disabled={code.length !== 5} onClick={join} trailing="arrow">
              Join
            </MenuButton>
          </div>
        </div>

        <GroupList inset={false}>
          <Row
            icon="tv"
            title="Host a game"
            sub="On the device you'll put on the TV"
            onClick={() => void hostAGame()}
            trailing={checking ? <Spinner color={QUIET} /> : undefined}
          />
          <Row icon="history" tint={SOFT} title="My games" sub={lastLine(last)} to="/games" />
          <Row icon="history" tint="#c9b3f9" title="Stats" sub="Your record and the leaderboard" to="/stats" />
          {account?.kind === "signed-in" && account.isAdmin && (
            <Row icon="key" tint={AMBER} title="Admin" sub="Host code" to="/admin" />
          )}
        </GroupList>
      </Stack>

      <HostCodeSheet
        opened={askingCode}
        onClose={() => setAskingCode(false)}
        onSignIn={
          account?.kind === "guest"
            ? () => {
                setAskingCode(false);
                setSignIn("sign-in");
              }
            : undefined
        }
        onUnlocked={() => {
          setAskingCode(false);
          openNaming();
        }}
      />

      <SignInSheet
        opened={signIn !== null}
        variant={signIn ?? "sign-in"}
        onClose={closeSignIn}
        onSignedIn={() => {
          setSignIn(null);
          setSignedOut(false);
          void currentAccount().then(setAccount);
          void lastGame().then(setLast);
        }}
      />

      <MenuSheet
        opened={naming}
        onClose={() => setNaming(false)}
        title="What's your name?"
        description="Shown on the TV as “Hosted by …”."
      >
        <form onSubmit={create}>
          <Stack gap={18}>
            <Field
              label="Your name"
              icon="user"
              autoFocus
              maxLength={MAX_NAME}
              counter
              value={name}
              onChange={setName}
            />
            <MenuButton type="submit" full loading={creating} disabled={!isValidName(name)}>
              Create room
            </MenuButton>
          </Stack>
        </form>
      </MenuSheet>
    </MenuScreen>
  );
}
