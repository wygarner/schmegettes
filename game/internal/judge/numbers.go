package judge

import "strconv"

// Spoken numbers are folded to digits so "eighteen twelve" and "1812" compare equal.

var units = map[string]int{
	"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
	"eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
	"fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
}

var tens = map[string]int{
	"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70,
	"eighty": 80, "ninety": 90,
}

var scales = map[string]int{"hundred": 100, "thousand": 1000, "million": 1000000}

func isNumberWord(w string) bool {
	_, u := units[w]
	_, t := tens[w]
	_, s := scales[w]
	return u || t || s
}

// foldNumbers replaces each run of number words with its digits.
// "two thousand and eight" → "2008", "nineteen eighty four" → "1984", "four hundred" → "400".
func foldNumbers(words []string) []string {
	out := make([]string, 0, len(words))
	for i := 0; i < len(words); {
		if !isNumberWord(words[i]) {
			out = append(out, words[i])
			i++
			continue
		}
		j := i
		for j < len(words) && (isNumberWord(words[j]) ||
			// "and" inside a number: "two hundred and five"
			(words[j] == "and" && j+1 < len(words) && isNumberWord(words[j+1]) && j > i)) {
			j++
		}
		out = append(out, spokenNumber(words[i:j]))
		i = j
	}
	return out
}

// spokenNumber reads one run of number words. Without a scale word ("hundred", ...) the run is
// read as chunks of 0–99 written one after another, the way years are said ("eighteen twelve").
func spokenNumber(run []string) string {
	type chunk struct{ v, scale int }
	var chunks []chunk
	for k := 0; k < len(run); k++ {
		w := run[k]
		switch {
		case w == "and":
		case scales[w] > 0:
			chunks = append(chunks, chunk{scale: scales[w]})
		case tens[w] > 0:
			v := tens[w]
			if k+1 < len(run) && units[run[k+1]] > 0 && units[run[k+1]] < 10 {
				v += units[run[k+1]]
				k++
			}
			chunks = append(chunks, chunk{v: v})
		default:
			chunks = append(chunks, chunk{v: units[w]})
		}
	}

	hasScale := false
	for _, c := range chunks {
		if c.scale > 0 {
			hasScale = true
		}
	}
	if !hasScale {
		s := ""
		for _, c := range chunks {
			s += strconv.Itoa(c.v)
		}
		return s
	}

	total, current := 0, 0
	for _, c := range chunks {
		switch {
		case c.scale == 100:
			if current == 0 {
				current = 1
			}
			current *= 100
		case c.scale > 0:
			if current == 0 {
				current = 1
			}
			total += current * c.scale
			current = 0
		default:
			current += c.v
		}
	}
	return strconv.Itoa(total + current)
}
