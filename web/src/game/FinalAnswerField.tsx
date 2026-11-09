import { Button, Group, Stack, TextInput } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Countdown } from "./Countdown";
import { DRAFT_DEBOUNCE_MS, FINAL_ANSWER_MS } from "./timing";

/**
 * The typed Final Schmegettes answer. The draft goes to the server as the player types
 * (debounced, always ending with the latest text), so it counts if time runs out or the
 * phone drops. Submit locks it. `masked` hides the text: the host device is on the TV.
 */
export function FinalAnswerField({
  deadlineAt,
  masked = false,
  compact = false,
  initial = "",
  onDraft,
  onSubmit,
}: {
  deadlineAt?: number;
  masked?: boolean;
  compact?: boolean;
  initial?: string;
  onDraft: (text: string) => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ text: initial, sent: initial, onDraft });
  latest.current.onDraft = onDraft;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const l = latest.current;
    if (l.text !== l.sent) {
      l.sent = l.text;
      l.onDraft(l.text);
    }
  }, []);
  // Send the last draft if the field goes away (time's up, phase change).
  useEffect(() => flush, [flush]);

  const change = (value: string) => {
    const v = value.slice(0, 200);
    setText(v);
    latest.current.text = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, DRAFT_DEBOUNCE_MS);
  };

  const submit = () => {
    if (!text.trim()) return;
    clearTimeout(timer.current);
    latest.current.sent = text;
    onSubmit(text);
  };

  return (
    <Stack gap={compact ? 4 : "xs"}>
      <Countdown deadlineAt={deadlineAt} total={FINAL_ANSWER_MS} />
      <Group gap={compact ? 4 : "xs"} wrap="nowrap" align="flex-end">
        <TextInput
          style={{ flex: 1 }}
          size={compact ? "xs" : "md"}
          type={masked ? "password" : "text"}
          aria-label="Your answer"
          placeholder={masked ? "•••••" : "Type your answer"}
          value={text}
          maxLength={200}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => change(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <Button size={compact ? "xs" : "md"} disabled={!text.trim()} onClick={submit}>
          Submit
        </Button>
      </Group>
    </Stack>
  );
}
