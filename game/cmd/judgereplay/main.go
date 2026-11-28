// Command judgereplay re-judges past answers with the current judge and prints counts only,
// never the answers. It checks a judge change against what hosts actually overrode
// (lenient-judging, GH-339).
//
// Input on stdin is CSV with a header: heard,response,judge_verdict,final_verdict. heard is
// the transcripts joined with " | " (most likely first); judge_verdict is what the judge said
// then (correct or incorrect); final_verdict is the verdict after any override.
//
//	go run ./cmd/judgereplay < answers.csv
package main

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"schmegettes/game/internal/judge"
)

// Counts is what a replay found. Bad is the sum that must stay 0 for a judge change to ship.
type Counts struct {
	Rows int
	// NewlyCorrect: the old judge said incorrect, the new one says correct.
	NewlyCorrect int
	// FixesOverride: newly correct where the host had overridden to correct (the point).
	FixesOverride int
	// AgainstOverride: newly correct where the host had overridden to incorrect.
	AgainstOverride int
	// NewlyIncorrect: the old judge said correct, the new one says incorrect.
	NewlyIncorrect int
}

// Bad is how many rows the new judge gets newly wrong.
func (c Counts) Bad() int { return c.AgainstOverride + c.NewlyIncorrect }

func replay(r io.Reader) (Counts, error) {
	var c Counts
	rd := csv.NewReader(r)
	header, err := rd.Read()
	if err != nil {
		return c, fmt.Errorf("header: %w", err)
	}
	col := map[string]int{}
	for i, h := range header {
		col[strings.TrimSpace(h)] = i
	}
	for _, need := range []string{"heard", "response", "judge_verdict", "final_verdict"} {
		if _, ok := col[need]; !ok {
			return c, fmt.Errorf("missing column %q", need)
		}
	}
	for {
		rec, err := rd.Read()
		if errors.Is(err, io.EOF) {
			return c, nil
		}
		if err != nil {
			return c, fmt.Errorf("row %d: %w", c.Rows+1, err)
		}
		c.Rows++
		heard := strings.Split(rec[col["heard"]], " | ")
		was := rec[col["judge_verdict"]] == "correct"
		final := rec[col["final_verdict"]]
		now := judge.Judge(heard, rec[col["response"]]).Correct
		switch {
		case now && !was:
			c.NewlyCorrect++
			switch final {
			case "overridden_correct":
				c.FixesOverride++
			case "overridden_incorrect":
				c.AgainstOverride++
			}
		case !now && was:
			c.NewlyIncorrect++
		}
	}
}

func main() {
	c, err := replay(os.Stdin)
	if err != nil {
		fmt.Fprintln(os.Stderr, "judgereplay:", err)
		os.Exit(2)
	}
	fmt.Printf("rows %d\nnewly correct %d\n  fixes a host override to correct %d\n  against a host override to incorrect %d (must be 0)\nnewly incorrect %d (must be 0)\n",
		c.Rows, c.NewlyCorrect, c.FixesOverride, c.AgainstOverride, c.NewlyIncorrect)
	if c.Bad() > 0 {
		os.Exit(1)
	}
}
