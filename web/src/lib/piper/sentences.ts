/** At the accepted 0.5 realtime factor, seven spoken words synthesize in about 1.4 s. */
export const MAX_NARRATION_CHUNK_WORDS = 7;

/** Keeps abbreviations like "U.S." and "Dr." together when finding sentence boundaries. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?]["')\]]?)\s+(?=["'(]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .reduce<string[]>((out, s) => {
      // "U.S. Navy" splits after "U.S."; glue a piece back on when it ends with a lone initial.
      const prev = out.at(-1);
      if (prev && /(?:^|\s)(?:[A-Z]\.){1,3}$|(?:Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|vs)\.$/.test(prev)) {
        out[out.length - 1] = `${prev} ${s}`;
      } else {
        out.push(s);
      }
      return out;
    }, []);
}

/**
 * Small units Piper can generate before playback needs them. Sentence boundaries win, then
 * clause punctuation near the end of the bound, then a plain word boundary. Joining the chunks
 * with one space reconstructs the trimmed input exactly when its whitespace is already normal.
 */
export function narrationChunks(text: string): string[] {
  return splitSentences(text).flatMap((sentence) => boundedChunks(sentence));
}

function boundedChunks(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let start = 0; start < words.length; ) {
    let end = Math.min(start + MAX_NARRATION_CHUNK_WORDS, words.length);
    if (end < words.length) {
      // Prefer a natural pause in the latter half of this bounded chunk. Sentence punctuation
      // was already handled above; these are the useful mid-sentence pauses.
      const earliest = start + Math.ceil(MAX_NARRATION_CHUNK_WORDS / 2);
      for (let i = end - 1; i >= earliest; i--) {
        if (/[,;:—–]["')\]]?$/.test(words[i] ?? "")) {
          end = i + 1;
          break;
        }
      }
    }
    chunks.push(words.slice(start, end).join(" "));
    start = end;
  }
  return chunks;
}
