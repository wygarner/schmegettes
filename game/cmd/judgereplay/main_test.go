package main

import (
	"strings"
	"testing"
)

func TestReplayCounts(t *testing.T) {
	in := `heard,response,judge_verdict,final_verdict
cave exploration,Exploring Caves,incorrect,overridden_correct
nee,Knee,incorrect,overridden_correct
russia,Prussia,incorrect,overridden_incorrect
mona lowa | mauna loa,Mauna Loa,correct,correct
paris,London,incorrect,incorrect
`
	c, err := replay(strings.NewReader(in))
	if err != nil {
		t.Fatal(err)
	}
	if c.Rows != 5 || c.NewlyCorrect != 2 || c.FixesOverride != 2 || c.AgainstOverride != 0 || c.NewlyIncorrect != 0 {
		t.Errorf("counts %+v", c)
	}
	if c.Bad() != 0 {
		t.Errorf("bad %d", c.Bad())
	}
}

func TestReplayNeedsTheColumns(t *testing.T) {
	if _, err := replay(strings.NewReader("heard,response\nx,y\n")); err == nil {
		t.Error("a missing column wasn't reported")
	}
}
