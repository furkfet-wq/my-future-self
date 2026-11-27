# Google Sign-in + Cloudflare Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move My Future Self onto one Cloudflare Worker with a D1 database, require Google sign-in, and save each account's data online.

**Architecture:** One Worker (`my-future-self`) serves the Vite `dist/` as static assets and runs code only for `/api/*` and `/prayer-times.json`. Google Identity Services gives the page an ID token; the Worker verifies it and sets an HttpOnly session cookie. Each account's data is one JSON document in D1, cached in localStorage and saved 2 s after changes. A `Gate` component in front of `App` handles sign-in and choosing which copy of the data to start from.

**Tech Stack:** Vite 8 + React 18 (existing), Cloudflare Workers + static assets + D1, Wrangler (logged in), Google Identity Services, `node --test` (Node 26) for unit tests.

**Spec:** `docs/superpowers/specs/2026-11-27-cloudflare-login-design.md`

## Global Constraints

- NEVER touch the Flame SMP store, the `flame-delivery` Worker or its D1 database.
- Worker name and D1 name: `my-future-self`. Address: `https://my-future-self.flamesmp.workers.dev`. Cloudflare account `0e05bd2fedc0d3d725542c9aac21e74b`.
- Session cookie: `mfs_session`, HttpOnly, Secure, SameSite=Lax, Path=/, 30 days, only its SHA-256 hash stored.
- State-changing requests (POST/PUT/DELETE) must have `Origin` equal to the request's own origin, else 403.
- Data document at most 1,000,000 bytes.
- Synced: `habit-tracker-v1` (habits, checks, logs, salah, startBalance) and `mfs-settings-v1`. NOT synced: PIN lock keys, Sound, prayer cache.
- localStorage keys added: `mfs-owner-v1` (Google `sub` the local copy belongs to), `mfs-dirty-v1` ("1" while a change is not yet saved online).
- Google Client ID: build env `VITE_GOOGLE_CLIENT_ID` (in `.env`, public, committed) and Worker var `GOOGLE_CLIENT_ID`. No client secret.
- Sign-in button: Google's own GIS button (G logo, not Gmail). Account button sits next to the Settings gear (gear is `.gear`, `position:absolute; top:14px; right:16px`).
- UI strictly black and white, slow rise on hover, matches existing `.st` dialog styles.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; git author is the GitHub noreply address already configured in the repo.

## Review Focus

