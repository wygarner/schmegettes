---
task-type: new-feature
task-title: "Service notices and a status page"
---
# Task spec: service-notices

Product brief: `tasks/service-notices/product-brief.md`. Product docs: `docs/product-docs/features/service-notices/feature-brief.md` and `interaction-design.md` (rules, title formats, every edge case).

## Decisions needed (before implementation starts)

1. **Status-page service.** The product docs leave the choice to engineering, within three constraints: a free tier, posting incidents and maintenance through an API, and no player data. Candidates to verify at implementation time (free-tier terms change): **Instatus**, **Better Stack** (status page and uptime) and **Atlassian Statuspage** (free plan). Recommended: whichever of the first two offers, on its free tier, (a) an incidents/maintenance API, (b) its own uptime monitors on our two `/healthz` URLs and the web home page, and (c) 30-day history. The code talks to it through one small interface, so switching later touches one file. Wyatt creates the account and the page (unlisted, at a non-Schmegettes subdomain the provider gives), then sets the API token as Fly secrets on the api (`STATUS_PAGE_API_TOKEN`, `STATUS_PAGE_ID`) and the page URL as a web variable (`VITE_STATUS_URL`) per environment. Staging gets its own page, or the same page with a "Staging" component, so staging notices never reach the production page.

## Approach

**Notices live in the database:** a `public.notices` table, written only by admin functions and read only through `private.active_notices()`, which applies every activity rule **on the server clock** (the device clock only formats times):
- an Incident is active until resolved, then shows as Resolved for 24 h;
- Maintenance is active from posting until `ends_at`, with `phase: upcoming | now`;
- What's new is active for 14 days, or until a newer What's new is posted.

Each notice has a `revision` that increments on every edit or resolve, so dismissals (per device, keyed `{id}:{revision}`) come back after an edit.

**The api** exposes `GET /v1/notices` (authenticated; every client has at least a guest token). It returns the active notices in priority order, each with `id`, `revision`, `kind`, `phase`, `title`, `body`, `link`, `startsAt`, `endsAt`, `resolvedAt` and `resolution`, plus `serverTime`. **Admin routes** handle create, edit and resolve, and list recent notices for the admin page. After each write the api syncs the notice to the status-page service:
- a create opens an incident or a scheduled maintenance there;
- an edit updates it;
- a resolve resolves it.

The provider's ID is stored on the notice (`status_page_ref`), with `status_page_sync` (`ok` | `failed`) and the error. A failed sync never fails the request; the admin page shows "Posted in the app; the status page didn't update." with **Retry** (`POST /v1/admin/notices/{id}/sync`). What's new isn't sent to the status page. Every write is recorded in `private.notice_history` (who, when, which action, the before and after revision); that table is this feature's audit trail. If `private.audit` exists (security task), each write also calls it.

**The web:**
- **Home** fetches notices on mount, every 5 minutes while visible, and on every return to Home. It shows the banner per the interaction design: highest priority first, "+N more" opening a sheet, ✕ per device in `localStorage` (guarded), and the title formats in the table.
- **Host lobby:** Incident and Maintenance only (Maintenance starting within 2 h, or now), in the Home Screen tip's slot, with no ✕. The "A full game takes about 45 minutes." line shows only within 60 minutes. Fetched on lobby mount; nothing after Start, so nothing is ever shown during a game.
- **Can't reach Schmegettes:** a small client-side health tracker. Home's notice fetch counts as the probe. Two consecutive failures (a network error, a timeout after 8 s, or a 5xx) show the built-in banner with **Status ›** (`VITE_STATUS_URL`, new tab). It retries every 30 s and hides on the first success. `navigator.onLine === false` shows "You're offline." instead, with no link. It never shows an old notice from memory.

**The devtools admin page** gets a **Notices** section using the existing admin client: list, New notice (form with counters, the Maintenance times, the less-than-24-hours confirmation, and a Preview using the same banner component as Home, imported from `web` the way devtools already imports UI), Edit, Resolve (closing line required), and Retry on a failed sync.

