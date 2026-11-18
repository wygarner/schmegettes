// Package auth verifies Supabase access tokens. Every service checks every request and socket
// against the project's JWKS (asymmetric signing keys); see docs/system-docs/engineering/stack.md.
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

// ErrInvalidToken is returned for any token that fails verification. The cause is wrapped for
// logs; callers answer 401 without detail.
var ErrInvalidToken = errors.New("invalid token")

// Claims are a verified token's claims.
type Claims struct {
	// UserID is the token's subject (auth.uid() in Postgres).
	UserID string
	// IsAnonymous is true for a guest (Supabase anonymous sign-in); false when the claim is
	// missing.
	IsAnonymous bool
	// Raw is the full claim set as JSON, for request.jwt.claims.
	Raw json.RawMessage
}

// Verifier checks tokens against a JWKS. The key set is cached and refetched when a token
// names a key it hasn't seen.
type Verifier struct {
	keys   keyfunc.Keyfunc
	parser *jwt.Parser
}

// NewVerifier fetches the JWKS at url and keeps it fresh until ctx ends.
func NewVerifier(ctx context.Context, url string) (*Verifier, error) {
	keys, err := keyfunc.NewDefaultCtx(ctx, []string{url})
	if err != nil {
		return nil, fmt.Errorf("load jwks: %w", err)
	}
	return &Verifier{
		keys: keys,
		parser: jwt.NewParser(
			jwt.WithValidMethods([]string{"ES256", "RS256"}),
			jwt.WithAudience("authenticated"),
			jwt.WithExpirationRequired(),
		),
	}, nil
}

// Verify checks the signature, audience, and expiry, and returns the claims.
func (v *Verifier) Verify(token string) (Claims, error) {
	claims := jwt.MapClaims{}
	if _, err := v.parser.ParseWithClaims(token, claims, v.keys.Keyfunc); err != nil {
		return Claims{}, fmt.Errorf("%w: %w", ErrInvalidToken, err)
	}
	sub, err := claims.GetSubject()
	if err != nil || sub == "" {
		return Claims{}, fmt.Errorf("%w: no subject", ErrInvalidToken)
	}
	raw, err := json.Marshal(claims)
	if err != nil {
		return Claims{}, fmt.Errorf("%w: %w", ErrInvalidToken, err)
	}
	anon, _ := claims["is_anonymous"].(bool)
	return Claims{UserID: sub, IsAnonymous: anon, Raw: raw}, nil
}
