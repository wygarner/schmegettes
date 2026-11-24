// Narration starts with a short piece (the first punctuation within ten words, or seven words
// as the one permitted punctuation-free cut). Later pieces grow toward twice the previous
// piece and cut only at clause or sentence punctuation. With no later punctuation, the whole
// remaining sentence stays together so Piper does not reset its intonation mid-phrase.

const FIRST_PUNCTUATION_LIMIT = 10;
const FIRST_FALLBACK_WORDS = 7;
const CLAUSE_END = /[,;:—–](?:["')\]]*)$/;
const SENTENCE_END = /(?:[.!?]|…)(?:["')\]]*)$/;

/** Keeps abbreviations like "U.S." and "Dr." together when finding sentence boundaries. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?]["')\]]?)\s+(?=["'(]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .reduce<string[]>((out, s) => {
      const prev = out.at(-1);
      if (prev && /(?:^|\s)(?:[A-Z]\.){1,3}$|(?:Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|vs)\.$/.test(prev)) {
        out[out.length - 1] = `${prev} ${s}`;
      } else {
        out.push(s);
      }
      return out;
    }, []);
}

const wordCount = (piece: string) => piece.split(/\s+/).filter(Boolean).length;
const punctuated = (word: string) => CLAUSE_END.test(word) || SENTENCE_END.test(word);

function closestClause(words: string[], start: number, end: number, target: number): number | null {
  let closest: number | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (let i = start; i < end; i++) {
    if (!CLAUSE_END.test(words[i] ?? "")) continue;
    const candidate = i + 1;
    const nextDistance = Math.abs(candidate - target);
    if (nextDistance < distance) {
      closest = candidate;
      distance = nextDistance;
    }
  }
  return closest;
}

/** Builds every synthesis piece for one line, without losing or reordering its words. */
export function narrationChunks(text: string): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  let firstEnd = -1;
  for (let i = 0; i < Math.min(words.length, FIRST_PUNCTUATION_LIMIT); i++) {
    if (punctuated(words[i] ?? "")) {
      firstEnd = i + 1;
      break;
    }
  }
  if (firstEnd < 0) firstEnd = Math.min(FIRST_FALLBACK_WORDS, words.length);

  const chunks = [words.slice(0, firstEnd).join(" ")];
  let start = firstEnd;
  let previousWords = firstEnd;
  while (start < words.length) {
    let sentenceEnd = words.length;
    for (let i = start; i < words.length; i++) {
      if (SENTENCE_END.test(words[i] ?? "")) {
        sentenceEnd = i + 1;
        break;
      }
    }

    const target = start + 2 * previousWords;
    let end = sentenceEnd;
    if (sentenceEnd > target) end = closestClause(words, start, sentenceEnd, target) ?? sentenceEnd;
    const piece = words.slice(start, end).join(" ");
    chunks.push(piece);
    previousWords = wordCount(piece);
    start = end;
  }
  return chunks;
}
