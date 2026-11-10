// Package judge decides whether a player's answer matches a clue's correct response.
//
// It is deterministic and fast so a verdict is instant. Rules:
// docs/product-docs/features/gameplay/feature-brief.md ("How an answer is matched").
// Disputed answers can be appealed to the worker's LLM judge (shared/schemas/jobs, kind
// "appeal_answer").
package judge

import (
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"

	"schmegettes/game/internal/contracts"
)

// fillers are dropped before comparing: question phrasing and articles.
var fillers = map[string]bool{
	"what": true, "who": true, "where": true, "when": true, "is": true, "are": true,
	"was": true, "were": true, "the": true, "a": true, "an": true,
}

// abbreviations are expanded on both sides, so "st louis" matches "Saint Louis".
var abbreviations = map[string]string{"st": "saint", "mt": "mount", "dr": "doctor"}

// letters that don't decompose into a base letter and an accent.
var foldLetters = map[rune]string{'ø': "o", 'æ': "ae", 'œ': "oe", 'ß': "ss", 'ł': "l", 'đ': "d", 'ð': "d", 'þ': "th"}

// Normalize lowercases, folds accents, strips punctuation and parenthetical hints, removes
// question phrasing ("What is ...") and articles, expands St/Mt/Dr, and writes spoken numbers
// as digits.
func Normalize(s string) string {
	s = strings.ToLower(stripParens(s))
	var b strings.Builder
	rs := []rune(norm.NFD.String(s))
	for i, r := range rs {
		switch {
		case unicode.Is(unicode.Mn, r):
			// an accent, folded away
		case foldLetters[r] != "":
			b.WriteString(foldLetters[r])
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
		case r == ',' && i > 0 && i+1 < len(rs) && unicode.IsDigit(rs[i-1]) && unicode.IsDigit(rs[i+1]):
			// a thousands separator: "1,000"
		case r == '&':
			b.WriteString(" and ")
		default:
			b.WriteRune(' ')
		}
	}
	words := strings.Fields(b.String())
	kept := words[:0]
	for _, w := range words {
		if fillers[w] {
			continue
		}
		if full, ok := abbreviations[w]; ok {
			w = full
		}
		kept = append(kept, w)
	}
	return strings.Join(foldNumbers(kept), " ")
}

// Result is a verdict and why.
type Result struct {
	Correct bool
	Rule    contracts.MatchRule
	// Index is the transcript that decided it, or 0 when none matched.
	Index int
}

// Judge checks each transcript in order, most likely first. The first that matches decides,
// with the strongest rule it passed: exact, then spelling_slip, then sounds_alike.
func Judge(heard []string, response string) Result {
	if allEmpty(heard) {
		return Result{Rule: contracts.MatchRuleNothingHeard}
	}
	r := Normalize(response)
	if r == "" {
		return Result{Rule: contracts.MatchRuleNoMatch}
	}
	for i, h := range heard {
		if rule, ok := match(Normalize(h), r); ok {
			return Result{Correct: true, Rule: rule, Index: i}
		}
	}
	return Result{Rule: contracts.MatchRuleNoMatch}
}

// IsCorrect reports whether one answer matches response.
func IsCorrect(answer, response string) bool {
	return Judge([]string{answer}, response).Correct
}

func allEmpty(heard []string) bool {
	for _, h := range heard {
		if strings.TrimSpace(h) != "" {
			return false
		}
	}
	return true
}

func match(a, r string) (contracts.MatchRule, bool) {
	if a == "" {
		return "", false
	}
	if a == r {
		return contracts.MatchRuleExact, true
	}
	// Numbers must be the same number: no typo or sound leeway on digits.
	if digits(a) != digits(r) {
		return "", false
	}
	// One edit per five characters of the response, keeping the first letter: "russia" isn't
	// Prussia. A first letter that sounds the same is left to soundsAlike ("candinsky").
	if sameFirst(a, r) && levenshtein(a, r) <= len([]rune(r))/5 {
		return contracts.MatchRuleSpellingSlip, true
	}
	if soundsAlike(a, r) {
		return contracts.MatchRuleSoundsAlike, true
	}
	return "", false
}

// soundsAlike: the whole answer sounds like the whole response, and is spelled close enough
// that unrelated words sharing sounds don't pass ("pierce" for Paris). Short one-word
// responses (4 letters or fewer) keep the spelling rule only.
func soundsAlike(a, r string) bool {
	ra := strings.ReplaceAll(r, " ", "")
	if !strings.Contains(r, " ") && len([]rune(ra)) <= 4 {
		return false
	}
	ka, kr := phoneticKey(a), phoneticKey(r)
	if ka != kr && !silentDrop(ka, kr) {
		return false
	}
	aa := strings.ReplaceAll(a, " ", "")
	return levenshtein(aa, ra)*5 <= len([]rune(ra))*3 // at most 60% of the response's letters
}

func sameFirst(a, b string) bool {
	ra, rb := []rune(a), []rune(b)
	return len(ra) > 0 && len(rb) > 0 && ra[0] == rb[0]
}

// digits lists the numbers in s, in order: "war of 1812" → "1812".
func digits(s string) string {
	var out []string
	for _, w := range strings.Fields(s) {
		if strings.IndexFunc(w, unicode.IsDigit) >= 0 {
			out = append(out, w)
		}
	}
	return strings.Join(out, " ")
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
