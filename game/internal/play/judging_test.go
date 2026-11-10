package play

import (
	"slices"
	"testing"

	"schmegettes/game/internal/contracts"
)

// Judging records why: docs/product-docs/features/gameplay/feature-brief.md ("How an answer is matched").

func TestAnswerJudgesEachTranscript(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, bob, "s1"))
	f.must(f.g.Answer(f.now, bob, "s1", "night rogan", "nitrogen", "night"))

	if f.g.scores[bob] != 200 {
		t.Errorf("bob %d, want +200 from the second transcript", f.g.scores[bob])
	}
	r := recs(f, RecordAnswer)
	if len(r) != 1 || r[0].Answer != "nitrogen" || r[0].Rule != contracts.MatchRuleExact || r[0].MatchedIndex != 1 ||
		!slices.Equal(r[0].Heard, []string{"night rogan", "nitrogen", "night"}) {
		t.Errorf("record %+v", r)
	}
	if aj := last[contracts.AnswerJudged](t, f); aj.Answer != "nitrogen" {
		t.Errorf("the TV shows %q, want the transcript that matched", aj.Answer)
	}
}

func TestAnswerWithoutAlternativesIsJudgedAsBefore(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, bob, "s1"))
	f.must(f.g.Answer(f.now, bob, "s1", "oxygen"))
	r := recs(f, RecordAnswer)
	if len(r) != 1 || r[0].Verdict != contracts.VerdictIncorrect || r[0].Rule != contracts.MatchRuleNoMatch ||
		r[0].Answer != "oxygen" || !slices.Equal(r[0].Heard, []string{"oxygen"}) {
		t.Errorf("record %+v", r)
	}
}

func TestSilenceRecordsNothingHeard(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, alice, "s1"))
	f.toDeadline()
	r := recs(f, RecordAnswer)
	if len(r) != 1 || r[0].Verdict != contracts.VerdictIncorrect || r[0].Rule != contracts.MatchRuleNothingHeard || r[0].Answer != "" {
		t.Errorf("record %+v", r)
	}
}

func TestOverrideKeepsTheJudgesVerdict(t *testing.T) {
	f := atClueEnd(t, "oxygen", "")
	id := answerOf(t, f, bob)
	f.must(f.g.Override(f.now, host, id, true))
	f.must(f.g.Override(f.now, host, id, false)) // and back
	for _, r := range recs(f, UpdateVerdict) {
		if r.JudgeVerdict != contracts.VerdictIncorrect || r.Rule != contracts.MatchRuleNoMatch {
			t.Errorf("override record %+v, want the judge's incorrect/no_match", r)
		}
	}
}

func TestFinalRecordsRuleAndTranscript(t *testing.T) {
	f := setup(t, atFinal(map[string]int{alice: 1000, bob: 400}))
	f.must(f.g.Wager(f.now, alice, 500))
	f.must(f.g.Wager(f.now, bob, 300))
	f.toDeadline()
	f.must(f.g.TypedAnswer(f.now, alice, "f", "krakatoa"))
	f.must(f.g.TypedAnswer(f.now, bob, "f", "crack a toe a"))
	r := recs(f, RecordAnswer)
	if len(r) != 1 || r[0].Source != contracts.AnswerSourceTyped || r[0].Verdict != contracts.VerdictCorrect ||
		r[0].Rule != contracts.MatchRuleSoundsAlike || !slices.Equal(r[0].Heard, []string{"crack a toe a"}) {
		t.Errorf("bob's Final record %+v, want a sound-alike match", r)
	}
}
