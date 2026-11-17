# Build from the repo root: docker build -f game/Dockerfile --build-arg GIT_SHA=$(git rev-parse HEAD) .
# The root is the context because go.mod replaces schmegettes/golib with ../golib.
FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY golib/ golib/
COPY game/go.mod game/go.sum game/
RUN cd game && go mod download
COPY game/ game/
ARG GIT_SHA=unknown
RUN cd game && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.commit=${GIT_SHA}" -o /out/game ./cmd/game

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/game /game
USER nonroot:nonroot
EXPOSE 3002
ENTRYPOINT ["/game"]
