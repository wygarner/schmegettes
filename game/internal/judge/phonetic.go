package judge

import "strings"

// phoneticKey spells a normalized answer the way it sounds, so spellings of the same sounds
// compare equal: "mona lowa" and "mauna loa" are both "MANALA". Word breaks are dropped.
//
// Consonants map to one letter per sound, with voiced and unvoiced pairs merged (b/p, d/t,
// g/k, v/f, z/s). Every run of vowels becomes one "A", so the number of syllables still
// counts ("austria" ASTRA vs "australia" ASTRALA) but which vowel doesn't. Digits are kept.
func phoneticKey(normalized string) string {
	var b strings.Builder
	for _, w := range strings.Fields(normalized) {
		b.WriteString(wordKey(w))
	}
	// Collapse repeated letters (across word breaks too), but never digits: "1100" stays.
	key := b.String()
	var out strings.Builder
	for i := 0; i < len(key); i++ {
		c := key[i]
		if i > 0 && c == key[i-1] && !isDigit(c) {
			continue
		}
		out.WriteByte(c)
	}
	return out.String()
}

func isDigit(c byte) bool { return c >= '0' && c <= '9' }

func isVowel(c byte) bool { return strings.IndexByte("aeiouy", c) >= 0 }

func wordKey(w string) string {
	n := len(w)
	at := func(i int) byte {
		if i >= 0 && i < n {
			return w[i]
		}
		return 0
	}
	has := func(i int, s string) bool { return strings.HasPrefix(w[i:], s) }
	frontVowel := func(c byte) bool { return c == 'e' || c == 'i' || c == 'y' }

	var out []byte
	i := 0
	// Silent or changed first letters.
	switch {
	case has(0, "kn"), has(0, "gn"), has(0, "pn"), has(0, "wr"), has(0, "ps"):
		i = 1
	case has(0, "wh"):
		out, i = append(out, 'W'), 2
	case has(0, "x"):
		out, i = append(out, 'S'), 1
	}

	for i < n {
		c := w[i]
		switch {
		case isDigit(c):
			out = append(out, c)
			i++
		case c == 'y' && i == 0 && isVowel(at(1)):
			out = append(out, 'Y')
			i++
		case isVowel(c):
			out = append(out, 'A')
			i++
		case c == 'w' && i > 0 && isVowel(at(i-1)):
			out = append(out, 'A') // a glide: "ow", "aw", "ew"
			i++
		case has(i, "tzsch"):
			out, i = append(out, 'X'), i+5
		case has(i, "tsch"), has(i, "zsch"):
			out, i = append(out, 'X'), i+4
		case has(i, "sch"), has(i, "tch"):
			out, i = append(out, 'X'), i+3
		case has(i, "ch"):
			if at(i+2) == 'r' {
				out = append(out, 'K') // "chr": Christ
			} else {
				out = append(out, 'X')
			}
			i += 2
		case has(i, "sh"):
			out, i = append(out, 'X'), i+2
		case has(i, "ph"):
			out, i = append(out, 'F'), i+2
		case has(i, "th"):
			out, i = append(out, 'T'), i+2
		case has(i, "gh"):
			if i == 0 {
				out = append(out, 'K')
			}
			i += 2 // silent inside a word: "night", "Hugh"
		case has(i, "ck"):
			out, i = append(out, 'K'), i+2
		case has(i, "dg"):
			out, i = append(out, 'J'), i+2
		case has(i, "mb") && i+2 == n:
			out, i = append(out, 'M'), i+2
		case has(i, "sc") && frontVowel(at(i+2)):
			out, i = append(out, 'S'), i+2
		case c == 'c':
			if frontVowel(at(i + 1)) {
				out = append(out, 'S')
			} else {
				out = append(out, 'K')
			}
			i++
		case c == 'g':
			if frontVowel(at(i + 1)) {
				out = append(out, 'J')
			} else {
				out = append(out, 'K')
			}
			i++
		case c == 'h':
			if i == 0 && isVowel(at(1)) {
				out = append(out, 'H')
			}
			i++ // otherwise silent
		case c == 'x':
			out, i = append(out, 'K', 'S'), i+1
		default:
			if m := consonant(c); m != 0 {
				out = append(out, m)
			}
			i++
		}
	}
	return string(out)
}

func consonant(c byte) byte {
	switch c {
	case 'b', 'p':
		return 'P'
	case 'd', 't':
		return 'T'
	case 'k', 'q':
		return 'K'
	case 'v', 'f':
		return 'F'
	case 's', 'z':
		return 'S'
	case 'j':
		return 'J'
	case 'l', 'm', 'n', 'r', 'w':
		return c - 'a' + 'A'
	}
	return 0
}

// silentDrop reports whether a and b differ only by one L or W that one of them has and the
// other doesn't, away from the first sound: the silent letters in "Lincoln" (LANKALN, said
// "linkin") and "Greenwich" (KRANWAX, said "grenich").
func silentDrop(a, b string) bool {
	if len(a) < len(b) {
		a, b = b, a
	}
	if len(a) != len(b)+1 {
		return false
	}
	for i := 0; i < len(b); i++ {
		if a[i] != b[i] {
			return i > 0 && (a[i] == 'L' || a[i] == 'W') && a[i+1:] == b[i:]
		}
	}
	return false // the extra sound is last, not silent
}
