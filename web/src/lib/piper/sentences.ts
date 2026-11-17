/**
 * Splits a line into sentences so the first one (the announcement, "Here's Volcanoes for
 * 400.") can play while the rest is generated. Keeps abbreviations like "U.S." and "Dr." whole
 * enough: a split needs end punctuation followed by a space and a capital letter or digit.
 */
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
