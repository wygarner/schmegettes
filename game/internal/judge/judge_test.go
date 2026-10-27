package judge

import "testing"

func TestNormalize(t *testing.T) {
	cases := []struct{ in, want string }{
		{"What is Paris?", "paris"},
		{"Who are The Beatles", "beatles"},
		{"Rock & Roll", "rock and roll"},
		{"(Abraham) Lincoln", "lincoln"},
		{"  the   Declaration of Independence ", "declaration of independence"},
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
