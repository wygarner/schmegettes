package stats

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestMapError(t *testing.T) {
	for _, tc := range []struct {
		code, message string
		want          error
	}{
		{"42501", "not signed in", ErrNotSignedIn},
		{"P0001", "no counted games", ErrNoCountedGame},
	} {
		got := mapError(&pgconn.PgError{Code: tc.code, Message: tc.message})
		if !errors.Is(got, tc.want) {
			t.Errorf("%s: %v", tc.message, got)
		}
	}
}
