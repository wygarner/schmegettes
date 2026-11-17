// Spike for tasks/piper-narrator (subtask 0): can the host iPhone narrate with Piper?
// Internal only (devtools is never deployed). Compares piper-plus (MIT, its own English
// rules + CMUdict) with @mintplex-labs/piper-tts-web (espeak-ng based, GPL: never ship it in
// web/), and measures speed, stamina, main-thread stalls, and where the downloads come from.
// On the iPhone: `mise run dev:devtools`, then `ngrok http 5174` and open the https URL
// (Cache Storage, IndexedDB, and OPFS need a secure context).

import {
  Badge,
  Button,
  Checkbox,
  Code,
  Group,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { TtsSession } from "@mintplex-labs/piper-tts-web";
import * as ort from "onnxruntime-web";
import { PiperPlus } from "piper-plus";
import { useEffect, useRef, useState } from "react";

const ORT_VERSION = "1.31.1";
const ORT_WASM = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const HF_COMMIT = "0ca208afc2a2ee102b1e961e72e0a7e4907be3d0";

const VOICES = {
  kristin: "en_US-kristin-medium",
  norman: "en_US-norman-medium",
  john: "en_US-john-medium",
} as const;
type VoiceKey = keyof typeof VOICES;
const modelUrl = (v: VoiceKey) => {
  const name = VOICES[v];
  return `https://huggingface.co/rhasspy/piper-voices/resolve/${HF_COMMIT}/en/en_US/${v}/medium/${name}.onnx`;
};

const ANNOUNCEMENT = "Here's Volcanoes for 400.";

// Written for the spike in the catalog's style (no local catalog copy is available). Paste real
// clues below to test those too. Covers numbers, years, money, "&", ordinals, and proper nouns.
const CLUES = [
  "This volcano on the Big Island of Hawaii last erupted in 2022, after 38 years of quiet.",
  "Lewis & Clark spent the winter of 1805 at this fort near the mouth of the Columbia River.",
  "At 29,032 feet, it's the highest point on Earth.",
  "In 1984 this company introduced the Macintosh with a famous Super Bowl ad.",
  "This 'Moonlight' composer was almost completely deaf when he wrote his 9th Symphony.",
  "A $2 bill features this author of the Declaration of Independence.",
  "Roughly 71% of the Earth's surface is covered by this.",
  "Tchaikovsky wrote the music for this 1892 ballet set on Christmas Eve.",
  "This Austrian-born bodybuilder became the 38th governor of California.",
  "It's the only U.S. state whose name has just one syllable.",
  "Saoirse Ronan earned an Oscar nomination for playing Jo March in this 2019 film.",
  "This Paris museum, home of the Mona Lisa, gets about 9 million visitors a year.",
  "The 21st Amendment repealed this one.",
  "Worcestershire sauce was first made in this English city in the 1830s.",
  "This 1,600-mile river is the longest in Texas.",
  "Kilimanjaro, Africa's tallest peak, is in this country.",
  "Odysseus took 10 years to get home to this island after the Trojan War.",
  "This element, number 79 on the periodic table, has the symbol Au.",
  "In 1969 Neil Armstrong said this was 'one small step for man'.",
  "Known for 'Purple Rain', this Minneapolis musician was born Prince Rogers Nelson in 1958; he released more than 39 studio albums, won 7 Grammys, and played a famous Super Bowl halftime show in the rain in 2007.",
];

type Engine = "piper-plus" | "espeak";
type Row = {
  engine: Engine;
  voice: VoiceKey;
  text: string;
  synthMs: number;
  audioMs: number;
  rtf: number;
  maxFrameGapMs: number;
  maxTapDelayMs: number;
};

let audioCtx: AudioContext | null = null;
function audio(): AudioContext {
  audioCtx ??= new AudioContext();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function play(buffer: AudioBuffer): Promise<void> {
  return new Promise((resolve) => {
    const src = audio().createBufferSource();
    src.buffer = buffer;
    src.connect(audio().destination);
    src.onended = () => resolve();
    src.start();
  });
}

function toBuffer(samples: Float32Array, sampleRate: number): AudioBuffer {
  const buf = audio().createBuffer(1, samples.length, sampleRate);
  buf.copyToChannel(new Float32Array(samples), 0);
  return buf;
}

/** Longest gap between animation frames while `fn` runs: a stall the host's buzzer would feel. */
async function withFrameGap<T>(fn: () => Promise<T>): Promise<{ value: T; maxGapMs: number }> {
  let maxGapMs = 0;
  let last = performance.now();
  let running = true;
  const tick = (t: number) => {
    maxGapMs = Math.max(maxGapMs, t - last);
    last = t;
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    const value = await fn();
    return { value, maxGapMs };
  } finally {
    running = false;
  }
}

export default function PiperVoiceSpike() {
  const [voice, setVoice] = useState<VoiceKey>("kristin");
  const [proxy, setProxy] = useState(true);
  const [withPlayback, setWithPlayback] = useState(true);
  const [status, setStatus] = useState("Not loaded. Tap 'Turn on sound' first on iOS.");
  const [rows, setRows] = useState<Row[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const plus = useRef<{ voice: VoiceKey; tts: PiperPlus } | null>(null);
  const espeak = useRef<{ voice: VoiceKey; tts: TtsSession } | null>(null);
  const tapDelay = useRef(0);

  const note = (line: string) => setLog((l) => [...l, `${new Date().toISOString().slice(11, 19)} ${line}`]);

  useEffect(() => {
    ort.env.wasm.wasmPaths = ORT_WASM;
  }, []);

  async function loadPlus(): Promise<PiperPlus> {
    if (plus.current?.voice === voice) return plus.current.tts;
    plus.current?.tts.dispose();
    ort.env.wasm.proxy = proxy; // run ORT in its own worker so the page stays responsive
    const t0 = performance.now();
    setStatus(`piper-plus: loading ${VOICES[voice]}…`);
    const tts = await PiperPlus.initialize({
      model: modelUrl(voice),
      ort,
      onProgress: (p) => setStatus(`piper-plus: ${p.stage} ${Math.round((p.progress ?? 0) * 100)}%`),
    });
    note(`piper-plus ${voice} ready in ${Math.round(performance.now() - t0)} ms (proxy ${proxy})`);
    plus.current = { voice, tts };
    return tts;
  }

  async function loadEspeak(): Promise<TtsSession> {
    if (espeak.current?.voice === voice) return espeak.current.tts;
    const t0 = performance.now();
    setStatus(`espeak (comparison): loading ${VOICES[voice]}…`);
    const tts = await TtsSession.create({
      voiceId: VOICES[voice],
      wasmPaths: { ...TtsSession.WASM_LOCATIONS, onnxWasm: ORT_WASM },
      progress: (p) => setStatus(`espeak: ${Math.round((p.loaded / Math.max(p.total, 1)) * 100)}%`),
    });
    note(`espeak ${voice} ready in ${Math.round(performance.now() - t0)} ms`);
    espeak.current = { voice, tts };
    return tts;
  }

  /** Synthesizes one text, measures it, and optionally plays it. */
  async function run(engine: Engine, text: string, playIt = withPlayback): Promise<Row> {
    tapDelay.current = 0;
    const t0 = performance.now();
    const { value: buffer, maxGapMs } = await withFrameGap(async () => {
      if (engine === "piper-plus") {
        const tts = await loadPlus();
        const inf = (tts.config as { inference?: { noise_scale?: number; length_scale?: number; noise_w?: number } })
          ?.inference;
        const result = await tts.synthesize(text, {
          language: "en",
          noiseScale: inf?.noise_scale,
          lengthScale: inf?.length_scale,
          noiseW: inf?.noise_w,
        });
        return toBuffer(result.samples, result.sampleRate);
      }
      const tts = await loadEspeak();
      const wav = await tts.predict(text);
      return audio().decodeAudioData(await wav.arrayBuffer());
    });
    const synthMs = performance.now() - t0;
    const row: Row = {
      engine,
      voice,
      text,
      synthMs: Math.round(synthMs),
      audioMs: Math.round(buffer.duration * 1000),
      rtf: Number((synthMs / (buffer.duration * 1000)).toFixed(2)),
      maxFrameGapMs: Math.round(maxGapMs),
      maxTapDelayMs: Math.round(tapDelay.current),
    };
    setRows((r) => [...r, row]);
    if (playIt) await play(buffer);
    return row;
  }

  async function guarded(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      setStatus(`${label}: done`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`${label} failed: ${message}`);
      note(`${label} failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  const clues = [
    ...CLUES,
    ...pasted
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  ];

  return (
    <Stack maw={900} gap="md">
      <Title order={3}>Piper narrator spike</Title>
      <Text size="sm">
        Gate (task spec): piper-plus pronunciation close to espeak on 20 clues; real-time factor (RTF) at most 0.5; the
        60-clue run doesn't reload the tab; tap delay under 50 ms.
      </Text>

      <Group>
        <Button variant="default" onClick={() => audio()}>
          Turn on sound
        </Button>
        <SegmentedControl
          value={voice}
          onChange={(v) => setVoice(v as VoiceKey)}
          data={[
            { value: "kristin", label: "Kristin" },
            { value: "norman", label: "Norman" },
            { value: "john", label: "John" },
          ]}
        />
        <Checkbox label="ORT in a worker (proxy)" checked={proxy} onChange={(e) => setProxy(e.currentTarget.checked)} />
        <Checkbox
          label="Play audio"
          checked={withPlayback}
          onChange={(e) => setWithPlayback(e.currentTarget.checked)}
        />
      </Group>
      <Text size="sm">
        Status: <Code>{status}</Code> · cross-origin isolated: <Code>{String(globalThis.crossOriginIsolated)}</Code>
      </Text>

      <Group>
        <Button
          disabled={busy}
          onClick={() =>
            guarded("first audio", async () => {
              await loadPlus(); // loading is measured separately; this is the per-clue cost
              const row = await run("piper-plus", ANNOUNCEMENT);
              note(`first audio of the announcement after ${row.synthMs} ms (RTF ${row.rtf})`);
            })
          }
        >
          Time to first audio
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            guarded("20 clues", async () => {
              for (const c of clues) await run("piper-plus", c);
            })
          }
        >
          Run all clues (piper-plus)
        </Button>
        <Button
          disabled={busy}
          variant="light"
          onClick={() =>
            guarded("60-clue stamina", async () => {
              for (let i = 0; i < 60; i++) {
                setStatus(`stamina ${i + 1} / 60`);
                await run("piper-plus", clues[i % clues.length] ?? ANNOUNCEMENT);
              }
            })
          }
        >
          Run 60 clues (stamina)
        </Button>
        <Button
          disabled={busy}
          variant="light"
          onClick={() =>
            guarded("downloads", async () => {
              const hosts = new Set(
                performance
                  .getEntriesByType("resource")
                  .map((e) => new URL(e.name).host)
                  .filter((h) => h !== location.host),
              );
              note(`hosts fetched: ${[...hosts].join(", ")}`);
            })
          }
        >
          List download hosts
        </Button>
      </Group>

      <Button
        size="xl"
        color="red"
        onPointerDown={(e) => {
          tapDelay.current = Math.max(tapDelay.current, performance.now() - e.timeStamp);
        }}
      >
        Tap me while it synthesizes (buzzer stand-in)
      </Button>

      <Title order={5}>Pronunciation A/B (piper-plus, then espeak)</Title>
      <Stack gap={4}>
        {clues.map((c) => (
          <Group key={c} wrap="nowrap" gap="xs">
            <Button
              size="compact-xs"
              disabled={busy}
              onClick={() =>
                guarded("A/B", async () => {
                  await run("piper-plus", c, true);
                  await run("espeak", c, true);
                })
              }
            >
              A/B
            </Button>
            <Text size="xs">{c}</Text>
          </Group>
        ))}
      </Stack>
      <Textarea
        label="Paste real clues (one per line) to add them"
        autosize
        minRows={2}
        value={pasted}
        onChange={(e) => setPasted(e.currentTarget.value)}
      />

      <Group>
        <Title order={5}>Results</Title>
        <Button
          size="compact-sm"
          variant="default"
          onClick={() =>
            void navigator.clipboard.writeText(JSON.stringify({ ua: navigator.userAgent, rows, log }, null, 2))
          }
        >
          Copy results JSON
        </Button>
        <Button size="compact-sm" variant="subtle" onClick={() => setRows([])}>
          Clear
        </Button>
        <Summary rows={rows} />
      </Group>
      <Table striped fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>engine</Table.Th>
            <Table.Th>voice</Table.Th>
            <Table.Th>synth ms</Table.Th>
            <Table.Th>audio ms</Table.Th>
            <Table.Th>RTF</Table.Th>
            <Table.Th>frame gap</Table.Th>
            <Table.Th>tap delay</Table.Th>
            <Table.Th>text</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are append-only
            <Table.Tr key={i}>
              <Table.Td>{r.engine}</Table.Td>
              <Table.Td>{r.voice}</Table.Td>
              <Table.Td>{r.synthMs}</Table.Td>
              <Table.Td>{r.audioMs}</Table.Td>
              <Table.Td c={r.rtf > 0.5 ? "red" : undefined}>{r.rtf}</Table.Td>
              <Table.Td c={r.maxFrameGapMs > 50 ? "red" : undefined}>{r.maxFrameGapMs}</Table.Td>
              <Table.Td c={r.maxTapDelayMs > 50 ? "red" : undefined}>{r.maxTapDelayMs}</Table.Td>
              <Table.Td>{r.text.slice(0, 60)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Code block>{log.join("\n") || "log is empty"}</Code>
    </Stack>
  );
}

function Summary({ rows }: { rows: Row[] }) {
  const plus = rows.filter((r) => r.engine === "piper-plus");
  if (plus.length === 0) return null;
  const rtfs = plus.map((r) => r.rtf).sort((a, b) => a - b);
  const median = rtfs[Math.floor(rtfs.length / 2)] ?? 0;
  const worst = rtfs.at(-1) ?? 0;
  const gap = Math.max(...plus.map((r) => r.maxFrameGapMs));
  return (
    <Group gap="xs">
      <Badge color={median <= 0.5 ? "teal" : "red"}>median RTF {median}</Badge>
      <Badge color={worst <= 0.5 ? "teal" : "orange"}>worst RTF {worst}</Badge>
      <Badge color={gap <= 50 ? "teal" : "red"}>worst frame gap {gap} ms</Badge>
    </Group>
  );
}
