import { Alert, Button, Group, Modal, Select, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { type FormEvent, useState } from "react";
import type { Notice } from "../../../web/src/lib/noticeFormat";
import { NoticeBanner } from "../../../web/src/ui/NoticeBanner";
import type { AdminApi, AdminNotice, NoticeInput, NoticePatch } from "./client";

type Draft = { kind: NoticeInput["kind"]; title: string; body: string; link: string; startsAt: string; endsAt: string };
const emptyDraft = (): Draft => ({ kind: "incident", title: "", body: "", link: "", startsAt: "", endsAt: "" });

function draftInput(draft: Draft): NoticeInput {
  return {
    kind: draft.kind,
    title: draft.title.trim(),
    body: draft.body,
    link: draft.link.trim() || null,
    startsAt: draft.kind === "maintenance" && draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
    endsAt: draft.kind === "maintenance" && draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
  };
}

function previewNotice(draft: Draft): Notice {
  const input = draftInput(draft);
  return {
    id: "25200000-0000-4000-8000-000000000000",
    revision: 1,
    phase: draft.kind === "maintenance" ? "upcoming" : "active",
    kind: input.kind,
    title: input.title || "Notice title",
    body: input.body,
    link: input.link ?? null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    resolvedAt: null,
    resolution: null,
  };
}

function valid(draft: Draft): boolean {
  return (
    draft.title.trim().length > 0 &&
    draft.title.length <= 60 &&
    draft.body.length <= 280 &&
    (draft.kind !== "maintenance" ||
      Boolean(draft.startsAt && draft.endsAt && new Date(draft.endsAt) > new Date(draft.startsAt)))
  );
}

export function NoticesSection({
  api,
  notices,
  onNotices,
}: {
  api: AdminApi;
  notices: AdminNotice[];
  onNotices: (notices: AdminNotice[]) => void;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<AdminNotice | null>(null);
  const [preview, setPreview] = useState(false);
  const [shortConfirm, setShortConfirm] = useState(false);
  const [resolving, setResolving] = useState<AdminNotice | null>(null);
  const [resolution, setResolution] = useState("");
  const [failed, setFailed] = useState(false);

  function openNew() {
    setDraft(emptyDraft());
    setEditing(null);
    setPreview(false);
    setOpened(true);
  }
  function openEdit(notice: AdminNotice) {
    const local = (value: string | null) => (value ? new Date(value).toISOString().slice(0, 16) : "");
    setDraft({
      kind: notice.kind,
      title: notice.title,
      body: notice.body,
      link: notice.link ?? "",
      startsAt: local(notice.startsAt),
      endsAt: local(notice.endsAt),
    });
    setEditing(notice);
    setPreview(false);
    setOpened(true);
  }
  const replace = (next: AdminNotice) => onNotices(notices.map((notice) => (notice.id === next.id ? next : notice)));

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!valid(draft)) return;
    if (
      !editing &&
      draft.kind === "maintenance" &&
      new Date(draft.startsAt).getTime() - Date.now() < 24 * 60 * 60 * 1000 &&
      !shortConfirm
    ) {
      setShortConfirm(true);
      return;
    }
    setFailed(false);
    try {
      if (editing) {
        const input = draftInput(draft);
        const patch: NoticePatch = {
          title: input.title,
          body: input.body,
          link: input.link,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        };
        replace(await api.editNotice(editing.id, patch));
      } else {
        onNotices([await api.postNotice(draftInput(draft)), ...notices]);
      }
      setOpened(false);
      setShortConfirm(false);
    } catch {
      setFailed(true);
    }
  }

  async function resolve() {
    if (!resolving || !resolution.trim()) return;
    try {
      replace(await api.resolveNotice(resolving.id, resolution.trim()));
      setResolving(null);
      setResolution("");
    } catch {
      setFailed(true);
    }
  }

  async function retry(notice: AdminNotice) {
    try {
      replace(await api.syncNotice(notice.id));
    } catch {
      setFailed(true);
    }
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={600}>Notices</Text>
        <Button onClick={openNew}>New notice</Button>
      </Group>
      {failed && <Alert color="red">Something went wrong. Try again.</Alert>}
      {notices.length === 0 ? (
        <Text c="dimmed">No notices in the last 30 days.</Text>
      ) : (
        notices.map((notice) => (
          <Stack
            key={notice.id}
            gap={4}
            p="sm"
            style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}
          >
            <Group justify="space-between">
              <Text>
                <b>{notice.kind === "whats_new" ? "What's new" : notice.kind}</b> · {notice.title}
              </Text>
              <Text size="sm">revision {notice.revision}</Text>
            </Group>
            <Text size="sm" c="dimmed">
              Posted {new Date(notice.createdAt).toLocaleString()} by {notice.createdBy} · {notice.history} history{" "}
              {notice.history === 1 ? "entry" : "entries"}
            </Text>
            {notice.statusPageSync === "failed" && (
              <Alert color="yellow">
                Posted in the app; the status page didn't update.{" "}
                <Button size="xs" ml="sm" onClick={() => void retry(notice)}>
                  Retry
                </Button>
              </Alert>
            )}
            <Group>
              <Button size="xs" variant="light" onClick={() => openEdit(notice)}>
                Edit
              </Button>
              {notice.kind === "incident" && notice.phase !== "resolved" && (
                <Button size="xs" color="green" onClick={() => setResolving(notice)}>
                  Resolve
                </Button>
              )}
            </Group>
          </Stack>
        ))
      )}

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={editing ? "Edit notice" : "New notice"}
        size="lg"
        transitionProps={{ duration: 0 }}
      >
        <form onSubmit={(event) => void save(event)}>
          <Stack>
            <Select
              label="Kind"
              disabled={Boolean(editing)}
              value={draft.kind}
              data={[
                { value: "incident", label: "Incident" },
                { value: "maintenance", label: "Maintenance" },
                { value: "whats_new", label: "What's new" },
              ]}
              onChange={(value) => value && setDraft({ ...draft, kind: value as Draft["kind"] })}
            />
            <TextInput
              label="Title"
              maxLength={60}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.currentTarget.value })}
              description={`${draft.title.length}/60`}
            />
            <Textarea
              label="Body"
              maxLength={280}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.currentTarget.value })}
              description={`${draft.body.length}/280`}
            />
            <TextInput
              label="Link"
              type="url"
              placeholder="https://…"
              value={draft.link}
              onChange={(e) => setDraft({ ...draft, link: e.currentTarget.value })}
            />
            {draft.kind === "maintenance" && (
              <Group grow>
                <TextInput
                  label="Start"
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(e) => setDraft({ ...draft, startsAt: e.currentTarget.value })}
                />
                <TextInput
                  label="End"
                  type="datetime-local"
                  value={draft.endsAt}
                  onChange={(e) => setDraft({ ...draft, endsAt: e.currentTarget.value })}
                />
              </Group>
            )}
            {preview && <NoticeBanner notices={[previewNotice(draft)]} onDismiss={() => {}} />}
            <Group justify="flex-end">
              <Button type="button" variant="light" onClick={() => setPreview(!preview)}>
                Preview
              </Button>
              <Button type="submit" disabled={!valid(draft)}>
                {editing ? "Save" : "Post"}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={shortConfirm}
        onClose={() => setShortConfirm(false)}
        title="Less than 24 hours"
        transitionProps={{ duration: 0 }}
      >
        <Stack>
          <Text>This is less than 24 hours' notice. Post anyway?</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setShortConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()}>Post anyway</Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={resolving !== null}
        onClose={() => setResolving(null)}
        title="Resolve incident"
        transitionProps={{ duration: 0 }}
      >
        <Stack>
          <Textarea
            label="Closing line"
            maxLength={280}
            value={resolution}
            onChange={(e) => setResolution(e.currentTarget.value)}
            description={`${resolution.length}/280`}
          />
          <Button disabled={!resolution.trim()} onClick={() => void resolve()}>
            Resolve
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
