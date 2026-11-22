---
task-type: bug-fix
task-title: "Narrator: smooth long clues, Roman numerals, punctuation, years"
---
**Task Type:** Bug Fix. Production QA (2026-11-22): "The narrator sounds jumbled on long clues, does not read roman numerals correctly, struggles with punctuation." The narrator's rules are in the [gameplay feature brief](../../docs/product-docs/features/gameplay/feature-brief.md#the-narrators-voice). Nothing there says how text becomes speech; this task adds that.

**Problem:** Four defects, all in how a line's text is prepared before the Piper voice speaks it (`web/src/lib/piper/sentences.ts`, `spokenText` in `web/src/lib/speech.ts`):

1. **Long clues sound jumbled.** To start reading within 1 s, a line is cut into pieces of at most 7 words, and each piece is generated on its own. Each piece gets its own intonation: the pitch drops at its end as if the sentence were over, then restarts mid-phrase. Season 38 clues average 16 words, so most clues are read as 3 or more "sentences"; 20% are over 20 words.
2. **Roman numerals are read wrong.** espeak-ng, which turns the text into sounds, says "World War **roman** two", "Henry **roman** eight", "Louis **roman** fourteen", "Super Bowl **X L**" (spelled), "Elizabeth **eye**". 1.2% of clues (about one every two games) have one, and correct responses do too ("Correct, Henry VIII is the right answer.").
3. **Punctuation and symbols are read literally, dropped, or ignored.** Only "&" is changed today. What the voice actually says:
   - "Connect ____": the blank is silently dropped ("Connect"). 0.7% of clues.
   - "4 1/2 inches": "four one **slash** two inches"; "and/or": "and slash or". 0.6% of clues have a slash.
   - "us—Guatemala City", "word -- word": no pause at all; the words run together. 1.5% of clues.
   - "music... bodies never lie": no pause; "music bodies" run together. 1.9% of clues.
   - "$5 million": "**dollar** five million"; "#1 song": "**hash** one song"; "Smith vs. Jones": "Smith **V S** Jones"; "Mt. Everest": "**M T** Everest".
4. **Years and decades are read as plain numbers.** This is the most common of all: 40% of clues contain digits. "in 1689": "one thousand six hundred eighty-nine"; "the 1960s": "nineteen hundred sixty **z**"; "the 1800s": "one thousand eight hundred **z**"; "the '80s": "eighty **z**".

