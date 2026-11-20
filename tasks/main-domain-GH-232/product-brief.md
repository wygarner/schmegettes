---
task-type: improvement
task-title: "Make schmegettes.app the main address"
---
**Task Type:** Improvement. No new capability: players get the same game at a short address of our own. The work is configuration and docs, plus a single line of text on the TV.

**Product docs:** none change. The designs already show the new address: `devtools/src/designs/lobby/host-and-join.tsx` (`SITE = "schmegettes.app"`) and `devtools/src/designs/results/scoreboard-and-history.tsx` ("New players join at schmegettes.app/join").

**Problem:** Players reach the game at `schmegettes-web-prod.vercel.app`, which is long to type from the TV and isn't ours. `schmegettes.app` is now registered and its DNS is on Vercel (2026-11-19). Today:
- `https://www.schmegettes.app` serves production (it reports the 0.2.0 commit).
- `https://schmegettes.app` redirects (308) to `www`. That is the wrong direction for us, because the shorter name is the one people type.
- `staging.`, `api.` and `game.` resolve (wildcard DNS) but have no certificate.
- The api and game servers accept browsers only from the origins in `ALLOWED_ORIGINS`, which still lists the `vercel.app` origin. So a game started on `www.schmegettes.app` probably fails at the first API call or socket connection. Check this first.
- The lobby builds its "Join at …" text from `window.location.origin`, so the TV would show `https://www.schmegettes.app/join`.

**Outcomes:** Every player-facing link and every line on the TV uses `schmegettes.app`. Old links still work. A full game plays end to end on the new address.

**Player flow:**
- **Canonical address: `https://schmegettes.app`** (no `www`; decided by Wyatt, 2026-11-19). `www.schmegettes.app` and `schmegettes-web-prod.vercel.app` redirect to it permanently, keeping the path and query: `…/join` lands on `schmegettes.app/join`.
- **TV lobby** reads "Join at **schmegettes.app/join**", with no `https://`, matching the design. It is still built from the page's own host, so staging and local show their own address.
- **Guests, home-screen installs and games in progress:** not a concern for this switch (Wyatt, 2026-11-19). Nothing is migrated between the old and new origin.
- **Still private:** the `noindex` headers and meta tag and the `robots.txt` disallow stay as they are.

**Staging:** `staging.schmegettes.app` on the staging Vercel project, with its `vercel.app` address redirecting to it. Same steps, done first, as the rehearsal.

**What changes (engineering's call on the how):**
- The Vercel projects: domains attached, apex primary, `www` and `vercel.app` set to redirect.
- `ALLOWED_ORIGINS` on `schmegettes-{api,game}-{staging,prod}` (Fly secrets, set by hand): add the new origin. Keep the old one until the redirect is live, then remove it.
- GitHub Environment variables `{STAGING,PROD}_VERSION_URLS`: the web entry becomes `https://{staging.,}schmegettes.app/version.json`, so every deploy checks the address players actually use.
- Supabase Auth URL configuration (Site URL, redirect URLs) in both projects: set to the new origin. Nothing sends email today, but this keeps it correct if that changes.
- The lobby's "Join at" text: drop the scheme.
- Docs: `docs/system-docs/operations/deployment.md` ("Custom domains are not set up yet", plus a short "Domains" section with the DNS/Vercel setup and the redirect rule), the examples in `docs/system-docs/security/configuration-and-secrets.md`, and the comment in `.github/workflows/deploy.yml`.

**Success Criteria:**
- On production, an iPhone host at `https://schmegettes.app` creates a room. The TV reads "Join at schmegettes.app/join". Two phones join by typing that address and play a full game, through Final, with no errors.
- `https://www.schmegettes.app/join` and `https://schmegettes-web-prod.vercel.app/join?x=1` each end at `https://schmegettes.app/join` (with `?x=1`) after one 308.
- The same on staging with `staging.schmegettes.app`.
- The deploy's verify job passes using the new `version.json` URLs.
- Responses from `schmegettes.app` still carry `X-Robots-Tag: noindex, nofollow` and the CSP.
- The admin page in devtools still works against production.

**Out of scope:** custom domains for the api and game (`api.`/`game.schmegettes.app`; players never see them, so they stay on `fly.dev`), moving guest sessions between origins, email from the domain, and making the site indexable.
