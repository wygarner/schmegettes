import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import type { ClientMessage } from "@schmegettes/shared";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { GameOptionsSheet } from "../game/GameOptionsSheet";
import { HostGame } from "../game/HostGame";
import { HostLayout } from "../game/HostLayout";
import { MicGate } from "../game/MicGate";
import { NarratorVoicePicker, useNarratorStatus } from "../game/NarratorVoicePicker";
import { isValidName, MAX_NAME, setLastName } from "../lib/displayName";
import {
  DEFAULT_OPTIONS,
  fromRoom,
  type GameOptions,
  isDefault,
  savedOptions,
  saveOptions,
  seasonList,
} from "../lib/gameOptions";
import { money } from "../lib/money";
import { stopNarration } from "../lib/narrator";
import { fetchNotices, lobbyNotices, type NoticeResponse } from "../lib/notices";
import { prepareVoice } from "../lib/piper/engine";
import { contestantCount, type ResumeLobby, type RoomState, useRoom } from "../lib/room";
import { type RoomJoin, roomByCode, updateRoomOptions } from "../lib/rooms";
import { getUserId } from "../lib/supabase";
import { GoldButton } from "../ui/GoldButton";
import { HomeButton } from "../ui/HomeButton";
import { HomeScreenTip } from "../ui/HomeScreenTip";
import { JoinQr } from "../ui/JoinQr";
import { LobbyNoticeStrip } from "../ui/LobbyNoticeStrip";
import { Sheet } from "../ui/Sheet";
import { Stage, StageBody } from "../ui/Stage";
import { BEVEL, DISPLAY, SOFT, TILE_BG } from "../ui/tokens";
import { Wordmark } from "../ui/Wordmark";
import { Shuffle } from "./JoinRoom";

type Load = { kind: "loading" } | { kind: "ready"; room: RoomJoin } | { kind: "not-host" } | { kind: "error" };

/** /host/:code: the TV view of the lobby. Only the room's host may open it. */
export function HostLobby() {
  const { code = "" } = useParams();
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    void (async () => {
      const [result, userId] = await Promise.all([roomByCode(code), getUserId().catch(() => "")]);
      if (!live) return;
      if (result.ok && result.data.room.hostUserId === userId) setLoad({ kind: "ready", room: result.data });
      else if (result.ok || result.problem === "room-not-found") setLoad({ kind: "not-host" });
      else setLoad({ kind: "error" });
    })();
    return () => {
      live = false;
    };
  }, [code]);

  if (load.kind === "loading")
    return (
      <Centered>
        <Loader />
      </Centered>
    );
  if (load.kind === "not-host") {
    return (
      <Centered>
        <Text>Only the host can open this screen.</Text>
        <Anchor component={Link} to={`/join/${code}`}>
          Join this room instead
        </Anchor>
      </Centered>
    );
  }
  if (load.kind === "error") {
    return (
      <Centered>
        <Text>Couldn't load the room. Reload to try again.</Text>
      </Centered>
    );
  }
  return <ConnectedHostLobby room={load.room} />;
}

function ConnectedHostLobby({ room }: { room: RoomJoin }) {
  const { state, send } = useRoom(room.gameSocketUrl, room.room.hostUserId);
  const [options, change] = useGameOptions(room);
  const [noticeData, setNoticeData] = useState<NoticeResponse | null>(null);
  const fetchedNotices = useRef(false);
  useEffect(() => {
    if (state.phase !== "lobby" || fetchedNotices.current) return;
    fetchedNotices.current = true;
    let live = true;
    void fetchNotices()
      .then((data) => {
        if (live) setNoticeData(data);
      })
      .catch(() => {
        if (live) setNoticeData(null);
      });
    return () => {
      live = false;
    };
  }, [state.phase]);
  return (
    <HostLobbyView
      code={room.room.code}
      joinAddress={`${window.location.host}/join`}
      state={state}
      send={send}
      options={options}
      onOptions={change}
      noticeData={noticeData}
    />
  );
}

/**
 * The room's game options. A new room (still on the defaults) gets the options this device
 * used last. A change shows at once, is saved on the device, and is sent to the server; a
 * refusal puts back what the server has.
 */
