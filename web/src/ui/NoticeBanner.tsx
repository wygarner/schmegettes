import { Drawer, UnstyledButton } from "@mantine/core";
import { useState } from "react";
import { type Notice, noticeTitle } from "../lib/noticeFormat";
import { LINE, QUIET, RED, SURFACE } from "./tokens";

const colors: Record<Notice["kind"], string> = {
  incident: RED,
  maintenance: "#b99aff",
  whats_new: "#6bffb3",
};

function NoticeBody({
  notice,
  onDismiss,
  more,
  onMore,
}: {
  notice: Notice;
  onDismiss?: () => void;
  more?: number;
  onMore?: () => void;
}) {
  const body = notice.phase === "resolved" ? notice.resolution : notice.body;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "12px 1fr auto", gap: 10, alignItems: "start" }}>
      <span
        aria-hidden
        style={{ width: 9, height: 9, marginTop: 7, borderRadius: 99, background: colors[notice.kind] }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 750 }}>{noticeTitle(notice)}</div>
        {body && <div style={{ color: QUIET, marginTop: 3, lineHeight: 1.4 }}>{body}</div>}
        {notice.link && (
          <a
            href={notice.link}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#b99aff", display: "inline-block", marginTop: 5 }}
          >
            Learn more ›
          </a>
        )}
        {more ? (
          <UnstyledButton
            onClick={onMore}
            style={{ display: "block", marginTop: 5, color: "#b99aff", fontWeight: 700 }}
          >
            +{more} more ›
          </UnstyledButton>
        ) : null}
      </div>
      {onDismiss && (
        <UnstyledButton
          aria-label={`Dismiss ${noticeTitle(notice)}`}
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
          style={{ color: QUIET, fontSize: 22, lineHeight: 1 }}
        >
          ×
        </UnstyledButton>
      )}
    </div>
  );
}

export function NoticeBanner({ notices, onDismiss }: { notices: Notice[]; onDismiss: (notice: Notice) => void }) {
  const [opened, setOpened] = useState(false);
  const first = notices[0];
  if (!first) return null;
  return (
    <>
      <div
        style={{
          ...SURFACE,
          borderRadius: 18,
          padding: "14px 16px",
        }}
      >
        <NoticeBody
          notice={first}
          more={notices.length - 1 || undefined}
          onMore={() => setOpened(true)}
          onDismiss={() => onDismiss(first)}
        />
      </div>
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        position="bottom"
        title="Service notices"
        padding="lg"
        styles={{
          content: { background: "#1b1038", color: "white" },
          header: { background: "#1b1038", color: "white" },
        }}
      >
        <div style={{ display: "grid", gap: 0 }}>
          {notices.map((notice, index) => (
            <div
              key={`${notice.id}:${notice.revision}`}
              style={{ padding: "16px 0", borderTop: index ? `1px solid ${LINE}` : undefined }}
            >
              <NoticeBody notice={notice} onDismiss={() => onDismiss(notice)} />
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
}
