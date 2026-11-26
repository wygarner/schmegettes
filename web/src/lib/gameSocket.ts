import type { ClientMessage, ServerMessage } from "@schmegettes/shared";
import { track } from "./faro";
import { getAccessToken } from "./supabase";

type Listener = (message: ServerMessage) => void;

/** The server closed this socket because the player opened the game on another device. */
export const CLOSE_OTHER_DEVICE = 4001;

/**
 * One connection to a room on game/. The server owns all state: the client sends
 * intents and renders what comes back. On a seq gap it reconnects, and the server
 * replies with a fresh room_snapshot. When the server drops the connection, onDrop
 * listeners decide whether to reconnect.
 */
export class GameSocket {
  private socket?: WebSocket;
  private lastSeq = -1;
  private listeners = new Set<Listener>();
  private dropListeners = new Set<(code?: number) => void>();
  private connects = 0;
  private lastCloseCode?: number;
  private reconnectReason = "drop";

  constructor(private readonly url: string) {}

  async connect() {
    if (this.connects++ > 0) {
      // Every connect after the first is a reconnect: a drop (with its close code) or a seq gap.
      track("socket_reconnect", { reason: this.reconnectReason, closeCode: String(this.lastCloseCode ?? "") });
      this.reconnectReason = "drop";
    }
    const token = await getAccessToken();
    // Browsers cannot set headers on a WebSocket, so the token travels as a subprotocol.
    const socket = new WebSocket(this.url, ["schmegettes.v1", `bearer.${token}`]);
    this.socket = socket;
    socket.onmessage = (event) => this.receive(JSON.parse(String(event.data)));
    socket.onclose = (event) => {
      // Ignore sockets this client replaced or closed on purpose.
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.lastCloseCode = event.code;
      for (const listener of this.dropListeners) listener(event.code);
    };
  }

  send(message: ClientMessage) {
    this.socket?.send(JSON.stringify(message));
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** code: the WebSocket close code, e.g. CLOSE_OTHER_DEVICE. */
  onDrop(listener: (code?: number) => void) {
    this.dropListeners.add(listener);
    return () => this.dropListeners.delete(listener);
  }

  close() {
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }

  private receive(message: ServerMessage) {
    if ("seq" in message) {
      // A snapshot resets the sequence. room_closed is final, so it is never treated as a gap
      // (a socket that reconnects to a closed room gets one without a snapshot first).
      const resets = message.type === "room_snapshot" || message.type === "room_closed";
      if (!resets && message.seq !== this.lastSeq + 1) {
        this.reconnectReason = "seq_gap";
        this.close();
        void this.connect();
        return;
      }
      this.lastSeq = message.seq;
    }
    for (const listener of this.listeners) listener(message);
  }
}
