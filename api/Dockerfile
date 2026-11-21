# Build from the repo root: docker build -f api/Dockerfile --build-arg GIT_SHA=$(git rev-parse HEAD) .
# The root is the context because go.mod replaces schmegettes/golib with ../golib.
FROM golang:1.25.14-bookworm AS build
WORKDIR /src
COPY golib/ golib/
COPY api/go.mod api/go.sum api/
RUN cd api && go mod download
COPY api/ api/
ARG GIT_SHA=unknown
RUN cd api && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.commit=${GIT_SHA}" -o /out/api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
USER nonroot:nonroot
EXPOSE 3001
ENTRYPOINT ["/api"]
