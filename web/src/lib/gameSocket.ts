import type { ClientMessage, ServerMessage } from "@schmegettes/shared";
import { getAccessToken } from "./supabase";

type Listener = (message: ServerMessage) => void;

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
  private dropListeners = new Set<() => void>();

  constructor(private readonly url: string) {}

  async connect() {
    const token = await getAccessToken();
    // Browsers cannot set headers on a WebSocket, so the token travels as a subprotocol.
    const socket = new WebSocket(this.url, ["schmegettes.v1", `bearer.${token}`]);
    this.socket = socket;
    socket.onmessage = (event) => this.receive(JSON.parse(String(event.data)));
    socket.onclose = () => {
      // Ignore sockets this client replaced or closed on purpose.
      if (this.socket !== socket) return;
      this.socket = undefined;
      for (const listener of this.dropListeners) listener();
    };
  }

  send(message: ClientMessage) {
    this.socket?.send(JSON.stringify(message));
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onDrop(listener: () => void) {
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
      if (message.type !== "room_snapshot" && message.seq !== this.lastSeq + 1) {
        this.close();
        void this.connect();
        return;
      }
      this.lastSeq = message.seq;
    }
    for (const listener of this.listeners) listener(message);
  }
}
