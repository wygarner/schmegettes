---
jira-type: improvement
jira-title: "Make schmegettes.app the main address"
---
# Task spec: main-domain

Product brief: `tasks/main-domain/product-brief.md`. Decisions (Wyatt, 2026-11-19): the apex `https://schmegettes.app` is canonical; guest data, home-screen installs and games in progress need no handling.

## Approach

Almost all of this is configuration outside the repo. The api (`api/internal/server` CORS) and game (`game/internal/socket`, `OriginPatterns`) already accept exactly the origins listed in `ALLOWED_ORIGINS`, and the web CSP uses `'self'` for its own origin. So a new web origin needs no code change. The only code change is the TV's "Join at" text. Everything else is provider settings (Vercel, Fly, GitHub Environments, Supabase), done by Wyatt in the order below, plus docs.

The api and game keep their `fly.dev` hostnames: `VITE_API_URL`, `GAME_SOCKET_ORIGIN` and `GAME_SOCKET_BASE_URL` don't change.

Current state (checked 2026-11-19): DNS for `schmegettes.app` is on Vercel (`ns1/ns2.vercel-dns.com`, wildcard records). `www.schmegettes.app` serves production. The apex 308s to `www`. `staging.`, `api.` and `game.` resolve but have no certificate.

## Subtasks (narrow → wide)

1. **web**: the "Join at" text shows the host without the scheme.
   - `web/src/pages/HostLobby.tsx` (`ConnectedHostLobby`): ``joinUrl={`${window.location.host}/join`}`` (was `origin`). Production shows "Join at schmegettes.app/join", staging "staging.schmegettes.app/join", local "localhost:5173/join".
   - Rename the prop to `joinAddress` if that reads better. The view component (`HostLobbyView`) otherwise stays as is.
   - `web/src/pages/HostLobby.test.tsx`: fixtures use `example.test/join` and assert "Join at example.test/join".
2. **docs**
   - `docs/system-docs/operations/deployment.md`:
     - Replace "Custom domains are not set up yet…" with the addresses: production `https://schmegettes.app`, staging `https://staging.schmegettes.app`; api and game on their `fly.dev` hostnames.
     - Add a **Domains** section: DNS on Vercel (`ns1/ns2.vercel-dns.com`); in each Vercel project the custom domain is primary, and every other domain on the project redirects to it with a 308 (production: `www.schmegettes.app` and `schmegettes-web-prod.vercel.app`; staging: `schmegettes-web-staging.vercel.app`). A new web origin also needs `ALLOWED_ORIGINS` on that environment's api and game, the web entry of `{STAGING,PROD}_VERSION_URLS`, and the Supabase Auth URL configuration.
     - "Setting up an environment" step 3 (Vercel): add the domain step.
   - `docs/system-docs/security/configuration-and-secrets.md`: the `ALLOWED_ORIGINS` example becomes `https://schmegettes.app` (staging `https://staging.schmegettes.app`). Mention that the api's value also keeps `http://localhost:5174`.
   - `docs/system-docs/operations/deployment.md` "Supabase Auth settings": Site URL and redirect URLs = the environment's web origin.
   - `.github/workflows/deploy.yml`: the comment's example `version.json` URL becomes `https://schmegettes.app/version.json`. Comment only, with no workflow logic change.
   - `docs/product-docs/architecture/product-overview.md`: one line naming the address players use (`schmegettes.app`).
3. **Operator steps (Wyatt, by hand; not in the PR).** Staging first, then production. Each line is one setting:
   1. **Fly secrets**: add the new origin, keeping the old one for now:
      - `fly secrets set ALLOWED_ORIGINS=https://staging.schmegettes.app,https://schmegettes-web-staging.vercel.app,http://localhost:5174 -a schmegettes-api-staging`
      - `schmegettes-game-staging`: the same two web origins (no `localhost:5174`)
      - production: the same with `https://schmegettes.app`, `https://schmegettes-web-prod.vercel.app` and `-prod`. `fly secrets set` replaces the whole value, so list every origin.
   2. **Vercel**, project `schmegettes-web-staging`: add `staging.schmegettes.app` as a domain, then set `schmegettes-web-staging.vercel.app` to redirect (308) to it. Project `schmegettes-web-prod`: make `schmegettes.app` the primary domain; set `www.schmegettes.app` → `schmegettes.app` (308); set `schmegettes-web-prod.vercel.app` → `schmegettes.app` (308).
      - If Vercel won't redirect the `.vercel.app` domain, tell engineering. The fallback is a host-conditioned `redirects` entry in the `vercel.json` that `web/scripts/vercel-deploy.mjs` writes, which is a separate small task.
   3. **GitHub Environment variables**: in `STAGING_VERSION_URLS`, the web entry becomes `https://staging.schmegettes.app/version.json`. In `PROD_VERSION_URLS` it becomes `https://schmegettes.app/version.json`.
   4. **Supabase** (both projects), Authentication → URL Configuration: Site URL = the new origin; redirect URLs = the new origin.
   5. **Check** (the success criteria below), then remove the `vercel.app` origin from `ALLOWED_ORIGINS` on all four apps.

The web change reaches production with the next release. The operator steps don't depend on it: the new address works with the old "Join at https://…" text until then.

## Key files

`web/src/pages/HostLobby.tsx`, `web/src/pages/HostLobby.test.tsx`, `docs/system-docs/operations/deployment.md`, `docs/system-docs/security/configuration-and-secrets.md`, `.github/workflows/deploy.yml` (comment only), `docs/product-docs/architecture/product-overview.md`.

## Contracts preserved

No change to `shared/` (REST, WebSocket, schemas), the database, or any env var's name or meaning. Only the values of `ALLOWED_ORIGINS` and the `*_VERSION_URLS` variables change.

## Success criteria

- The TV lobby reads "Join at {host}/join" with no scheme: "schmegettes.app/join" in production.
- On staging, then production: an iPhone host at the canonical address creates a room. Two phones join by typing `{host}/join` and play a full game through Final. There are no CORS or socket-origin errors in the browser console or in the api/game logs.
- `curl -sI https://www.schmegettes.app/join` and `curl -sI 'https://schmegettes-web-prod.vercel.app/join?x=1'` each return a 308 to `https://schmegettes.app/join` (with `?x=1`). The staging `vercel.app` address 308s to `https://staging.schmegettes.app/…` the same way.
- `curl -sI https://schmegettes.app` returns 200 with `X-Robots-Tag: noindex, nofollow`, the CSP and HSTS headers. `robots.txt` still disallows everything.
- The next staging deploy's "Verify deployed commit" passes using the new `version.json` URL.
- The devtools Admin page still shows a host code against staging and production (`localhost:5174` stays in the api's `ALLOWED_ORIGINS`).

## Test plan

- `mise run test:web -- src/pages/HostLobby.test.tsx`
- No api, game, database or worker tests: their code doesn't change.
- Manual: the operator checks above, on staging before production.

## Database migration plan

None.

## Logging requirements

No change. A rejected origin is already logged by the api/game. Don't add the allowed-origins list to logs beyond what is logged today.

## Docs to update

Listed in subtask 2.

## Branch
`technical-improvement/main-domain-impl`, from and into `develop`. No Jira key: Jira is not configured yet (`.github/jira.json` issue types are `REPLACE_ME`), so `create-ticket` fails on this PR as expected.
