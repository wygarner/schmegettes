package room

import (
	"context"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"

	"schmegettes/game/internal/contracts"
	"schmegettes/game/internal/play"
)

// Instruments come from the global meter provider: no-ops until telemetry.Setup installs an
// exporter. Attributes never carry user ids or room codes (cardinality and privacy).
// Names and meanings: docs/system-docs/operations/observability.md.
var (
	meter  = otel.Meter("schmegettes/game/room")
	tracer = otel.Tracer("schmegettes/game/room")

	buzzToVerdict, _ = meter.Float64Histogram("schmegettes.buzz_to_verdict", metric.WithUnit("ms"),
		metric.WithDescription("From the winning buzz to the judged answer"))
	judgeVerdicts, _ = meter.Int64Counter("schmegettes.judge.verdicts",
		metric.WithDescription("Judged answers, by match_rule and verdict"))
	recordErrors, _ = meter.Int64Counter("schmegettes.judge.errors",
		metric.WithDescription("Failed writes of judged answers and other game records, by op"))
	roomsCrashed, _ = meter.Int64Counter("schmegettes.rooms.crashed",
		metric.WithDescription("Room loops that panicked"))
	phaseStuck, _ = meter.Int64Counter("schmegettes.phase.stuck",
		metric.WithDescription("Phases that outlived their deadline by more than 30 s"))
)

// RegisterGauges reports the hub's open rooms, by phase group (lobby or in_game).
func (h *Hub) RegisterGauges() error {
	gauge, err := meter.Int64ObservableGauge("schmegettes.rooms.open",
		metric.WithDescription("Rooms running on this instance, by phase group"))
	if err != nil {
		return err
	}
	_, err = meter.RegisterCallback(func(_ context.Context, o metric.Observer) error {
		counts := map[string]int64{"lobby": 0, "in_game": 0}
		h.mu.Lock()
		for _, r := range h.rooms {
			if g, ok := r.group.Load().(string); ok {
				counts[g]++
			}
		}
		h.mu.Unlock()
		for g, n := range counts {
			o.ObserveInt64(gauge, n, metric.WithAttributes(attribute.String("phase_group", g)))
		}
		return nil
	}, gauge)
	return err
}

func opName(k play.RecordKind) string {
	switch k {
	case play.RevealClue:
		return "reveal_clue"
	case play.RecordAnswer:
		return "record_answer"
	case play.FinishClue:
		return "finish_clue"
	case play.EndGame:
		return "end_game"
	case play.RecordWager:
		return "record_wager"
	case play.SubmitFinalAnswer:
		return "submit_final_answer"
	case play.UpdateVerdict:
		return "update_verdict"
	}
	return "unknown"
}

// Traced wraps a Store so every call is a span (a child of the socket session that caused
// it, when there is one). Spans carry the room id, never answers or names.
func Traced(s Store) Store { return tracedStore{s} }

type tracedStore struct{ s Store }

func span(ctx context.Context, name, roomID string) (context.Context, trace.Span) {
	return tracer.Start(ctx, "store."+name, trace.WithAttributes(attribute.String("room_id", roomID)))
}

func end(sp trace.Span, err error) {
	if err != nil {
		sp.RecordError(err)
		sp.SetStatus(codes.Error, "")
	}
	sp.End()
}

func (t tracedStore) Load(ctx context.Context, roomID string) (Lobby, error) {
	ctx, sp := span(ctx, "Load", roomID)
	l, err := t.s.Load(ctx, roomID)
	end(sp, err)
	return l, err
}

func (t tracedStore) SetName(ctx context.Context, roomID, userID, name string) error {
	ctx, sp := span(ctx, "SetName", roomID)
	err := t.s.SetName(ctx, roomID, userID, name)
	end(sp, err)
	return err
}

func (t tracedStore) RenameMember(ctx context.Context, roomID, userID, name string) error {
	ctx, sp := span(ctx, "RenameMember", roomID)
	err := t.s.RenameMember(ctx, roomID, userID, name)
	end(sp, err)
	return err
}

func (t tracedStore) SetHostPlays(ctx context.Context, roomID string, plays bool) error {
	ctx, sp := span(ctx, "SetHostPlays", roomID)
	err := t.s.SetHostPlays(ctx, roomID, plays)
	end(sp, err)
	return err
}

func (t tracedStore) Leave(ctx context.Context, roomID, userID string) error {
	ctx, sp := span(ctx, "Leave", roomID)
	err := t.s.Leave(ctx, roomID, userID)
	end(sp, err)
	return err
}

func (t tracedStore) StartGame(ctx context.Context, roomID string) (string, error) {
	ctx, sp := span(ctx, "StartGame", roomID)
	id, err := t.s.StartGame(ctx, roomID)
	end(sp, err)
	return id, err
}

func (t tracedStore) StartResumed(ctx context.Context, roomID string) (string, error) {
	ctx, sp := span(ctx, "StartResumed", roomID)
	id, err := t.s.StartResumed(ctx, roomID)
	end(sp, err)
	return id, err
}

func (t tracedStore) HostCanHost(ctx context.Context, roomID string) (bool, error) {
	ctx, sp := span(ctx, "HostCanHost", roomID)
	ok, err := t.s.HostCanHost(ctx, roomID)
	end(sp, err)
	return ok, err
}

func (t tracedStore) Close(ctx context.Context, roomID string) error {
	ctx, sp := span(ctx, "Close", roomID)
	err := t.s.Close(ctx, roomID)
	end(sp, err)
	return err
}

func (t tracedStore) LoadGame(ctx context.Context, roomID string) (GameData, error) {
	ctx, sp := span(ctx, "LoadGame", roomID)
	g, err := t.s.LoadGame(ctx, roomID)
	end(sp, err)
	return g, err
}

func (t tracedStore) RevealClue(ctx context.Context, clueID string) error {
	ctx, sp := tracer.Start(ctx, "store.RevealClue")
	err := t.s.RevealClue(ctx, clueID)
	end(sp, err)
	return err
}

func (t tracedStore) RecordAnswer(ctx context.Context, rec play.Record) error {
	ctx, sp := tracer.Start(ctx, "store.RecordAnswer")
	err := t.s.RecordAnswer(ctx, rec)
	end(sp, err)
	return err
}

func (t tracedStore) RecordWager(ctx context.Context, rec play.Record) error {
	ctx, sp := tracer.Start(ctx, "store.RecordWager")
	err := t.s.RecordWager(ctx, rec)
	end(sp, err)
	return err
}

func (t tracedStore) SubmitFinalAnswer(ctx context.Context, rec play.Record) error {
	ctx, sp := tracer.Start(ctx, "store.SubmitFinalAnswer")
	err := t.s.SubmitFinalAnswer(ctx, rec)
	end(sp, err)
	return err
}

func (t tracedStore) UpdateVerdict(ctx context.Context, rec play.Record) error {
	ctx, sp := tracer.Start(ctx, "store.UpdateVerdict")
	err := t.s.UpdateVerdict(ctx, rec)
	end(sp, err)
	return err
}

func (t tracedStore) FinishClue(ctx context.Context, clueID string, state contracts.ClueState) error {
	ctx, sp := tracer.Start(ctx, "store.FinishClue")
	err := t.s.FinishClue(ctx, clueID, state)
	end(sp, err)
	return err
}

func (t tracedStore) EndGame(ctx context.Context, gameID string, status contracts.GameStatus) error {
	ctx, sp := tracer.Start(ctx, "store.EndGame", trace.WithAttributes(attribute.String("game_id", gameID)))
	err := t.s.EndGame(ctx, gameID, status)
	end(sp, err)
	return err
}
