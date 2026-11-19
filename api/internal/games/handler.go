package games

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"schmegettes/api/internal/contracts"
	"schmegettes/api/internal/server"
)

// Handler serves /v1/games.
type Handler struct {
	Store Store
}

type cursor struct {
	FinishedAt time.Time `json:"f"`
	GameID     string    `json:"g"`
}

func encodeCursor(g Summary) string {
	data, _ := json.Marshal(cursor{FinishedAt: g.FinishedAt, GameID: g.GameID})
	return base64.RawURLEncoding.EncodeToString(data)
}

func decodeCursor(s string) (*After, bool) {
	data, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, false
	}
	var c cursor
	if json.Unmarshal(data, &c) != nil || c.FinishedAt.IsZero() || uuid.Validate(c.GameID) != nil {
		return nil, false
	}
	return &After{FinishedAt: c.FinishedAt, GameID: c.GameID}, true
}

func (h Handler) fail(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, ErrNotFound) {
		server.Problem(w, http.StatusNotFound, "game-not-found", "This game isn't in your history")
		return
	}
	slog.ErrorContext(r.Context(), "game history request failed", "err", err,
		"request_id", server.RequestID(r.Context()), "user_id", server.Claims(r.Context()).UserID)
	server.Problem(w, http.StatusInternalServerError, "internal", "Something went wrong")
}

type stats struct {
	Games  int  `json:"games"`
	Played int  `json:"played"`
	Wins   int  `json:"wins"`
	Best   *int `json:"best"`
}

type page struct {
	Items      []contracts.GameSummary `json:"items"`
	NextCursor *string                 `json:"nextCursor"`
	Stats      *stats                  `json:"stats"`
}

// List handles GET /v1/games: the caller's ended games, played or watched, newest first.
// The first page also carries the caller's stats.
func (h Handler) List(w http.ResponseWriter, r *http.Request, params contracts.GetV1GamesParams) {
	kind := All
	if params.Kind != nil {
		switch k := Kind(*params.Kind); k {
		case Played, Watched:
			kind = k
		default:
			server.Problem(w, http.StatusBadRequest, "invalid-kind", "Kind is played or watched")
			return
		}
	}
	var after *After
	if params.Cursor != nil {
		var ok bool
		if after, ok = decodeCursor(*params.Cursor); !ok {
			server.Problem(w, http.StatusBadRequest, "invalid-cursor", "That page link is no good")
			return
		}
	}
	// One more than a page says whether there is a next one.
	claims := server.Claims(r.Context())
	games, err := h.Store.List(r.Context(), claims, kind, after, PageSize+1)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	out := page{Items: []contracts.GameSummary{}}
	if after == nil {
		st, err := h.Store.Stats(r.Context(), claims)
		if err != nil {
			h.fail(w, r, err)
			return
		}
		out.Stats = &stats{Games: st.Games, Played: st.Played, Wins: st.Wins, Best: st.Best}
	}
	if len(games) > PageSize {
		games = games[:PageSize]
		next := encodeCursor(games[len(games)-1])
		out.NextCursor = &next
	}
	for _, g := range games {
		watched := g.Watched
		out.Items = append(out.Items, contracts.GameSummary{
			GameId: uuid.MustParse(g.GameID), Status: contracts.GameSummaryStatus(g.Status),
			StartedAt: g.StartedAt, FinishedAt: g.FinishedAt, Score: g.Score, Placement: g.Placement,
			Players: g.Players, PlayerCount: len(g.Players), CallerDisplayName: g.CallerName, Watched: &watched,
		})
	}
	server.JSON(w, http.StatusOK, out)
}

// Detail handles GET /v1/games/{gameId}: a game's scoreboard, for anyone who played or watched it.
func (h Handler) Detail(w http.ResponseWriter, r *http.Request, gameID openapi_types.UUID) {
	d, err := h.Store.Detail(r.Context(), server.Claims(r.Context()), gameID.String())
	if err != nil {
		h.fail(w, r, err)
		return
	}
	watched := d.Watched
	body := contracts.GameDetail{
		GameId: uuid.MustParse(d.GameID), Status: contracts.GameDetailStatus(d.Status),
		StartedAt: d.StartedAt, FinishedAt: d.FinishedAt, HostDisplayName: d.HostName, Watched: &watched,
		Results: []contracts.GameResult{}, ResumableUntil: d.ResumableUntil,
	}
	for _, res := range d.Results {
		caller := res.IsCaller
		body.Results = append(body.Results, contracts.GameResult{
			DisplayName: res.Name, Score: res.Score, Placement: res.Placement, IsCaller: &caller,
		})
	}
	server.JSON(w, http.StatusOK, body)
}