1. A second Google account signs in on a browser that holds the first account's data: it must never see or upload that data (Task 6 test `other owner's local copy is dropped`).
2. Two devices edit at once: the second save gets 409 and must load the newer copy, not overwrite it (Task 4 e2e `stale version gets 409`, Task 7 conflict handling).
3. The app is closed within 2 s of a change: the change must not be lost; `mfs-dirty-v1` makes it upload on next start (Task 6 test `dirty own copy is uploaded`).
4. A forged, expired or wrong-audience Google token must be refused (Task 2 tests).
5. A cross-site page POSTs to `/api/data` with the victim's cookie: refused by the Origin check (Task 3 e2e `foreign origin is refused`).

---

### Task 1: Worker skeleton, D1 schema, local dev wiring

**Files:**
- Create: `wrangler.jsonc`, `worker/index.js`, `worker/http.js`, `worker/schema.sql`, `test/e2e.mjs`, `.env`
- Modify: `vite.config.js` (dev proxy), `package.json` (scripts), `.gitignore` (`.wrangler/`, `.dev.vars`)

**Interfaces:**
- Produces: `json(data, status = 200, headers = {}) -> Response`, `withSecurityHeaders(res) -> Response` in `worker/http.js`; default export `{ fetch(request, env, ctx) }` in `worker/index.js` routing by `URL.pathname`; unknown `/api/*` -> 404 JSON `{error:"not found"}`.
- Produces: `test/e2e.mjs` helper `start()` that builds nothing, applies `worker/schema.sql` with `wrangler d1 execute my-future-self --local --file worker/schema.sql`, runs `wrangler dev --local --port 8787 --var GOOGLE_CLIENT_ID:test-client --var JWKS_URL:http://127.0.0.1:8790/certs`, waits for it, and a fake JWKS server on 8790 that later tasks fill.

- [ ] **Step 1:** Write `wrangler.jsonc`: `name: "my-future-self"`, `main: "worker/index.js"`, `compatibility_date: "2026-11-01"`, `workers_dev: true`, `observability.enabled: true`, `assets: { directory: "./dist", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: ["/api/*", "/prayer-times.json"] }`, `d1_databases: [{ binding: "DB", database_name: "my-future-self", database_id: "<filled in Task 10>" }]` (use a placeholder id locally; `--local` ignores it), `vars: { GOOGLE_CLIENT_ID: "" }`.
- [ ] **Step 2:** Write `worker/schema.sql` (`CREATE TABLE IF NOT EXISTS`): `users(id TEXT PRIMARY KEY, email TEXT, name TEXT, picture TEXT, created_at INTEGER)`, `sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)` + index on `user_id`, `docs(user_id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER)`.
- [ ] **Step 3:** Write e2e test `unknown api path is 404 json`: `GET /api/nope` -> 404, body `{error:"not found"}`, header `X-Content-Type-Options: nosniff`.
- [ ] **Step 4:** Run `npm run build && npm run test:e2e`; expect FAIL (no Worker yet).
- [ ] **Step 5:** Implement `worker/index.js` + `worker/http.js`. `withSecurityHeaders` sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cache-Control: no-store` on API responses.
- [ ] **Step 6:** `package.json` scripts: `"test": "node --test \"shared/*.test.mjs\" \"worker/*.test.mjs\" \"src/lib/*.test.mjs\""`, `"test:e2e": "node test/e2e.mjs"`, `"deploy": "vite build && wrangler deploy"`; devDependency `wrangler`. `vite.config.js`: dev proxy `/api` -> `http://127.0.0.1:8787`; remove the `GITHUB_PAGES` base (base is `/`). `.env`: `VITE_GOOGLE_CLIENT_ID=` (filled in Task 10).
- [ ] **Step 7:** Run `npm run test:e2e`; expect PASS. Commit "Add Cloudflare Worker skeleton and D1 schema".

### Task 2: Google ID token check

**Files:**
- Create: `worker/google.js`, `worker/google.test.mjs`

**Interfaces:**
- Produces: `verifyGoogleIdToken(token: string, clientId: string, opts: { getKeys: () => Promise<JWK[]>, now?: number }) -> Promise<{ sub, email, name, picture }>`; throws `Error("bad token")` on any failure. `googleKeys(env) -> () => Promise<JWK[]>` fetching `env.JWKS_URL || "https://www.googleapis.com/oauth2/v3/certs"`, cached in module memory until the response's `max-age` passes.

- [ ] **Step 1:** Write `worker/google.test.mjs` with a test RSA key made by `crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5", modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:"SHA-256"})` and a `sign(claims, kid)` helper. Tests:
  - `valid token returns the user`: claims `{iss:"https://accounts.google.com", aud:"cid", sub:"123", email:"a@b.c", email_verified:true, name:"A", picture:"p", exp:now+600, iat:now}` -> `{sub:"123", email:"a@b.c", name:"A", picture:"p"}`.
  - `iss "accounts.google.com" also accepted`.
  - rejects (each `assert.rejects(..., /bad token/)`): wrong `aud`, wrong `iss`, `exp` in the past, `email_verified:false`, unknown `kid`, payload changed after signing, `alg:"none"` header, not three dot-separated parts.
- [ ] **Step 2:** Run `npm test`; expect FAIL.
- [ ] **Step 3:** Implement with Web Crypto only (base64url decode, `importKey("jwk", …, {name:"RSASSA-PKCS1-v1_5", hash:"SHA-256"})`, `verify`). Header `alg` must be `RS256`. Allow 60 s clock skew on `exp`.
- [ ] **Step 4:** Run `npm test`; expect PASS. Commit "Verify Google sign-in tokens in the Worker".

### Task 3: Sessions and sign-in API

**Files:**
- Create: `worker/session.js`
- Modify: `worker/index.js`, `test/e2e.mjs`

**Interfaces:**
- Consumes: `verifyGoogleIdToken`, `googleKeys` (Task 2).
- Produces: `POST /api/login {credential}` -> 200 `{user:{id,email,name,picture}}` + `Set-Cookie`; `GET /api/me` -> `{user}` or `{user:null}`; `POST /api/logout` -> 200, cookie cleared, session row deleted. `getUser(request, env) -> Promise<user|null>` and `requireSameOrigin(request) -> Response|null` in `worker/session.js`.

- [ ] **Step 1:** In `test/e2e.mjs`, fake JWKS server signs tokens with a test key (`aud:"test-client"`). Tests:
  - `login sets an HttpOnly session cookie`: cookie has `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=2592000`; then `/api/me` with it -> same `user.id`.
  - `me without cookie is null`.
  - `bad credential is 401`.
  - `foreign origin is refused`: `POST /api/login` with `Origin: https://evil.example` -> 403.
  - `logout ends the session`: after logout, `/api/me` with the old cookie -> `{user:null}`.
- [ ] **Step 2:** Run `npm run test:e2e`; expect FAIL.
- [ ] **Step 3:** Implement. Session token = 32 bytes from `crypto.getRandomValues`, hex; D1 stores `SHA-256(token)` hex. Login upserts `users` (update email/name/picture), deletes expired sessions, inserts the new one. `getUser` extends `expires_at` when less than 15 days remain (and re-sends the cookie). Missing `Origin` on POST/PUT/DELETE is also refused.
- [ ] **Step 4:** Run `npm run test:e2e`; expect PASS. Commit "Add Google sign-in sessions".

### Task 4: Data document API and account delete

**Files:**
- Create: `shared/doc.js`, `shared/doc.test.mjs`
- Modify: `worker/index.js`, `test/e2e.mjs`

**Interfaces:**
- Produces: `validateDoc(doc) -> boolean` and `DOC_VERSION = 1` in `shared/doc.js`. A doc is `{ v: 1, state: { habits: Array<{id:string,name:string}>, checks: object, logs: object, salah: object, startBalance: number }, settings: object }`.
- Produces: `GET /api/data` -> `{data: doc|null, version: number}` (version 0 when none); `PUT /api/data {data, version}` -> `{version: version+1}`, or 409 `{data, version}` with the stored copy when `version` differs; 413 over 1,000,000 bytes; 400 when `validateDoc` fails; `DELETE /api/account` -> 200, deletes the user's `docs`, `sessions`, `users` rows and clears the cookie. All need a session (401 otherwise).

- [ ] **Step 1:** `shared/doc.test.mjs`: `valid doc passes`; fails for `v:2`, `state.habits` not an array, a habit without string `name`, `checks` an array, `startBalance` a string, missing `settings`, `null`.
- [ ] **Step 2:** e2e tests: `new account has no data` (`{data:null, version:0}`); `put then get round-trips`; `stale version gets 409` (two PUTs both with `version:0` -> second is 409 and returns the first's data and `version:1`); `too big is 413`; `invalid doc is 400`; `data needs sign-in` (401); `one account cannot read another's data` (user B's GET after user A's PUT -> `data:null`); `delete account removes everything` (then `/api/me` -> null and a fresh login sees `data:null`).
- [ ] **Step 3:** Run `npm test && npm run test:e2e`; expect FAIL.
- [ ] **Step 4:** Implement. The version check and write are one statement: `UPDATE docs SET data=?, version=version+1, updated_at=? WHERE user_id=? AND version=?` (insert when `version` is 0 and no row exists; a lost race on insert is a 409). Check `Content-Length` and the actual body length.
- [ ] **Step 5:** Run both test commands; expect PASS. Commit "Add saved data API and account delete".

### Task 5: Prayer times from the Worker, security headers for pages

**Files:**
- Create: `worker/prayer.js`, `worker/prayer.test.mjs`, `public/_headers`, `public/prayer-fallback.json` (copy of the current `public/prayer-times.json`)
- Modify: `worker/index.js`, `scripts/fetch-prayer-times.mjs` (export the parser), `src/lib/prayer.js` (comment only: file now comes from the Worker)
- Delete: `public/prayer-times.json` (the path is now answered by the Worker)

**Interfaces:**
- Produces: `parsePrayerPage(html: string) -> Array<{date, imsak, gunes, ogle, ikindi, aksam, yatsi}>` (throws when the data block or rows are missing); `GET /prayer-times.json` -> `{source, saved, rows}` (same shape `src/lib/prayer.js` already reads).

- [ ] **Step 1:** `worker/prayer.test.mjs`: `parses the __NEXT_DATA__ rows` with a small HTML fixture (2 rows, extra fields dropped); `throws on a page without the data block`.
- [ ] **Step 2:** Run `npm test`; expect FAIL. Implement `parsePrayerPage`; make `scripts/fetch-prayer-times.mjs` use the same logic (or delete the script if nothing else needs it after Task 11).
- [ ] **Step 3:** Route `/prayer-times.json`: use `caches.default` keyed by the URL, 6 h; on miss fetch the namazvakitleri Coventry page with header `User-Agent: Mozilla/5.0 (MyFutureSelf prayer times)`; on any failure answer `env.ASSETS.fetch` of `/prayer-fallback.json`.
- [ ] **Step 4:** `public/_headers` for `/*`: `Content-Security-Policy: default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; frame-src https://accounts.google.com/gsi/; connect-src 'self' https://accounts.google.com/gsi/ https://api.alquran.cloud https://api.quotable.kurokeita.dev; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style; font-src https://fonts.gstatic.com; img-src 'self' data: https://*.googleusercontent.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'`, plus `Cross-Origin-Opener-Policy: same-origin-allow-popups`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- [ ] **Step 5:** e2e `prayer times answer rows` (200, `rows.length >= 7`, works offline via fallback when the fetch fails — run with `--var PRAYER_URL:http://127.0.0.1:9/` to force the fallback; read the URL from `env.PRAYER_URL || <real URL>`) and `pages carry the CSP header` (`GET /` has `Content-Security-Policy`). Run; PASS. Commit "Serve prayer times and security headers from the Worker".

### Task 6: Start-up decision (which data to start from)

**Files:**
- Create: `src/lib/sync.js` (pure part), `src/lib/sync.test.mjs`
- Modify: `src/lib/store.js` (export `STORAGE_KEY`, `seed`, add `hasEntries(state) -> boolean`: any checks, logs or salah, or `startBalance !== 0`)

**Interfaces:**
- Produces: `decideStart({ userId, localOwner: string|null, localState: object|null, localDirty: boolean, remote: doc|null }) -> "remote" | "upload" | "ask" | "fresh"`.
- Produces: `readLocalDoc() -> doc|null`, `writeLocalDoc(doc, owner)`, `clearLocal()` (removes `habit-tracker-v1`, `mfs-settings-v1`, `mfs-owner-v1`, `mfs-dirty-v1`), `OWNER_KEY = "mfs-owner-v1"`, `DIRTY_KEY = "mfs-dirty-v1"`.

- [ ] **Step 1:** Tests for `decideStart`:
  - `other owner's local copy is dropped`: owner `"B"`, user `"A"`, remote null -> `"fresh"`; remote present -> `"remote"`.
  - `unowned local entries, empty account -> upload`.
  - `unowned local entries, account has data -> ask`.
  - `unowned local copy without entries -> remote` (or `"fresh"` when remote null).
  - `own copy, not dirty -> remote`.
  - `dirty own copy is uploaded` -> `"upload"`.
  - `no local, no remote -> fresh`.
- [ ] **Step 2:** Run `npm test`; FAIL. Implement; run; PASS. Commit "Decide which copy of the data to start from".

### Task 7: Sign-in screen, Gate, saving online

**Files:**
- Create: `src/lib/cloud.js`, `src/components/SignIn.jsx`, `src/Gate.jsx`, `src/components/account.css`
- Modify: `src/main.jsx` (render `<Gate />`), `src/App.jsx` (take `user`, `onSignOut`, `onDeleteAccount` props; run the save hook), `src/lib/sync.js` (hook), `index.html` (no inline scripts added)

**Interfaces:**
- Consumes: `decideStart`, `readLocalDoc`, `writeLocalDoc`, `clearLocal` (Task 6); API from Tasks 3–4.
- Produces in `cloud.js`: `getMe() -> Promise<user|null>`, `login(credential) -> Promise<user>`, `logout()`, `deleteAccount()`, `getDoc() -> Promise<{data, version}>`, `putDoc(data, version) -> Promise<{version} | {conflict: {data, version}}>`. All `fetch` with `credentials: "same-origin"`.
- Produces in `sync.js`: `useCloudSave({ state, settings, version, onConflict })` — sets `mfs-dirty-v1` on every change, PUTs 2 s after the last change, clears dirty and stores the new version on success; on conflict calls `onConflict(remote)`; also re-reads `getDoc()` when the tab becomes visible and calls `onConflict` if the version moved on. Retries a failed save after 30 s.
- Produces `Gate` phases: `"checking" | "signin" | "ask" | "ready"`.

- [ ] **Step 1:** `SignIn.jsx`: full-screen black page, "My Future Self", one line "Sign in with Google to keep your habits saved on every device.", the GIS button (load `https://accounts.google.com/gsi/client` once with a `<script>` element created in code; `google.accounts.id.initialize({ client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID, callback, ux_mode: "popup" })`, `renderButton(el, { theme: "filled_black", shape: "pill", size: "large", text: "signin_with" })`), a "Privacy" link to `/privacy.html`, and an error line when login fails.
- [ ] **Step 2:** `Gate.jsx`: on mount, if `location.hash` starts with `#move=`, base64url-decode the JSON doc, keep it only if `validateDoc` passes and the browser has no owned copy, write it with `writeLocalDoc(doc, null)`, and `history.replaceState` the hash away; then `getMe()`. Signed in -> `getDoc()` -> `decideStart` -> `"remote"`: `writeLocalDoc(remote, user.id)`; `"upload"`: `putDoc(local, version)` then `writeLocalDoc(local, user.id)`; `"fresh"`: `clearLocal()` then owner tag; `"ask"`: show a `.st` dialog "This device has its own entries" with buttons "Keep my online data" and "Replace it with this device's data". Then mount `<App key={user.id} user=… version=… />`. Sign-out and delete: call the API, `clearLocal()`, `google.accounts.id.disableAutoSelect()`, `location.reload()`.
- [ ] **Step 3:** `App.jsx`: call `useCloudSave`; on conflict replace state and settings with the remote copy (add a `replace` action to `store.js` that runs the same sanitising as `load()`) and show a short toast "Updated from another device".
- [ ] **Step 4:** Manual check with `npx wrangler dev --local` + `npm run dev` is not possible without a real Client ID; instead run `npm run build` (must succeed) and `npm test`. Commit "Require Google sign-in and save data online".

### Task 8: Account button next to the gear

**Files:**
- Create: `src/components/Account.jsx`
- Modify: `src/App.jsx` (render next to `GearButton` when `ready`), `src/components/account.css`

**Interfaces:**
- Consumes: `user {email, name, picture}`, `onSignOut()`, `onDeleteAccount()` props passed down from `Gate`.

- [ ] **Step 1:** Round 38 px button at `top:14px; right:60px` (`position:absolute`, same as `.gear`), showing `user.picture` (grayscale filter to keep the app black and white; first letter of the name if no picture), `referrerPolicy="no-referrer"`. Rises slowly on hover like other buttons.
- [ ] **Step 2:** Click opens a small menu: email, "Privacy" link, "Sign out", "Delete my account". Delete asks twice: first "Delete your account and all your saved data?" (Yes / No), then "This cannot be undone. Delete everything?" (Delete forever / Cancel). Escape and outside click close the menu.
- [ ] **Step 3:** `npm run build` succeeds. Commit "Add account menu next to Settings".

### Task 9: Privacy page and README

**Files:**
- Create: `public/privacy.html` (static, own `<!doctype html>`, same black/white look, no scripts)
- Modify: `README.md`

- [ ] **Step 1:** `privacy.html`: what is stored (Google name, email, picture, account id, your entries and settings), where (Cloudflare D1), what is not shared, how to delete (account menu -> Delete my account), cookies (one sign-in cookie), outside services (Google sign-in, Google Fonts, api.alquran.cloud, api.quotable.kurokeita.dev, namazvakitleri via the app's server).
- [ ] **Step 2:** README: new address, sign-in required, how to run locally (`npx wrangler dev` + `npm run dev`), deploy (`npm run deploy`), PIN section fixed (optional, off by default, turned on in Settings), Privacy section rewritten to match `privacy.html`.
- [ ] **Step 3:** Commit "Add privacy page, update README".

### Task 10: Google Client ID, create D1, deploy, live checks

Needs the owner's Google Client ID first (Google Cloud Console -> APIs & Services -> OAuth consent screen: External, app name "My Future Self", privacy link `https://my-future-self.flamesmp.workers.dev/privacy.html`, publish to Production; Credentials -> Create OAuth client ID -> Web application, authorised JavaScript origins `https://my-future-self.flamesmp.workers.dev` and `http://localhost:5173`).

- [ ] **Step 1:** `npx wrangler d1 create my-future-self`; put the id in `wrangler.jsonc`; `npx wrangler d1 execute my-future-self --remote --file worker/schema.sql`.
- [ ] **Step 2:** Put the Client ID in `.env` and `wrangler.jsonc` `vars.GOOGLE_CLIENT_ID`. `npm test && npm run test:e2e` pass.
- [ ] **Step 3:** `npm run deploy`. Check: `GET /` 200 with CSP header; `GET /api/me` -> `{user:null}`; `GET /prayer-times.json` has rows; `GET /privacy.html` 200; `flame-delivery` Worker untouched (`wrangler deployments list --name flame-delivery` shows no new deployment).
- [ ] **Step 4:** Browser check (Playwright + msedge): sign-in screen shows the Google button and no app content; no CSP errors in the console. The owner signs in once for real and confirms their data appears.
- [ ] **Step 5:** Commit "Deploy to Cloudflare" and push.

### Task 11: Old address becomes "moved" page

**Files:**
- Create: `moved/index.html` (own `<!doctype html>`, inline-free: script in `moved/move.js`)
- Modify: `.github/workflows/pages.yml` (no build, no schedule, upload `moved/` only)
- Delete: `scripts/fetch-prayer-times.mjs` if Task 5 no longer needs it

**Interfaces:**
- Produces: link `https://my-future-self.flamesmp.workers.dev/#move=<base64url JSON doc>` read by `Gate` (Task 7).

- [ ] **Step 1:** `move.js`: read `habit-tracker-v1` and `mfs-settings-v1`; if there are entries, show "My Future Self has moved" + "Move my data" button that opens the link with `{v:1, state, settings}` packed; if not, redirect to the new address after 2 s.
- [ ] **Step 2:** Local test: put a sample `habit-tracker-v1` into localStorage of a local copy of `moved/index.html`, click the button, check the new site (wrangler dev) imports it and, after sign-in, uploads it.
- [ ] **Step 3:** Commit "Old address points to the new one", push, check `https://furkfet-wq.github.io/my-future-self/` shows the moved page.