(Checked on 2026-11-22 by running the app's own espeak-ng build on these phrases.)

**Outcomes:**
- A clue of any length sounds like one person reading it: no pitch drops or restarts inside a phrase.
- Roman numerals are read as a host would say them.
- Punctuation shapes the pauses and is never read out loud as a symbol name.
- Years and decades sound the way people say them.
- **The TV text doesn't change.** Only what is spoken changes; the screen shows the clue as written.

**Player flow:** unchanged. The pick reveal (2.25 s), then the clue on screen, the first word within 1 s of the clue appearing, buzzing opens when the reading ends, and a line that isn't ready in time is skipped ([gameplay](../../docs/product-docs/features/gameplay/feature-brief.md#reading-and-buzzing)). The server's fallback estimate (2.5 words per second plus 1 s, at most 14 s) doesn't change.

**Rules:**

*1. Reading a long line*
- A sentence is never broken in a way you can hear. Where the line has to be cut into pieces so reading starts on time, cuts fall **only at punctuation** (a comma, semicolon, colon, dash or ellipsis), never between two words that belong together.
- After the first piece, pieces get longer: each piece is generated while the one before it plays, so later pieces can be much longer than 7 words without a gap. A whole clue of 30 words with no commas is read as at most two pieces.
- No silence between pieces longer than a comma's pause.
- The first word is still heard within 1 s of the clue appearing (preparation during the reveal stays). If a long first piece can't meet that on the slowest supported host device, the first piece may end at a word boundary, but only that first cut.
- Same rules for every line: clues, Daily Double and Final lines, correct responses.

*2. Roman numerals* (only valid numerals in capital letters; the word before decides how it's read)

| Text | Spoken | Rule |
|---|---|---|
| Henry VIII, Elizabeth II, Pope Pius XII, Louis XIV, Thurston Howell III | "Henry the Eighth", "Elizabeth the Second", "Pope Pius the Twelfth"… | After a person's name: "the" + ordinal |
| Henry V, Pius X, Charles I, Elizabeth I | "Henry the Fifth", "Pius the Tenth", "Charles the First" | One-letter numerals (I, V, X) only after a known regnal name (monarchs and popes) |
| World War II, World War I | "World War Two", "World War One" | After "War": cardinal |
| Super Bowl XL, Rocky IV, Part II, Chapter XII, Act III, Apollo XIII, Episode IV | "Super Bowl forty", "Rocky four", "Part two"… | After a numbered-thing word (Bowl, Part, Chapter, Act, Scene, Book, Volume, Episode, Phase, Title, Apollo, Rocky…): cardinal |
| Malcolm X, the X's, DC, CD, MIX, CIVIL, MD, LCD | read as today | Not a numeral: one letter not after a regnal name, or a word or abbreviation |

An unlisted name before a numeral of two or more letters (a numbered person not on the list) gets the ordinal. Engineering keeps the regnal and numbered-thing lists; a wrong guess there is a small fix, not a redesign.

*3. Punctuation and symbols*

| Text | Spoken |
|---|---|
| "Connect ____", "____ Dark ____" | "Connect blank", "blank Dark blank" |
| — or -- or a spaced " - " | a short pause, like a comma |
| ... or … | a short pause |
| ( … ) | read, with a short pause before and after |
| 1/8, 4 1/2, 3/4 | "one eighth", "four and a half", "three quarters" |
| 24/7 | "twenty-four seven" |
| word/word ("and/or", "AC/DC") | the words, with a short pause, never "slash" |
| vs., Mt., No. 1 | "versus", "Mount", "number one" |
| #1 | "number one" |
| $5, $5 million, $1,000 | "five dollars", "five million dollars", "one thousand dollars" |
| & | "and" (as today) |

Already right today, keep as is: ";" and ":" (pause), quotes (never spoken), "50%", "Dr.", "St.", "4th", "1,500", "5 feet 10 inches", "NFL", category names in capitals.

*4. Years and decades*

| Text | Spoken | Rule |
|---|---|---|
| in 1689, in 1066, (1601) | "sixteen eighty-nine", "ten sixty-six", "sixteen oh one" | A four-digit number from 1000 to 1999 with no comma, not after "$" and not before "%": a year, read in pairs |
| in 1900, the year 1800 | "nineteen hundred", "eighteen hundred" | A year ending in 00 |
| in 2001, in 2015 | "two thousand one", "twenty fifteen" | 2000–2009 as "two thousand …"; 2010–2099 in pairs |
| the 1960s, the 1800s | "the nineteen sixties", "the eighteen hundreds" | A year + "s" is a decade or century |
| the '80s, the 80s | "the eighties" | Two digits + "s" |
| 1,500, $1,000, 1689 people | as numbers ("one thousand five hundred") | A comma, a "$", or a count word after it ("people", "miles", "feet") means it's not a year |

When in doubt, a four-digit number in 1000–2099 is read as a year: that is what it is in nearly every clue.

**Edge cases:**
- **A clue with no punctuation and 30+ words:** read as at most two pieces, with no gap you can hear.
- **A numeral that is also an abbreviation in context** ("Washington, D.C.", "MIX tape"): left as is. When in doubt, don't convert.
- **Text the narrator still can't read** (an emoji, a stray symbol): it's left out of the speech, the screen keeps it, and the rest of the line is read.
- **The host device can't keep up** (a later piece isn't ready when the previous one ends): a short gap, then reading continues, as today. Buzzing still opens only when the reading ends; the server's fallback estimate still applies if it never does.
- **Disconnect, timeout, late buzz:** unchanged. Nothing here touches game state or the server.

**Success Criteria:**
- Unit tests: every row of the Roman numeral and punctuation tables produces the spoken text shown; the TV's text is unchanged.
- Unit tests: a 30-word clue with no punctuation is cut into at most two pieces; a clue with commas is cut only at commas (except possibly the first cut).
- Listening check on the host device with the default voice (Norman), on 10 long clues from the catalog (25+ words): no pitch drop or restart in the middle of a phrase. The first word is still heard within 1 s of the clue appearing on an iPhone host.
- Listening check: "World War II", "Henry VIII", "Super Bowl XL", "Connect ____", "4 1/2 inches", "in 1689" and "the 1960s" sound as in the tables, in a clue and in a correct response.

**Out of scope:** New voices or a speed setting; changing the server's reading estimate; rewriting clue text in the catalog or the importer; reading parenthesized hints differently in correct responses (see the handoff); pronunciation of individual names and foreign words.