function useGameOptions(room: RoomJoin): [GameOptions, (next: GameOptions) => void] {
  const roomId = room.room.roomId;
  const [options, setOptions] = useState(() => fromRoom(room.room));
  const change = useCallback(
    (next: GameOptions) => {
      setOptions(next);
      saveOptions(next);
      void updateRoomOptions(roomId, {
        seasons: seasonList(next.seasons),
        doubleRound: next.doubleRound,
        quickPicks: next.quickPicks,
        difficulty: next.difficulty,
      }).then((updated) => setOptions(updated ? fromRoom(updated) : fromRoom(room.room)));
    },
    [roomId, room.room],
  );
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    const saved = savedOptions();
    if (room.room.status === "open" && isDefault(fromRoom(room.room)) && !isDefault(saved)) change(saved);
  }, [room.room, change]);
  return [options, change];
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <Center mih="100vh" p="md">
      <HomeButton floating />
      <Stack align="center">{children}</Stack>
    </Center>
  );
}

const ERRORS: Record<string, string> = {
  room_full: "The room is full.",
  not_enough_players: "Need at least 1 player.",
  invalid_name: "Names are 1 to 20 characters.",
  not_a_host: "Your host access was removed, so you can't start games.",
};

export function HostLobbyView({
  code,
  joinAddress,
  state,
  send,
  options = DEFAULT_OPTIONS,
  onOptions,
  noticeData = null,
}: {
  code: string;
  /** Where phones join, without the scheme, as it's read off the TV: "schmegettes.app/join". */
  joinAddress: string;
  state: RoomState;
  send: (message: ClientMessage) => void;
  /** The room's game options and how to change them (absent: no Options button). */
  options?: GameOptions;
  onOptions?: (next: GameOptions) => void;
  /** Fetched once by the connected lobby; exposed for focused display tests. */
  noticeData?: NoticeResponse | null;
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  // The player menu's rename sheet: whose name (null: the host's own), and the draft.
  const [renaming, setRenaming] = useState<{ userId: string | null; current: string } | null>(null);
  const [name, setName] = useState("");
  const [starting, setStarting] = useState(false);
  // Join asks for the host device's microphone first (nobody plays without it).
  const [askingMic, setAskingMic] = useState(false);
  const joinGame = useCallback(() => {
    setAskingMic(false);
    send({ type: "set_host_plays", plays: true });
  }, [send]);
  const narrator = useNarratorStatus();
  // The player list starts folded into a tab every time the lobby opens (not remembered), so
  // the code gets the stage's full width. A join while folded flashes the tab.
  const [folded, setFolded] = useState(true);
  const flash = useJoinFlash(state.players.length, folded);

  // Names lock at Start: an open rename sheet closes without saving.
  useEffect(() => {
    if (state.phase !== "lobby") setRenaming(null);
  }, [state.phase]);

  // A Start press ends when the phase moves on or the server answers with an error.
  useEffect(() => {
    if (state.phase !== "lobby" || state.error) setStarting(false);
  }, [state.phase, state.error]);

  if (state.connection === "closed") {
    return (
      <Centered>
        <Title order={2}>This room has closed.</Title>
        <Anchor component={Link} to="/">
          Back to home
        </Anchor>
      </Centered>
    );
  }
  if (state.connection === "connecting")
    return (
      <Centered>
        <Loader />
      </Centered>
    );
  if (state.phase === "building_board") {
    return (
      <HostLayout
        stage={
          <Stage>
            <StageBody gap="3cqh">
              <Shuffle />
              <Title order={2} ff={DISPLAY} fw={600} c="white" style={{ fontSize: "min(10cqh, 6cqw)" }}>
                Shuffling a fresh board…
              </Title>
              <Text c={SOFT} style={{ fontSize: "clamp(11px, 4.5cqh, 18px)" }}>
                Only categories nobody here has seen
              </Text>
            </StageBody>
          </Stage>
        }
        column={<LobbyPlayers state={state} count={contestantCount(state)} />}
        home={<HomeButton confirm="host" />}
      />
    );
  }
  if (state.phase !== "lobby") {
    return <HostGame state={state} send={send} hostUserId={state.hostUserId} />;
  }

  const count = contestantCount(state);
  const full = count >= state.maxPlayers;
  const enoughPlayers = count >= 1;
  // Start waits for the narrator's voice (gameplay feature brief, "Start waits for the voice").
  const canStart = enoughPlayers && narrator.ready;
  const voiceFailed = narrator.status.state === "failed";
  let startLabel = "Start";
  if (enoughPlayers && !narrator.ready && !narrator.unavailable && !voiceFailed) {
    const s = narrator.status;
    startLabel =
      s.state === "downloading"
        ? `Getting ${narrator.name} ready… ${Math.floor(s.fraction * 100)}%`
        : `Getting ${narrator.name} ready…`;
  }

  function rename(userId: string | null, current: string) {
    setName(current);
    setRenaming({ userId, current });
  }

  // The host's own name is remembered for next time; a rename of someone else lasts for this
  // room only (the server doesn't remember it either).
  function saveName() {
    if (!renaming || !isValidName(name)) return;
    if (renaming.userId === null) {
      setLastName(name);
      send({ type: "set_display_name", displayName: name.trim() });
    } else {
      send({ type: "set_display_name", displayName: name.trim(), userId: renaming.userId });
    }
    setRenaming(null);
  }

  const warning = noticeData ? lobbyNotices(noticeData.notices, noticeData.serverTime)[0] : undefined;

  const stage = (
    <Stage>
      {warning ? <LobbyNoticeStrip notice={warning} serverTime={noticeData?.serverTime ?? ""} /> : <HomeScreenTip />}
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Group gap={2} wrap="nowrap">
          <div style={{ margin: "-10px 0 -10px -10px" }}>
            <HomeButton />
          </div>
          <Wordmark size="clamp(14px, 8cqh, 32px)" />
        </Group>
        <Text fw={600} c={SOFT} truncate="end" style={{ fontSize: "clamp(11px, 5.5cqh, 22px)", minWidth: 0 }}>
          Join at {joinAddress}
        </Text>
      </Group>

      <StageBody gap="2.5cqh">
        {/* The QR code above the room code; together they take the stage's height. */}
        <JoinQr code={code} size="clamp(88px, 30cqh, 180px)" />
        <CodeTiles code={code} />
        {narrator.unavailable && (
          <Text fw={600} c="red.3" ta="center" style={{ fontSize: "clamp(11px, 5cqh, 20px)" }}>
            This device can't run the Schmegettes narrator. Host from a recent iPhone, iPad or computer.
          </Text>
        )}
        {state.resume && (
          <Text c={SOFT} style={{ fontSize: "clamp(10px, 4.5cqh, 18px)" }}>
            Resuming the game from{" "}
            {new Date(state.resume.startedAt).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </Text>
        )}
        {state.rematch && (
          <Text c={SOFT} style={{ fontSize: "clamp(10px, 4.5cqh, 18px)" }}>
            Fresh board: none of tonight's clues come back.
          </Text>
        )}
      </StageBody>

      {state.connection === "reconnecting" && (
        <Alert color="yellow" p={8} mb={6}>
          Reconnecting…
        </Alert>
      )}
      {state.error && (
        <Alert color="red" p={8} mb={6}>
          {state.error.message ?? ERRORS[state.error.code] ?? "Something went wrong."}
        </Alert>
      )}

      <Group justify="space-between" align="end" wrap="nowrap">
        <Stack gap={4} display={state.resume ? "none" : undefined}>
          <Button
            variant="outline"
            color="mauve.1"
            disabled={!state.hostPlays && full}
            onClick={() => (state.hostPlays ? send({ type: "set_host_plays", plays: false }) : setAskingMic(true))}
          >
            {state.hostPlays ? "Leave" : "Join"}
          </Button>
          {!state.hostPlays && full && (
            <Text size="sm" c={SOFT}>
              Room is full
            </Text>
          )}
          <Sheet opened={askingMic} onClose={() => setAskingMic(false)} label="Microphone">
            {askingMic && <MicGate host onGranted={joinGame} onLeave={() => setAskingMic(false)} />}
          </Sheet>
        </Stack>
        <Group gap={4} wrap="nowrap">
          <NarratorVoicePicker />
          {onOptions && (
            <Tooltip label="Game options">
              <ActionIcon
                variant="subtle"
                color="mauve.1"
                size={44}
                aria-label="Game options"
                onClick={() => setOptionsOpen(true)}
                style={{ fontSize: 22 }}
              >
                ⚙
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
        <Sheet opened={renaming !== null} onClose={() => setRenaming(null)} label={`Rename ${renaming?.current ?? ""}`}>
          {renaming && (
            <Stack gap="sm">
              <Title order={3} ff={DISPLAY} fw={600}>
                Rename {renaming.current}
              </Title>
              <TextInput
                label="What's your name?"
                data-autofocus
                maxLength={MAX_NAME}
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
              />
              <Group grow>
                <Button variant="default" onClick={() => setRenaming(null)}>
                  Cancel
                </Button>
                <GoldButton onClick={saveName} disabled={!isValidName(name)}>
                  Save
                </GoldButton>
              </Group>
            </Stack>
          )}
        </Sheet>
        {onOptions && (
          <GameOptionsSheet
            opened={optionsOpen}
            onClose={() => setOptionsOpen(false)}
            options={options}
            onChange={onOptions}
          />
        )}
        <Group gap="xs" wrap="nowrap" align="center">
          {enoughPlayers && voiceFailed && (
            <Group gap={6} wrap="nowrap">
              <Text size="sm" c="red.3">
                Couldn't download the voice
              </Text>
              <Button size="compact-sm" variant="light" onClick={() => void prepareVoice(narrator.id)}>
                Try again
              </Button>
            </Group>
          )}
          <GoldButton
            disabled={!canStart}
            loading={starting}
            onClick={() => {
              stopNarration(); // a voice sample still playing
              setStarting(true);
              send({ type: "start_game" });
            }}
          >
            {state.resume ? "Resume" : startLabel}
          </GoldButton>
        </Group>
      </Group>
    </Stage>
  );

  // No buzzer on the host device in the lobby, even after Join: it appears with the player
  // column at Start (lobby interaction design).
  const shown = state.resume ? state.resume.players.filter((p) => p.back).length : count;
  const total = state.resume ? state.resume.players.length : state.maxPlayers;
  const column = folded ? (
    <PlayersTab count={shown} total={total} flash={flash} onOpen={() => setFolded(false)} />
  ) : state.resume ? (
    <ResumePlayers resume={state.resume} onFold={() => setFolded(true)} />
  ) : (
    <LobbyPlayers state={state} count={count} onFold={() => setFolded(true)} onRename={rename} />
  );

  return <HostLayout stage={stage} column={column} narrow={folded} />;
}

const FLASH_MS = 600;

/** True for 0.6 s after a player joins while the list is folded (never with reduced motion). */
function useJoinFlash(players: number, folded: boolean): boolean {
  const reduced = useReducedMotion();
  const [flash, setFlash] = useState(false);
  const last = useRef(players);
  useEffect(() => {
    const joined = players > last.current;
    last.current = players;
    if (!joined || !folded || reduced) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), FLASH_MS);
    return () => clearTimeout(t);
  }, [players, folded, reduced]);
  return flash;
}

/** The folded player list: a slim full-height tab on the right edge; a tap opens the list. */
function PlayersTab({
  count,
  total,
  flash,
  onOpen,
}: {
  count: number;
  total: number;
  flash: boolean;
  onOpen: () => void;
}) {
  return (
    <UnstyledButton
      onClick={onOpen}
      aria-expanded={false}
      aria-label={`Show players (${count} of ${total})`}
      style={{
        flex: 1,
        minHeight: 0,
        borderRadius: 8,
        background: flash ? "var(--mantine-color-green-4)" : TILE_BG,
        boxShadow: BEVEL,
        color: flash ? "var(--mantine-color-mauve-9)" : "#fff",
        transition: `background ${FLASH_MS / 2}ms, color ${FLASH_MS / 2}ms`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontWeight: 700,
      }}
    >
      <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
        {count}/{total}
      </span>
    </UnstyledButton>
  );
}

/** The open list's header: "Players 3 / 6 ›"; a tap folds the list again. */
function FoldHeader({ children, onFold }: { children: ReactNode; onFold: () => void }) {
  return (
    <UnstyledButton
      onClick={onFold}
      aria-expanded
      aria-label="Hide players"
      px={2}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fff" }}
    >
      <Text fw={700} component="span">
        {children}
      </Text>
      <Text fw={700} component="span" aria-hidden fz={20} lh={1}>
        ›
      </Text>
    </UnstyledButton>
  );
}

/**
 * The lobby's player list: join order, connected dot, HOST chip, "(reconnecting)". With
 * `onRename` it's the player menu: ✎ on each name, and a "Hosted by" footer with its own ✎.
 */
function LobbyPlayers({
  state,
  count,
  onFold,
  onRename,
}: {
  state: RoomState;
  count: number;
  onFold?: () => void;
  /** The player menu: ✎ on every name, and "Hosted by" ✎ (userId null: the host's own name). */
  onRename?: (userId: string | null, current: string) => void;
}) {
  return (
    <>
      {onFold ? (
        <FoldHeader onFold={onFold}>
          Players {count} / {state.maxPlayers}
        </FoldHeader>
      ) : (
        <Group justify="space-between" px={2} wrap="nowrap">
          <Text fw={700}>
            Players {count} / {state.maxPlayers}
          </Text>
        </Group>
      )}
      <Box style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {state.players.length === 0 ? (
          <Text c={SOFT} ta="center" mt="md" className="sg-blink">
            Waiting for players…
          </Text>
        ) : (
          <ol
            aria-label="Players"
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              listStyle: "none",
              margin: 0,
              padding: 0,
            }}
          >
            {state.players.map((p) => (
              <li
                key={p.userId}
                className="sg-in"
                aria-label={`${p.displayName}${p.role === "host" ? ", host" : ""}${p.connected ? "" : ", reconnecting"}`}
                style={{
                  flex: "1 1 0",
                  minHeight: 24,
                  maxHeight: 40,
                  borderRadius: 8,
                  background: TILE_BG,
                  boxShadow: BEVEL,
                  padding: "0 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  opacity: p.connected ? 1 : 0.45,
                  color: "#fff",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 8,
                    flexShrink: 0,
                    background: p.connected ? "var(--mantine-color-teal-5)" : "transparent",
                    border: p.connected ? "none" : `1.5px solid ${SOFT}`,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {p.displayName}
                  {!p.connected && <span style={{ fontWeight: 500, fontSize: 11, color: SOFT }}> (reconnecting)</span>}
                </span>
                {p.role === "host" && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: ".08em",
                      color: SOFT,
                      border: "1px solid rgba(255,166,217,.45)",
                      padding: "1px 4px",
                      borderRadius: 3,
                    }}
                  >
                    HOST
                  </span>
                )}
                {onRename && (
                  <RenameButton
                    name={p.displayName}
                    host={p.role === "host"}
                    onClick={() => onRename(p.role === "host" ? null : p.userId, p.displayName)}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </Box>
      {onRename && (
        <Group gap={2} wrap="nowrap" px={2} style={{ flexShrink: 0 }}>
          <Text c={SOFT} size="sm" truncate="end" style={{ flex: 1, minWidth: 0 }}>
            Hosted by {state.hostDisplayName}
          </Text>
          <RenameButton name={state.hostDisplayName} host onClick={() => onRename(null, state.hostDisplayName)} />
        </Group>
      )}
    </>
  );
}

/** ✎ in the player menu: 44 px to tap, though the row is shorter. */
function RenameButton({ name, host = false, onClick }: { name: string; host?: boolean; onClick: () => void }) {
  return (
    <ActionIcon
      variant="subtle"
      color="mauve.1"
      size={28}
      aria-label={host ? "Edit your name" : `Rename ${name}`}
      onClick={onClick}
      style={{ margin: -8, padding: 8, boxSizing: "content-box", flexShrink: 0 }}
    >
      ✎
    </ActionIcon>
  );
}

/** The room code, one gold letter per board-blue tile, readable from the couch. */
function CodeTiles({ code }: { code: string }) {
  const letters = code.split("").map((ch, i) => ({ ch, id: `${i}-${ch}` }));
  return (
    <section aria-label="Room code" style={{ display: "flex", gap: "2cqw" }}>
      {letters.map(({ ch, id }) => (
        <div
          key={id}
          style={{
            width: "min(13cqw, 20cqh)",
            height: "min(17cqw, 26cqh)",
            borderRadius: 8,
            background: "var(--mantine-color-mauve-9)",
            boxShadow: `${BEVEL}, 0 6px 18px rgba(0,0,0,.35)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: "min(12cqw, 19cqh)",
            color: "var(--mantine-color-green-4)",
            textShadow: "0 3px 0 rgba(0,0,0,.5)",
          }}
        >
          {ch}
        </div>
      ))}
    </section>
  );
}

/** A resume lobby's players: the game's contestants with their scores, dimmed until back. */
function ResumePlayers({ resume, onFold }: { resume: ResumeLobby; onFold: () => void }) {
  const back = resume.players.filter((p) => p.back).length;
  return (
    <>
      <FoldHeader onFold={onFold}>
        Players {back} / {resume.players.length}
      </FoldHeader>
      <ol
        aria-label="Players"
        style={{ display: "flex", flexDirection: "column", gap: 4, listStyle: "none", margin: 0, padding: 0 }}
      >
        {resume.players.map((p) => (
          <li
            key={p.userId}
            aria-label={`${p.displayName}, ${money(p.score)}${p.back ? "" : ", not back yet"}`}
            style={{
              minHeight: 28,
              borderRadius: 8,
              background: TILE_BG,
              boxShadow: BEVEL,
              padding: "0 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              opacity: p.back ? 1 : 0.45,
              color: "#fff",
            }}
          >
            <Text truncate="end" fw={600}>
              {p.displayName}
            </Text>
            <Text fw={700} style={{ fontVariantNumeric: "tabular-nums" }}>
              {money(p.score)}
            </Text>
          </li>
        ))}
      </ol>
    </>
  );
}
