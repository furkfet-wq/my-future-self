# Google login + Cloudflare database for My Future Self

Date: 2026-11-27. Status: approved by the owner with the changes below (button next to the
Settings gear, sign-in required).

## Why

The owner is publishing the app for other people. Today every entry lives only in one browser's
localStorage, so a person loses everything if they clear the browser or switch device. People should
sign in with Google and have their data saved online.

## Goals

- A Google sign-in button in the app. Signed-in people get their data saved in a Cloudflare D1 database
  and see the same data on every device.
- Sign-in is REQUIRED (owner's decision): without signing in the app shows only a sign-in screen.
- Only the same Google account sees the same data; every account has its own separate data.
- The first sign-in uploads what is already in the browser, so nobody loses their current data.
- Signed-in people can sign out and can delete their account and all their saved data.
- The whole app moves from GitHub Pages to Cloudflare (owner's choice: option 1).

## Non-goals

- The Flame SMP store, its Worker (`flame-delivery`) and its D1 database are NOT touched (owner's rule).
- No other login providers (only Google).
- Prayer times stay Coventry only.
- No custom domain for now (can be added later).
- No change to the look of the rest of the app.

## Anti-goals (would be a failure even if it works)

- One person can read or change another person's data.
- Anyone loses data they already have (old address, first sign-in, two devices).
- A login token readable by page scripts.

## Approaches considered

1. **Move the app onto one Cloudflare Worker (CHOSEN).** The Worker serves the built site, the login,
   the data API and the prayer times from one address. Same-site HttpOnly cookie, so logins work on
   iPhone Safari and page scripts can never read the session. Cost: new address; data on the old
   address must be moved.
2. Keep GitHub Pages + separate API Worker. Address stays, but the session token must live in
   localStorage (stealable by an injected script) and Safari's cross-site rules make logins unreliable.
3. Firebase / Supabase auth. Dropped: the owner asked for Cloudflare.

## Decided by the owner

- Option 1, only this app moves. Flame SMP is not moved or changed.
- Hundreds of users fit the free plan; the shared 100,000 requests/day limit was explained and accepted
  (store plugin uses ~2,900/day).
- A sign-in button that opens Google's sign-in, placed next to the Settings gear (not next to Sound).
- Sign-in is required to use the app. Each Google account sees only its own data.

## Design

### Hosting

- New Worker `my-future-self` at `https://my-future-self.flamesmp.workers.dev` (account
  0e05bd2fedc0d3d725542c9aac21e74b, wrangler already logged in). Static assets = Vite `dist/`
  (base `/`). Requests to static files are free; only `/api/*` and `/prayer-times.json` run the Worker
  (`run_worker_first` for those paths).
- New D1 database `my-future-self` (separate from `flame-delivery`).
- Worker code lives in the same repo under `worker/`, config in `wrangler.jsonc`.
- Deploy: `npm run build && npx wrangler deploy`, run from the PC by Claude.

### Sign-in

- Not signed in: the app shows a full-screen sign-in screen in the app's
  black/white style ("My Future Self", one line of text, Google's sign-in button, link to the privacy
  page). Nothing else loads until sign-in succeeds. Then the PIN lock (if on, builder's call: PIN
  after sign-in), the normal loader and page run.
- Google Identity Services (GIS) button. Google's branding rules require the Google "G" logo for
  sign-in buttons (the Gmail logo is not allowed; the owner was told).
- Signed in: a round account button with the person's Google picture sits right next to the Settings
  gear. Clicking it opens a small menu: their email, "Sign out", "Delete my account" (asks twice).
- GIS gives the page a Google ID token. The page POSTs it to `/api/login`. The Worker verifies it
  itself: RS256 signature against Google's JWKS (cached), `aud` = our Client ID, `iss` =
  accounts.google.com, not expired, `email_verified`.
- The Worker creates a session: 32 random bytes, only the SHA-256 hash stored in D1, sent as cookie
  `mfs_session` (HttpOnly, Secure, SameSite=Lax, Path=/, 30 days, renewed on use).
- Every POST/PUT/DELETE must carry `Origin` equal to the site's own origin (CSRF guard).
- Needs from the owner: a Google Cloud OAuth Client ID (Web), authorised JavaScript origin
  `https://my-future-self.flamesmp.workers.dev` (+ `http://localhost:5173` for testing). The Client ID
  is public, no client secret is needed.

### Database (D1)

```
users(id TEXT PK  -- Google "sub", email, name, picture, created_at)
sessions(token_hash TEXT PK, user_id, expires_at)
docs(user_id TEXT PK, data TEXT  -- JSON, version INTEGER, updated_at)
```

### What is saved online

- The habit data (`habit-tracker-v1`: habits, checks, logs, salah, startBalance) and the settings
  (`mfs-settings-v1`), as one JSON document per person.
- Not synced, stays per device: PIN lock, Sound on/off, prayer-times cache.

### Sync rules

- `GET /api/me` on load: signed in or not. `GET /api/data` returns `{data, version}`.
- The browser copy in localStorage is tagged with the Google account it belongs to
  (`mfs-owner-v1` = user id). Another account's copy is never shown or uploaded.
- Old data from before sign-in existed (no owner tag) is offered to the FIRST account that signs in on
  that browser: if that account is empty it is uploaded; if the account already has data, ask once,
  "Keep your online data" or "Replace it with this device's data" (no automatic merge).
- Every change saves to localStorage at once and to the server 2 s after the last
  change: `PUT /api/data {data, version}`. If someone saved from another device in between (version
  mismatch, 409), the app loads the newer online copy and says so.
- Pull the online copy again when the tab comes back into focus.
- Server checks: body at most 1 MB, must be JSON with the expected top-level fields.
- Signing out clears the synced data from that browser.

### Prayer times

- `/prayer-times.json` is answered by the Worker: it fetches the namazvakitleri Coventry page, parses
  it like `scripts/fetch-prayer-times.mjs`, caches 6 hours. If namazvakitleri fails, the Worker serves
  the copy bundled at deploy. `prayer.js` already reads this file on the live site, so it barely changes.

### Old address (GitHub Pages)

- `furkfet-wq.github.io/my-future-self` becomes a one-page "My Future Self has moved" with a "Move my
  data" button: it packs that browser's saved data into the link's `#` part (never sent to any server)
  and opens the new address, which asks "Import this data?" and saves it. Without saved data it just
  redirects.
- The GitHub workflow then only publishes that page; the daily prayer job is removed.

### Privacy and security

- New `privacy.html` page (what is stored, where, how to delete) linked from the sign-in menu; Google's
  OAuth consent screen needs a privacy link. README Privacy and PIN sections rewritten.
- Content-Security-Policy header from the Worker, allowing only the hosts the app uses (Google sign-in,
  Google Fonts, api.alquran.cloud, api.quotable.kurokeita.dev).

## Left to the builder

- File layout inside `worker/`, JWKS caching details, exact UI copy and animations (must match the
  app's black/white style and slow rise-on-hover).
- Tests: Worker tests against `wrangler dev --local` with a fake Google key; a browser check of the
  sign-in flow on the live address.