## Subtasks (narrow → wide)

1. **shared** (additive):
   - `shared/openapi.yaml`:
     - `GET /v1/notices` → `{notices: Notice[], serverTime}`;
     - `GET /v1/admin/notices?days=30` → `AdminNotice[]` (adds `statusPageSync`, `statusPageError`, `createdBy`, `history` count);
     - `POST /v1/admin/notices` (kind, title ≤60, body ≤280, link (https URL, optional), startsAt/endsAt for maintenance);
     - `PATCH /v1/admin/notices/{id}` (any of those);
     - `POST /v1/admin/notices/{id}/resolve` (`resolution` ≤280, incidents only);
     - `POST /v1/admin/notices/{id}/sync`;
     - schemas `Notice`, `AdminNotice`, `NoticeKind` (`incident` | `maintenance` | `whats_new`), `NoticePhase` (`active` | `resolved` | `upcoming` | `now`);
     - problem types `invalid-notice` and `not-an-incident`.
   - Run `mise run gen`.
2. **supabase**: `supabase migration new service_notices`
   - `public.notices`: `id uuid`, `kind`, `title` (check 1–60), `body` (check 0–280), `link` (check `^https://`), `starts_at`, `ends_at` (both required for maintenance, with `ends_at > starts_at`), `resolved_at`, `resolution`, `revision int default 1`, `created_by uuid`, `created_at`, `updated_at`, `status_page_ref text`, `status_page_sync text`, `status_page_error text`.
     - RLS on. **No direct select** for app roles: reads go through `private.active_notices()`, which returns only display fields, so `created_by` and the sync fields are never exposed to players.
   - `private.notice_history`: `notice_id`, `at`, `actor`, `action` (`post` | `edit` | `resolve` | `sync`), `revision`. RLS on, no policies.
   - Functions:
     - `private.active_notices()`: security definer, `stable`, executable by `authenticated`; applies the rules and the priority order.
     - `private.admin_post_notice(...)`, `private.admin_edit_notice(...)` (bumps `revision`), `private.admin_resolve_notice(id, resolution)` (incidents only; bumps `revision`), `private.admin_set_notice_sync(id, ref, status, error)`, `private.admin_notices(days)`. Each calls `require_admin()` and writes `notice_history`.
   - pgTAP `supabase/tests/service_notices.test.sql`:
     - a non-admin can't post, edit or resolve;
     - a player can't select `public.notices` directly;
     - `active_notices()` at fixed times (wrap `now()` through a parameter or a test-only setting): an incident active, then shown as resolved for 24 h, then gone; maintenance upcoming, then now, then gone after `ends_at`; What's new gone after 14 days, or replaced by a newer one;
     - an edit bumps the revision;
     - every write leaves a history row with the actor;
     - field checks (61-character title, http link, maintenance without times).
   - Compatible with running code: new objects only.
3. **api**:
   - `api/internal/notices/` (new): handlers, store, and `statuspage.Client`, an interface with `Open(ctx, notice) (ref, error)`, `Update` and `Resolve`, plus one provider implementation (decision 1) and a no-op when `STATUS_PAGE_API_TOKEN` is unset.
   - Sync runs after the database commit, with a 5 s timeout. On failure: `admin_set_notice_sync(id, '', 'failed', err)` and log `WARN` "status page sync failed" (`notice_id`, `provider_status`). Never the notice text.
   - Admin routes behind the admin limiter; `GET /v1/notices` behind the normal per-user limit.
   - Tests: handler shapes against OpenAPI; a provider failure still returns 201, with `statusPageSync: "failed"`; Retry calls the provider again; the provider client against an `httptest` server (request shape, auth header, and no player data in the body: assert the JSON fields).
