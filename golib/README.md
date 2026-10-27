# golib/: Go code shared by api/ and game/

| Package | What |
|---|---|
| `auth` | Verifies Supabase access tokens against the project's JWKS |
| `db` | `pgxpool` plus `AsUser` (RLS as the caller) and `AsEngine` (the `game_engine` role) |
| `logging` | The `log/slog` JSON logger every Go service starts with |

Imported with a `replace schmegettes/golib => ../golib` directive. Tests: `cd golib && go test -race ./...`
(the `db` tests need local Supabase running; they skip without it).
