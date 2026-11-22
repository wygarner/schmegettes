---
task-type: bug-fix
task-title: "Narrator: smooth long clues, Roman numerals, punctuation, years"
---
# Task spec: narrator-reading

Product brief: [product-brief.md](./product-brief.md). Its tables are the acceptance cases.

Web only. No contract, server, or database change. The server's reading-time fallback estimate (2.5 words/s + 1 s, cap 14 s) stays as it is.

## Approach

Two independent pieces, both on the host device:

1. **Text for speech** (`spokenText`): a pure function that rewrites a line before the voice speaks it (Roman numerals, symbols, fractions, blanks, years and decades, dash and ellipsis pauses). The TV keeps showing the original text.
2. **Chunking** (`narrationChunks` + `narrator.ts`): pieces that grow and are cut only at punctuation, all generated ahead from the reveal on, with silence trimmed between pieces, so a long clue sounds like one reading.

## Subtasks

### 1. `web/`: spoken text (`web/src/lib/spokenText.ts`, new; `spokenText` moves here from `speech.ts`)

Keep the export name `spokenText(text)` so every caller is unchanged (re-export from `speech.ts` if that's simpler). Apply the rules in this order, each one a small named function with its own tests.

1. **Blanks:** a run of 2+ underscores → `blank`.
2. **Fractions:**
   - `\d+ \d/\d` → "N and a half" / "N and three quarters" / "N and N {ordinal}s"
   - a bare `a/b` with small integers → "one eighth", "three quarters", "one half" (only when a, b ≤ 16)
   - `24/7` → "twenty-four seven" (special case)
3. **Word slash:** `word/word` → `word, word` (a comma gives the pause). Leave URLs alone.
4. **Dashes:** `—`, `–`, `--` and a spaced ` - ` → `, `. Hyphens inside words stay.
5. **Ellipsis:** `...` / `…` → `, ` mid-line, `.` at the end.
6. **Money:** `$N` (with optional `,`/decimals) and an optional scale word (`million|billion|thousand|trillion`) → "N {scale} dollars". Leave `$` out of the year rule.
7. **`#N`** → "number N". **`No. N`** → "number N".
8. **Abbreviations:** `vs.` → "versus", `Mt.` → "Mount". The rest (`Dr.`, `St.`, `Jr.`, `Sr.`) espeak already reads correctly, so leave them alone.
9. **Years and decades:**
   - Context: a 4-digit number with no comma, 1000–2099, not after `$` and not before `%` or a count word (people, miles, feet, pounds, years, times, copies, votes, points, …; keep the list in code), is a year.
   - 1000–1999 and 2010–2099 in pairs ("sixteen eighty-nine", "twenty fifteen"); x00 → "N hundred"; x01–x09 → "N oh M"; 2000–2009 → "two thousand (M)".
   - `NNNNs` → "… sixties" / "… hundreds"; `'NNs` / `NNs` → "eighties".
   - Write the words out, so espeak just reads words.
10. **Roman numerals:**
    - A token matching a valid numeral, all capitals, 2+ letters (`II`–`XXXIX`, plus `XL`, `L`… up to `MMXXX`; validate with the canonical regex).
    - The previous word decides how it's read:
      - in `NUMBERED_THINGS` (War, Bowl, Part, Chapter, Act, Scene, Book, Volume, Episode, Phase, Title, Apollo, Rocky, Saw, Jaws, Psalm, Grade, Level, Stage, Section, Article, Class, Type, Vatican, Gemini, Mercury) → cardinal
      - otherwise a capitalized word → "the {Ordinal}"
      - anything else → leave the token alone
    - One-letter `I`, `V`, `X`: only after a name in `REGNAL_NAMES` (Henry, Edward, George, William, Richard, Charles, James, John, Elizabeth, Mary, Louis, Philip, Frederick, Ferdinand, Peter, Catherine, Alexander, Nicholas, Napoleon, Pius, Leo, Gregory, Benedict, Innocent, Clement, Paul, Ramses, Amenhotep, Thutmose, Henri, Carlos, Juan, Gustav, Victor, Emmanuel, Wilhelm, Otto, Constantine, Justinian) → "the {Ordinal}". Also `World War I` → "World War One".
    - Never touch `D.C.`, `CD`, `DVD`, `MIX`, `CIVIL`, `DC`, `MD`, `LCD`, `X` after a non-regnal word (Malcolm X), or a numeral inside a longer all-caps phrase (category names spoken at Final: `WORLD WAR II` in caps → still "two"; the context is the previous word, case-insensitively).
11. **`&`** → "and" (today's rule, kept last).
12. **Clean-up:** remove characters espeak would read as symbol names and that no rule handled (emoji, `*`, `~`, `^`, `|`, `<`, `>`, `\`); collapse repeated commas and spaces.

Things that already sound right, so leave them alone: quotes, `;`, `:`, `%`, `4th`, `1,500`, units, acronyms, category names in capitals.

**Parentheses** get pauses: `(` → `, ` and `)` → `,` (unless punctuation follows). Without this espeak runs straight through them.

### 2. `web/`: chunking (`web/src/lib/piper/sentences.ts`, `web/src/lib/narrator.ts`)

The goal: no intonation reset inside a phrase, and no gap.

- **Chunk plan** (`narrationChunks`):
  - **Piece 1:** up to the first clause punctuation (`, ; : —` or a sentence end) within the first **10** words. If there is none, cut at word 7. This is the only cut allowed without punctuation.
  - **Later pieces:** up to the sentence end. If that's more than `2 ×` the previous piece's words, cut at the clause punctuation closest to that bound. With no punctuation in reach, keep the whole sentence; the growth limit is a target, not a hard cap.
  - A 30-word clue with no punctuation is therefore 2 pieces (7 + 23).
- **Generate ahead:** `prepareNarration` (called at the start of the 2.25 s reveal) generates **all** pieces in order, not only the first, so later pieces get the reveal as a head start. `narrate` uses the prepared promises. Keep one worker; generation is sequential.
- **Intonation:** a piece that was cut without punctuation (the piece-1 fallback) ends where espeak would otherwise drop the pitch. Generate it with a trailing `,` appended (the comma isn't spoken, and espeak gives a continuing intonation). Check by ear, and keep it only if it helps.
- **Trim silence:** remove leading and trailing silence from each generated piece except the line's last (threshold-based, on `Audio.samples`), then add a fixed **120 ms** gap after a piece that ended on punctuation and **0 ms** otherwise. Today Piper's own padding sits at every cut.
- `MAX_NARRATION_CHUNK_WORDS` goes; document the new plan in the file header.

**Measure before merging** (record it in the PR): on an iPhone host with Norman, the time from clue on screen to first audio (must stay ≤ 1 s) and any gap between pieces, on the three longest clues in the test fixture. If piece 2 of a 30-word no-punctuation clue gaps by more than 300 ms, allow one more punctuation-free cut: split piece 2 at the word nearest 2× piece 1 (7 + 14 + 9). That is a deviation from the product brief's "at most two pieces"; note it and the measurement in the PR.

### 3. Docs

See "Docs to update".

## Key files

| Subtask | Files |
|---|---|
| 1 | `web/src/lib/spokenText.ts` (new), `web/src/lib/spokenText.test.ts` (exists: extend), `web/src/lib/speech.ts` |
| 2 | `web/src/lib/piper/sentences.ts`, `sentences.test.ts`, `web/src/lib/narrator.ts`, `narrator.test.ts`, `web/src/lib/piper/audio.ts` (silence trim) |

## Contracts

All preserved. No `shared/` change. `reading_done` timing semantics are unchanged: it is sent when the last piece ends.

## Success criteria

- Every row of the product brief's Roman numeral, punctuation, and years tables maps to the spoken text shown (unit tests). The on-screen text is unchanged.
- A 30-word clue with no punctuation gives 2 pieces; a clue with commas is cut only at punctuation after piece 1.
- On an iPhone host the first word is heard ≤ 1 s after the clue appears, and there are no audible gaps or pitch resets on 10 catalog clues of 25+ words (the PR records which clues were listened to).

## Test plan

- `spokenText.test.ts`:
  - one table test per product-brief table, plus the "leave alone" cases (Malcolm X, D.C., MIX, CD, Dr., St. Louis, 50%, 1,500, 1689 people, $1,000)
  - the order of rules: `$1,000` isn't read as a year; `(1601)` is a year with pauses
- `sentences.test.ts`: the chunk plan (10-word punctuation piece 1, 7-word fallback, the growth rule, no cut without punctuation after piece 1, a 30-word clue → 2 pieces).
- `narrator.test.ts`:
  - `prepareNarration` generates all pieces in order, and `narrate` reuses them
  - a stop mid-line still stops
  - a failed later piece is still "skipped" after what played
  - trimmed silence plus a 120 ms gap at punctuation cuts (use a fake engine returning padded buffers)
- Commands:
  ```bash
  mise run test:web -- src/lib/spokenText.test.ts src/lib/piper/sentences.test.ts src/lib/narrator.test.ts
  ```
- Hand check (not CI): `node` + the bundled `piper_phonemize` on the product-brief phrases, to confirm espeak gets the rewritten words (the method used for the product brief).

## Logging requirements

None. No log lines change. (Narrator skip telemetry belongs to GH-241.)

## Docs to update

- `docs/product-docs/features/gameplay/feature-brief.md`, "The narrator's voice": a bullet saying the narrator reads numerals, years, fractions, blanks and symbols as a host would, while the screen shows the clue as written; and that long clues are read in pieces cut only at punctuation.
- File headers of `sentences.ts` and `narrator.ts` (the chunk plan).

## Branch
`bug-fix/narrator-reading-impl`, from and into `develop` (no GH key: Actions is down, so no issue is created)