4. **web**:
   - `web/src/lib/notices.ts`: fetch, the dismiss store (`localStorage`, guarded), title formatting (`Intl.DateTimeFormat` in the device time zone, matching the interaction design's table), and the health tracker (two failures → unreachable; 30 s retry; offline detection).
   - `web/src/ui/NoticeBanner.tsx` (with the "+N more" sheet) and `web/src/ui/UnreachableBanner.tsx`; `web/src/pages/Home.tsx` uses both. The notice banner sits above the signed-out banner.
   - `web/src/pages/HostLobby.tsx`: the lobby strip in place of `HomeScreenTip` while shown. It must not push the code off at 667 × 320. Fetch once on mount, and never during a game: the component isn't rendered after Start.
   - `web/scripts/vercel-deploy.mjs`: nothing in `connect-src` (the status page is a link, not a fetch).
   - Tests:
     - title formats for each kind and phase;
     - the priority order and "+1 more";
     - ✕ per revision (an edit shows it again);
     - the lobby filter (90 min shown, 3 h not; the 45-minute line only within 60 min);
     - unreachable after two failures, cleared on success, with offline overriding;
     - no notice fetch or strip after Start.
5. **devtools**:
   - `devtools/src/admin/` gets a **Notices** section with the list, form, preview, edit, resolve and retry, through `client.ts`.
   - Tests: counters, the less-than-24-hours confirmation, a resolve requires a closing line, and the failed-sync state shows Retry.
6. **docs**:
   - `release-strategy.md` "Communication": remove the three "not yet implemented", and describe posting a What's new after sign-off (step 7);
   - `incident-response.md` (if observability landed): link the admin Notices steps;
   - `service-notices/feature-brief.md`: "Not built yet." → built (where it lives);
   - `configuration-and-secrets.md`: `STATUS_PAGE_API_TOKEN`, `STATUS_PAGE_ID` and `VITE_STATUS_URL`;
   - `data-retention.md` (if landed): the status-page service row (it gets notice text only).

## Key files

`shared/openapi.yaml` (+ generated), `supabase/migrations/<new>_service_notices.sql`, `supabase/tests/service_notices.test.sql`, `api/internal/notices/**` (new), `api/cmd/api/{main,routes}.go`, `web/src/lib/notices.ts`, `web/src/ui/{NoticeBanner,UnreachableBanner}.tsx`, `web/src/pages/{Home,HostLobby}.tsx` (+ tests), `devtools/src/admin/**`, and the docs above.

## Contracts preserved

Additive only: one player route, five admin routes, new schemas and problem types. No WebSocket change: nothing reaches a game.

## Success criteria

The product brief's criteria:
- each kind posted on staging shows on Home within 5 minutes with the right title and dot, and on the status page within a minute;
- the lobby shows maintenance at 90 minutes but not 3 hours, and nothing on phones or in a game;
- ✕ is per device and an edit brings it back;
- with the staging api stopped, Home shows "Can't reach Schmegettes" after two failed checks, and **Status** opens a page showing the outage;
- at 667 × 320 the strip never pushes the code off;
- every write is recorded with who and when, and only admins can post;
- the status-page service receives only notice text (checked in the client test).

## Test plan

- `mise run db:test` (`service_notices.test.sql`)
- `mise run test:api -- ./internal/notices/...`
- `mise run test:web -- src/lib/notices.test.ts src/ui/NoticeBanner.test.tsx src/ui/UnreachableBanner.test.tsx src/pages/Home.test.tsx src/pages/HostLobby.test.tsx`
- `bun run --cwd devtools test -- src/admin/`
- Manual (staging): the success criteria. Stop the api with `fly machine stop` on staging, then start it again.

## Database migration plan

- File: `supabase migration new service_notices`.
- Tables: `public.notices` (RLS on; no direct select or write for app roles) and `private.notice_history` (RLS on, no policies).
- Functions: `private.active_notices` (`authenticated`) and the admin functions (`authenticated`, admin-checked inside).
- pgTAP as above.
- Compatible with running code: new objects only.

## Logging requirements

- api: `INFO` "notice posted" / "notice edited" / "notice resolved" (`notice_id`, `kind`, `revision`; never the title or body); `WARN` "status page sync failed" (`notice_id`, `provider_status`).
- web: nothing new beyond Faro's errors (if observability landed).
- No player data goes to the status-page service.

## Docs to update

As in subtask 6.
