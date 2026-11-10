package judge

import (
	"testing"

	"schmegettes/game/internal/contracts"
)

func TestNormalize(t *testing.T) {
	cases := []struct{ in, want string }{
		{"What is Paris?", "paris"},
		{"Who are The Beatles", "beatles"},
		{"Rock & Roll", "rock and roll"},
		{"(Abraham) Lincoln", "lincoln"},
		{"  the   Declaration of Independence ", "declaration of independence"},
		{"Dvořák", "dvorak"},
		{"Søren Kierkegaard", "soren kierkegaard"},
		{"St. Louis", "saint louis"},
		{"Mt. Everest", "mount everest"},
		{"War of 1812", "war of 1812"},
		{"war of eighteen twelve", "war of 1812"},
		{"nineteen eighty four", "1984"},
		{"two thousand and eight", "2008"},
		{"four hundred", "400"},
		{"nineteen hundred", "1900"},
		{"twenty one", "21"},
		{"catch twenty two", "catch 22"},
		{"$1,000", "1000"},
		{"one flew over the cuckoo's nest", "1 flew over cuckoo s nest"},
	}
	for _, c := range cases {
		if got := Normalize(c.in); got != c.want {
			t.Errorf("Normalize(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestIsCorrect(t *testing.T) {
	cases := []struct {
		answer, response string
		want             bool
	}{
		// Before sound-alike matching.
		{"what is paris", "Paris", true},
		{"Pariss", "Paris", true}, // one edit allowed for a five-letter response
		{"Parris", "Paris", true},
		{"London", "Paris", false},
		{"Australia", "Australia", true},
		{"Austria", "Australia", false},
		{"", "Paris", false},
		{"declaration of independance", "The Declaration of Independence", true},
	}
	for _, c := range cases {
		if got := IsCorrect(c.answer, c.response); got != c.want {
			t.Errorf("IsCorrect(%q, %q) = %v, want %v", c.answer, c.response, got, c.want)
		}
	}
}

// The table in docs/product-docs/features/gameplay/feature-brief.md ("How an answer is
// matched"), plus guards against false positives.
func TestJudgeRules(t *testing.T) {
	const (
		exact   = contracts.MatchRuleExact
		slip    = contracts.MatchRuleSpellingSlip
		sounds  = contracts.MatchRuleSoundsAlike
		noMatch = contracts.MatchRuleNoMatch
	)
	cases := []struct {
		heard, response string
		correct         bool
		rule            contracts.MatchRule
	}{
		// ✓ in the feature brief
		{"mona lowa", "Mauna Loa", true, sounds},
		{"linkin", "Lincoln", true, sounds},
		{"sane", "Seine", true, sounds},
		{"neechee", "Nietzsche", true, sounds},
		{"war of eighteen twelve", "War of 1812", true, exact},
		{"dvorak", "Dvořák", true, exact},
		{"st louis", "Saint Louis", true, exact},
		// ✗ in the feature brief
		{"austria", "Australia", false, noMatch},
		{"russia", "Prussia", false, noMatch},
		{"kilauea", "Mauna Loa", false, noMatch},
		{"eighteen twenty one", "1812", false, noMatch},
		{"soos", "Zeus", false, noMatch},
		// More sound-alikes
		{"maunaloa", "Mauna Loa", true, slip},
		{"chi kof ski", "Tchaikovsky", true, sounds},
		{"yo semitee", "Yosemite", true, sounds},
		{"grenich", "Greenwich", true, sounds},
		{"what is crack a toe a", "Krakatoa", true, sounds},
		{"sane river", "Seine River", true, slip},
		{"candinsky", "Kandinsky", true, sounds}, // same first sound, different letter
		{"what is the war of eighteen twelve", "War of 1812", true, exact},
		{"mount everest", "Mt. Everest", true, exact},
		// More that must stay wrong
		{"pierce", "Paris", false, noMatch},
		{"mel", "Mali", false, noMatch},
		{"paris or london", "Paris", false, noMatch},
		{"war of eighteen twenty one", "War of 1812", false, noMatch},
		{"apollo eleven", "Apollo 13", false, noMatch},
		{"swedish", "Sweden", false, noMatch},
		{"venice", "Venus", false, noMatch},
		{"saturn", "Satan", false, noMatch},
		{"brussels", "Russell", false, noMatch},
		{"hampton", "Hamilton", false, noMatch},
		{"oslo", "Olso", false, noMatch}, // short: spelling only, and two edits
		{"ra", "Re", false, noMatch},
		{"rance", "France", false, noMatch}, // a spelling slip keeps the first letter
	}
	for _, c := range cases {
		got := Judge([]string{c.heard}, c.response)
		if got.Correct != c.correct || got.Rule != c.rule {
			t.Errorf("Judge(%q, %q) = %v/%s, want %v/%s", c.heard, c.response, got.Correct, got.Rule, c.correct, c.rule)
		}
	}
}

func TestJudgeTranscripts(t *testing.T) {
	cases := []struct {
		name     string
		heard    []string
		response string
		want     Result
	}{
		{"the first match decides", []string{"lyon", "paris"}, "Paris", Result{true, contracts.MatchRuleExact, 1}},
		{"the most likely match wins over a stronger rule", []string{"linkin", "lincoln"}, "Lincoln", Result{true, contracts.MatchRuleSoundsAlike, 0}},
		{"none match", []string{"lyon", "nice"}, "Paris", Result{false, contracts.MatchRuleNoMatch, 0}},
		{"nothing heard", []string{""}, "Paris", Result{false, contracts.MatchRuleNothingHeard, 0}},
		{"only blanks", []string{" ", ""}, "Paris", Result{false, contracts.MatchRuleNothingHeard, 0}},
		{"no transcripts", nil, "Paris", Result{false, contracts.MatchRuleNothingHeard, 0}},
		{"only filler words", []string{"what is"}, "Paris", Result{false, contracts.MatchRuleNoMatch, 0}},
		{"an empty first transcript is skipped", []string{"", "paris"}, "Paris", Result{true, contracts.MatchRuleExact, 1}},
	}
	for _, c := range cases {
		if got := Judge(c.heard, c.response); got != c.want {
			t.Errorf("%s: Judge(%q, %q) = %+v, want %+v", c.name, c.heard, c.response, got, c.want)
		}
	}
}

func TestPhoneticKey(t *testing.T) {
	cases := []struct{ in, want string }{
		{"mona lowa", "MANALA"},
		{"mauna loa", "MANALA"},
		{"nietzsche", "NAXA"},
		{"lincoln", "LANKALN"},
		{"knight", "NAT"},
		{"1100 years", "1100YARS"},
	}
	for _, c := range cases {
		if got := phoneticKey(c.in); got != c.want {
			t.Errorf("phoneticKey(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func BenchmarkJudge(b *testing.B) {
	heard := []string{"what is mona lowa", "mona lower", "moaner lower", "mauna lower", "mona low a"}
	for b.Loop() {
		Judge(heard, "Mauna Loa (in Hawaii)")
	}
}
