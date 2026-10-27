// Package judge decides whether a player's answer matches a clue's correct response.
//
// It is deterministic and fast so a verdict is instant. Disputed answers can be appealed
// to the worker's LLM judge (shared/schemas/jobs, kind "appeal_answer").
package judge

import (
	"strings"
	"unicode"
)

// fillers are dropped before comparing: question phrasing and articles.
var fillers = map[string]bool{
	"what": true, "who": true, "where": true, "when": true, "is": true, "are": true,
	"was": true, "were": true, "the": true, "a": true, "an": true,
}

// Normalize lowercases, strips punctuation and parenthetical hints, and removes
// question phrasing ("What is ...") and articles.
func Normalize(s string) string {
	s = strings.ToLower(stripParens(s))
	var b strings.Builder
	for _, r := range s {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
		case r == '&':
			b.WriteString(" and ")
		default:
			b.WriteRune(' ')
		}
	}
	words := strings.Fields(b.String())
	kept := words[:0]
	for _, w := range words {
		if !fillers[w] {
			kept = append(kept, w)
		}
	}
	return strings.Join(kept, " ")
}

// IsCorrect reports whether answer matches response, allowing small typos:
// one edit per five characters of the normalized response.
func IsCorrect(answer, response string) bool {
	a, r := Normalize(answer), Normalize(response)
	if a == "" || r == "" {
		return false
	}
	if a == r {
		return true
	}
	allowed := len([]rune(r)) / 5
	return levenshtein(a, r) <= allowed
}

func stripParens(s string) string {
	var b strings.Builder
	depth := 0
	for _, r := range s {
		switch {
		case r == '(':
			depth++
		case r == ')' && depth > 0:
			depth--
		case depth == 0:
			b.WriteRune(r)
		}
	}
	return b.String()
}

func levenshtein(a, b string) int {
	ar, br := []rune(a), []rune(b)
	prev := make([]int, len(br)+1)
	curr := make([]int, len(br)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ar); i++ {
		curr[0] = i
		for j := 1; j <= len(br); j++ {
			cost := 1
			if ar[i-1] == br[j-1] {
				cost = 0
			}
			curr[j] = min(prev[j]+1, curr[j-1]+1, prev[j-1]+cost)
		}
		prev, curr = curr, prev
	}
	return prev[len(br)]
}
