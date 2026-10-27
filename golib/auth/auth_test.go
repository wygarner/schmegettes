package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type keyServer struct {
	mu   sync.Mutex
	keys map[string]*ecdsa.PrivateKey
}

func (s *keyServer) add(t *testing.T, kid string) *ecdsa.PrivateKey {
	t.Helper()
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	s.mu.Lock()
	s.keys[kid] = k
	s.mu.Unlock()
	return k
}

func (s *keyServer) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	enc := base64.RawURLEncoding
	var out []map[string]string
	for kid, k := range s.keys {
		out = append(out, map[string]string{
			"kty": "EC", "crv": "P-256", "alg": "ES256", "use": "sig", "kid": kid,
			"x": enc.EncodeToString(k.X.FillBytes(make([]byte, 32))),
			"y": enc.EncodeToString(k.Y.FillBytes(make([]byte, 32))),
		})
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"keys": out})
}

func sign(t *testing.T, k *ecdsa.PrivateKey, kid string, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	tok.Header["kid"] = kid
	s, err := tok.SignedString(k)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func valid(sub string) jwt.MapClaims {
	return jwt.MapClaims{"sub": sub, "aud": "authenticated", "role": "authenticated", "exp": time.Now().Add(time.Hour).Unix()}
}

func setup(t *testing.T) (*keyServer, *Verifier) {
	t.Helper()
	ks := &keyServer{keys: map[string]*ecdsa.PrivateKey{}}
	ks.add(t, "k1")
	srv := httptest.NewServer(ks)
	t.Cleanup(srv.Close)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	v, err := NewVerifier(ctx, srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	return ks, v
}

func TestVerify(t *testing.T) {
	ks, v := setup(t)
	k1 := ks.keys["k1"]

	c, err := v.Verify(sign(t, k1, "k1", valid("user-1")))
	if err != nil {
		t.Fatalf("valid token: %v", err)
	}
	if c.UserID != "user-1" {
		t.Errorf("UserID = %q", c.UserID)
	}
	var raw map[string]any
	if err := json.Unmarshal(c.Raw, &raw); err != nil || raw["role"] != "authenticated" {
		t.Errorf("Raw claims = %s", c.Raw)
	}

	expired := valid("user-1")
	expired["exp"] = time.Now().Add(-time.Minute).Unix()
	wrongAud := valid("user-1")
	wrongAud["aud"] = "anon"
	noExp := valid("user-1")
	delete(noExp, "exp")
	noSub := valid("")

	other, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	for name, tok := range map[string]string{
		"expired":         sign(t, k1, "k1", expired),
		"wrong audience":  sign(t, k1, "k1", wrongAud),
		"no expiry":       sign(t, k1, "k1", noExp),
		"no subject":      sign(t, k1, "k1", noSub),
		"wrong signature": sign(t, other, "k1", valid("user-1")),
		"garbage":         "not.a.jwt",
	} {
		if _, err := v.Verify(tok); !errors.Is(err, ErrInvalidToken) {
			t.Errorf("%s: err = %v, want ErrInvalidToken", name, err)
		}
	}
}

func TestVerifyRefetchesForUnknownKey(t *testing.T) {
	ks, v := setup(t)
	k2 := ks.add(t, "k2") // rotated in after the verifier loaded the key set
	if _, err := v.Verify(sign(t, k2, "k2", valid("user-2"))); err != nil {
		t.Fatalf("token signed with a new key: %v", err)
	}
}
