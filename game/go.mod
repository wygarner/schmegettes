module schmegettes/game

go 1.25.0

require (
	github.com/coder/websocket v1.8.15
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.13.0
	golang.org/x/text v0.41.0
	schmegettes/golib v0.0.0
)

require (
	github.com/MicahParks/jwkset v0.11.3 // indirect
	github.com/MicahParks/keyfunc/v3 v3.8.2 // indirect
	github.com/golang-jwt/jwt/v5 v5.3.1 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.3 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/time v0.15.0 // indirect
)

replace schmegettes/golib => ../golib
