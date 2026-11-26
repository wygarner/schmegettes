import { lobbyTitle, type Notice, showFullGameLine } from "../lib/noticeFormat";
import { RED, SOFT } from "./tokens";

export function LobbyNoticeStrip({ notice, serverTime }: { notice: Notice; serverTime: string }) {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: "1.5cqw",
        alignItems: "flex-start",
        minHeight: 0,
        padding: "clamp(4px, 1.2cqh, 9px) clamp(8px, 1.5cqw, 14px)",
        borderRadius: 12,
        background: "rgba(20,11,43,.72)",
        border: "1px solid rgba(255,255,255,.12)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          marginTop: "0.55em",
          borderRadius: 99,
          background: notice.kind === "incident" ? RED : "#b99aff",
          flex: "0 0 auto",
        }}
      />
      <div style={{ minWidth: 0, color: "white", fontSize: "clamp(10px, 3.8cqh, 16px)", lineHeight: 1.25 }}>
        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 700 }}>
          {lobbyTitle(notice, serverTime)}
        </div>
        {showFullGameLine(notice, serverTime) && <div style={{ color: SOFT }}>A full game takes about 45 minutes.</div>}
      </div>
    </div>
  );
}
