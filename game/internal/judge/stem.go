package judge

import "strings"

// linking words are ignored by the same-words rule: "battle of hastings" is the same words
// as "Hastings, Battle of", and "rock and roll" as "roll and rock".
var linking = map[string]bool{
	"of": true, "and": true, "in": true, "on": true, "to": true, "for": true, "with": true,
	"at": true, "by": true, "from": true, "the": true, "a": true, "an": true,
}

// suffixes are stripped by stem, longest first.
var suffixes = []string{"ations", "ation", "ings", "ing", "ions", "ion", "ers", "er", "ies", "ied", "es", "ed", "s"}

// stem reduces a word to a rough root so forms of it compare equal: "exploration",
// "exploring", "explore" and "explored" are all "explor"; "caves" and "cave" are "cav". It
// keeps at least 3 letters, and numbers are left alone.
func stem(w string) string {
	if strings.IndexFunc(w, isDigitRune) >= 0 {
		return w
	}
	for _, suf := range suffixes {
		if len(w)-len(suf) >= 3 && strings.HasSuffix(w, suf) {
			w = strings.TrimSuffix(w, suf)
			if suf == "ies" || suf == "ied" {
				w += "y"
			}
			break
		}
	}
	if len(w) > 3 && strings.HasSuffix(w, "e") {
		w = strings.TrimSuffix(w, "e")
	}
	return w
}

func isDigitRune(r rune) bool { return r >= '0' && r <= '9' }

// silentStarts are first letters that aren't sounded: "nee" and "knee" are the same word.
var silentStarts = [][2]string{{"kn", "n"}, {"gn", "n"}, {"wr", "r"}, {"ps", "s"}, {"wh", "w"}}

// unsilence drops a silent first letter. Words of 2 letters or fewer are left alone.
func unsilence(w string) string {
	if len(w) <= 2 {
		return w
	}
	for _, p := range silentStarts {
		if strings.HasPrefix(w, p[0]) {
			return p[1] + w[len(p[0]):]
		}
	}
	return w
}

// meaningful lists the words the same-words rule compares: no linking words.
func meaningful(s string) []string {
	var out []string
	for _, w := range strings.Fields(s) {
		if !linking[w] {
			out = append(out, w)
		}
	}
	return out
}

// sameWords: the answer has the same meaningful words as the response, in any order and in
// any form, each pairing with exactly one other. A pair matches when their stems are equal,
// one is a spelling slip of the other, or they sound alike. Responses of one word never
// use this rule: the whole-answer rules already cover them.
func sameWords(a, r string) bool {
	aw, rw := meaningful(a), meaningful(r)
	if len(rw) < 2 || len(aw) != len(rw) {
		return false
	}
	used := make([]bool, len(aw))
	// Pair the strongest matches first, so a loose match can't take a word a stronger one
	// needs ("loch lomond" / "lomond loch" style swaps).
	for _, level := range []func(x, y string) bool{sameStem, slipWord, soundsLikeWord} {
		for i, w := range rw {
			if w == "" {
				continue
			}
			for j, x := range aw {
				if !used[j] && level(x, w) {
					used[j] = true
					rw[i] = ""
					break
				}
			}
		}
	}
	for _, w := range rw {
		if w != "" {
			return false
		}
	}
	return true
}

func sameStem(a, b string) bool { return stem(a) == stem(b) }

// slipWord: one edit per five letters of the response word, keeping the first letter.
func slipWord(a, b string) bool {
	if strings.IndexFunc(a+b, isDigitRune) >= 0 {
		return a == b
	}
	return sameFirst(a, b) && levenshtein(stem(a), stem(b)) <= len([]rune(b))/5
}

// soundsLikeWord: the word sounds like the response word, for words longer than 4 letters.
func soundsLikeWord(a, b string) bool {
	if len([]rune(b)) <= 4 || strings.IndexFunc(a+b, isDigitRune) >= 0 {
		return false
	}
	return soundsAlike(a, b)
}
