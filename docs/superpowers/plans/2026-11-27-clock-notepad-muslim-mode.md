# Clock, Notepad, Muslim mode, Prayer location + Security pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Clock (alarms, own timer, stopwatch), a resizable Notepad window (TipTap), Muslim mode, a prayer-location search, and harden account security.

**Architecture:** New data (`notes`, `alarms`, `settings.muslim`, `settings.place`) lives in the existing account document and is cleaned by `shared/doc.js` on app and server. Clock maths is a pure module (`src/lib/clock.js`); UI is new components opened from two buttons on the Today card. The Worker gains rate limits, a `__Host-` cookie, more headers, "sign out everywhere", and namazvakitleri prayer times for the nearest city to a chosen place.

**Tech Stack:** existing Vite/React/GSAP app + Cloudflare Worker/D1; TipTap 3.35.0 (exact); Workers rate-limiting binding; Open-Meteo geocoding (browser); namazvakitleri city pages (Worker).

**Spec:** `docs/superpowers/specs/2026-11-27-clock-notepad-muslim-mode-design.md`

## Global Constraints

- NEVER touch the Flame SMP store, the `flame-delivery` Worker or its D1.
- TipTap packages pinned EXACTLY to `3.35.0` (no `^`): `@tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-text-style @tiptap/extension-highlight`.
- Strictly black/white UI, slow rise on hover (`var(--rise)`), round 38 px icon buttons like `.acc-btn`.
- Notes stored as TipTap JSON only, never HTML. Allowed nodes: `doc, paragraph, text, hardBreak`. Allowed marks: `bold, italic, underline, highlight{color}, textStyle{color,fontFamily,fontSize}`.
- Fixed lists (exact values): fonts `Archivo` (app font), `Georgia, serif`, `ui-monospace, monospace`, `"Arial Rounded MT Bold", "Nunito", sans-serif`, `"Segoe Print", "Bradley Hand", cursive`; sizes `12px 14px 16px 18px 20px 24px 28px 32px 40px 48px` (default 18px); text colours `#ffffff #ff5c5c #ffa24c #ffd84c #6ee07a #4cc3ff #7a8cff #c77dff #ff7ac8`; highlights `#ffd84c #6ee07a #4cc3ff #ff7ac8 #ffa24c #ffffff` (highlighted text turns black).
- Note size limit 300,000 bytes of JSON; alarms max 30, label max 40 chars, time `HH:MM` 24 h, days ints 0–6 (0 = Sunday, JS `getDay()`).
- Alarm/timer ring uses existing `alarmStart()` / `alarmStop()` from `src/lib/sound.js` (plays even with Sound off).
- Muslim mode default ON; OFF only hides, never deletes.
- Prayer times ONLY from namazvakitleri (owner). Coventry = city 3170 default; other places = nearest namazvakitleri city.
- Rate limits: login 10/60 s per IP, data writes 60/60 s per account, everything else 120/60 s per IP → 429 `{error:"slow down"}`.
- Cookie name `__Host-mfs_session` (Secure, Path=/, no Domain).
- Worker logs never include tokens, emails, note text or cookies.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A note typed then the tab closed within 0.5 s: the text must survive a reload (Task 8 browser test `note survives a quick close`).
2. An alarm whose minute passes while the tab is in the background: it must still ring when the tab wakes (Task 6 unit test `due alarms catches a missed minute`).
3. Muslim mode off on one device: other devices follow after sync and nothing Islamic shows, including the prayer alarm (Task 5 browser test).
4. A place search with no results or a network failure: the card keeps the old place and says so (Task 4 browser test `search failure keeps the place`).
5. Pasting rich text from Word/web into the notepad: only allowed formatting survives, nothing else (Task 8 browser test `paste keeps only allowed styles`).

---

### Task 1: Data model for notes, alarms, Muslim mode, place

**Files:** Modify `shared/doc.js`, `shared/doc.test.mjs`, `src/lib/store.js`, `src/components/Settings.jsx` (DEFAULT_SETTINGS).

**Interfaces:**
- Produces: `cleanDoc` keeps `state.notes` (TipTap JSON | null), `state.alarms` (Alarm[]), `settings.muslim` (boolean), `settings.place` ({name, region, country, lat, lon, cityId:int} | absent). `Alarm = {id:string≤24, time:"HH:MM", label:string≤40, days:number[] (unique 0–6, sorted), on:boolean}`.
- Produces in store: actions `setNotes(json)`, `setAlarms(list)`; `clean()` keeps `notes` and `alarms`.
- `DEFAULT_SETTINGS.muslim = true`.

- [ ] Tests in `shared/doc.test.mjs`: `notes keep only allowed nodes and marks` (script node, link mark, `style` attr, colour not in list, fontSize `999px` all dropped; allowed ones kept); `notes over 300 KB are dropped to null`; `alarms are cleaned` (bad time `25:00`, label 60 chars → cut to 40, days `[7,1,1]` → `[1]`, 31st alarm dropped); `place is kept only with finite lat/lon in range`; `muslim must be boolean`.
- [ ] Run `npm test` → FAIL. Implement in `shared/doc.js`. Run → PASS. Store: add fields and actions; `npm run build` passes. Commit "Data model for notes, alarms, Muslim mode and place".

### Task 2: Security pass on the Worker

**Files:** Modify `worker/session.js`, `worker/index.js`, `worker/google.js`, `worker/http.js`, `wrangler.jsonc`, `public/_headers`, `test/e2e.mjs`, `test/harness.mjs`, `worker/google.test.mjs`.

**Interfaces:**
- Produces: cookie `__Host-mfs_session`; `POST /api/logout-all` (ends every session of the account, clears cookie); rate-limit helper `limit(env.BINDING, key) -> Response|null` in `worker/http.js` (no binding = no limit, for local tests unless the test binds one); bindings `RL_LOGIN` (10/60), `RL_WRITE` (60/60), `RL_API` (120/60) in `wrangler.jsonc` `ratelimits`.
- `googleKeys(env)` refetches once when a token's `kid` is unknown (at most once per 60 s).

- [ ] e2e tests: `cookie uses the __Host- prefix`; `sign out everywhere ends other sessions` (two logins of one account, logout-all with one → the other's `/api/me` is null); `login is rate limited` (11 quick bad logins from one client → at least one 429; harness runs wrangler with the real `ratelimits` config — local dev applies them); `security headers are on pages and API` (`strict-transport-security`, `permissions-policy` contains `camera=()`, `x-frame-options: DENY`).
- [ ] Unit test `unknown kid refetches keys once` in `worker/google.test.mjs` (getKeys called twice: first without the kid, then with it → valid).
- [ ] RED, implement, GREEN. `console.error` in `worker/index.js` logs `e.message` only. Commit "Security: rate limits, __Host- cookie, headers, sign out everywhere".

### Task 3: Prayer times for any place (Worker)

**Files:** Create `scripts/fetch-cities.mjs`, `worker/cities.json` (generated, committed: `[[id, lat, lng], ...]`); modify `worker/prayer.js`, `worker/prayer.test.mjs`, `scripts/fetch-prayer-times.mjs` (unchanged Coventry fallback), `package.json` (`deploy` runs fetch-cities first, non-fatal), `public/_headers` (CSP `connect-src` + `https://geocoding-api.open-meteo.com`), `public/privacy.html`.

**Interfaces:**
- `scripts/fetch-cities.mjs`: GET `https://nv-api.com/getAllLocations` → write `worker/cities.json` as `[[id, lat, lng], ...]`; on failure keep the old file.
- `nearestCity(lat, lng) -> {id, km}` in `worker/prayer.js` (equirectangular distance; uses `cities.json`).
- `GET /api/prayer-city?lat=&lon=` → `{id, km}` (bad numbers → 400).
- `GET /prayer-times.json?city=<id>` → `{source, city:{id, name}, saved, rows}` from `https://namazvakitleri.com.tr/en/city/<id>/x` (follows the redirect; name from the page's `__NEXT_DATA__` city name, else from the final URL slug); unknown id → 400; no `city` → Coventry 3170 exactly as now (fallback file only for Coventry). In-memory cache 6 h per city, max 300 cities.

- [ ] Unit tests: `nearest city of Istanbul coordinates is 5041` and `of Coventry is 3170` (real `cities.json`); `city pages are cached per city` (fetch mock counted); `unknown city id is refused`. e2e: `bad coordinates are 400`.
- [ ] RED, implement, GREEN. Privacy page: add Open-Meteo (place search from the browser), say prayer times come from namazvakitleri through the app's server, and the honest limit line ("not end-to-end encrypted; the app's owner can technically access the database"). Commit "Prayer times for any place from namazvakitleri".

### Task 4: Prayer location picker (app)

**Files:** Create `src/components/PlacePicker.jsx`; modify `src/lib/prayer.js`, `src/components/Salah.jsx` (PrayerTimesCard), `src/App.jsx`, `src/app.css`, `test/browser.mjs`.

**Interfaces:**
- `loadPrayerTimes({ force, place })` → fetches `/prayer-times.json?city=<place.cityId>` when `place` set; cache key `mfs-prayer-v1:<cityId>` (Coventry keeps `mfs-prayer-v1`).
- Picking a place: geocode → `/api/prayer-city?lat&lon` → save `settings.place = {name, region, country, lat, lon, cityId}`.
- `PlacePicker({ place, onPick(place|null), onClose })`: search box (debounced 400 ms, ≥2 letters) → `https://geocoding-api.open-meteo.com/v1/search?name=..&count=8&language=en` → list "Name, region, country"; "Use my location" (`navigator.geolocation`) → `{name:"My location", lat, lon}`; "Back to Coventry" → `onPick(null)`.
- Prayer card heading shows the place name and a "Change" link.

- [ ] Browser tests (route Open-Meteo with a fixture; the local Worker's `PRAYER_URL` points at a fake namazvakitleri page): `picking a place changes the prayer times` (card shows "Istanbul", setting `place.cityId` saved online); `search failure keeps the place` (geocoding aborted → message "Could not search right now", place unchanged).
- [ ] RED, implement, GREEN. Commit "Prayer location search".

### Task 5: Muslim mode

**Files:** modify `src/components/Settings.jsx`, `src/App.jsx`, `src/components/Hero.jsx`, `src/components/TodayPanel.jsx`, `src/components/AllDays.jsx`, `test/browser.mjs`.

**Interfaces:** `settings.muslim` (Task 1). `Hero` gets `muslim` prop (hides verse, salah streak, "Pray your salah." line); `TodayPanel` and `AllDays` get `muslim` (hide salah rows). In `App`: when off, no `PrayerAlarm`, `PrayerTimesCard`, `SalahCard`, "Salah this month" section, salah celebration; Settings hides alarm/prayer times/Salah table/verse switches and the Salah graphs in the Graphs list.

- [ ] Browser test `Muslim mode off hides every Islamic part and on brings it back` (checks absence/presence of: verse box, `#salah` card, prayer times card, "Salah this month", "Today's salah", salah streak; salah ticks still in the saved doc).
- [ ] RED, implement, GREEN. Commit "Muslim mode".

### Task 6: Clock maths

**Files:** create `src/lib/clock.js`, `src/lib/clock.test.mjs`.

**Interfaces:**
- `nextRing(alarm, now: Date) -> Date|null` (null when off; repeat days respected; once-only = next occurrence of the time).
- `dueAlarms(alarms, since: Date, now: Date) -> Alarm[]` (each alarm whose ring time is in `(since, now]`; catches minutes missed while the tab slept, but only up to 10 minutes back).
- `fmtIn(ms) -> "Rings in 7 h 12 min" | "Rings in 3 min" | "Rings in less than a minute"`, `fmtClock(ms, withHundredths) -> "1:02:03.45" | "02:03"`.
- Timer/stopwatch state helpers: `timerLeft({endsAt, pausedLeft}, now)`, `stopwatchElapsed({startedAt, banked}, now)`.

- [ ] Tests: `next ring later today`, `next ring tomorrow when time passed`, `repeat days skip to the next listed day`, `off alarm never rings`, `due alarms catches a missed minute`, `due alarms ignores older than 10 minutes`, formatting cases, timer pause/resume maths, stopwatch maths.
- [ ] RED, implement, GREEN. Commit "Clock maths".

### Task 7: Clock button, panel and ringing

**Files:** create `src/components/Clock.jsx`, `src/components/clock.css`; modify `src/components/TodayPanel.jsx` (button row above `.tp-time`), `src/App.jsx` (alarm checker every 1 s using `dueAlarms` with the last check time; timer end check; `Ringer`), `test/browser.mjs`.

**Interfaces:** consumes Task 6 functions and `actions.setAlarms`. Timer/stopwatch saved in localStorage `mfs-timer-v1`, `mfs-stopwatch-v1` (this device). Once-only alarms set `on:false` after ringing. Snooze = a timer of 5 min labelled with the alarm's label.

- [ ] Browser tests (use `page.clock` to control time): `clock button opens the full-screen clock with three tabs`; `an alarm rings at its time and Stop silences it` (set 07:00, advance clock → "Alarm" screen with label, Stop → gone, once-only now off); `own timer of 1 min 30 s rings at the end`; `stopwatch counts and records laps`.
- [ ] RED, implement, GREEN. Commit "Clock: alarms, timer, stopwatch".

### Task 8: Notepad window

**Files:** `npm i -E @tiptap/react@3.35.0 @tiptap/pm@3.35.0 @tiptap/starter-kit@3.35.0 @tiptap/extension-text-style@3.35.0 @tiptap/extension-highlight@3.35.0`; create `src/components/Notepad.jsx`, `src/components/notepad.css`; modify `src/components/TodayPanel.jsx` (button), `src/App.jsx`, `src/lib/sound.js` (typing sound also for `isContentEditable` targets), `test/browser.mjs`.

**Interfaces:** consumes `actions.setNotes`, `state.notes`. StarterKit limited to paragraph/text/hardBreak/bold/italic/underline/history (headings, lists, code, links, blockquote off). TextStyleKit pieces: Color, FontFamily, FontSize. Highlight `multicolor:true`. Window size/place in localStorage `mfs-notepad-win-v1` `{x,y,w,h,max}`; default 80vw x 80vh centred; min 320 x 240.

- [ ] Browser tests: `notepad opens as a window with the site visible behind`; `typing plays the key sound` (spy on `sfx.key` via a `window.__keySounds` counter the sound module increments in test builds? — no: count `AudioContext` oscillator starts through an init script); `formatting applies to the selection` (select a word, red colour + 32px + highlight → JSON marks); `note survives a quick close` (type, reload after 300 ms, text still there); `note shows on another device`; `paste keeps only allowed styles` (paste HTML with `<a>`, `<script>`, `<h1>`, `style="font-size:99px"` → plain text kept, none of those survive); `resize and full size work` (drag corner bigger; size button → full; × closes).
- [ ] RED, implement, GREEN. Commit "Notepad window".

### Task 9: Account safety in the app

**Files:** modify `src/components/Account.jsx`, `src/Gate.jsx`, `src/lib/sync.js`, `src/lib/startup.js` (`clearLocal` also removes `mfs-lock-v1`, `mfs-lock-tries-v1`, timer/stopwatch/notepad-window keys), `src/lib/cloud.js` (`logoutAll`), `test/browser.mjs`.

- [ ] Browser tests: `sign out everywhere signs out the other device` (two contexts; other context's next save → sign-in screen); `offline sign out says it failed and keeps you signed in` (route `/api/logout` abort → message shown, app still there); `a 401 while saving goes to the sign-in screen`; `signing out removes the PIN from this browser`.
- [ ] RED, implement (Gate signOut throws on failure; sync on 401 → `location.reload()`; menu item "Sign out everywhere"), GREEN. Commit "Account safety".

### Task 10: Review, audit, deploy

- [ ] `npm audit --omit=dev` → no high/critical; record result.
- [ ] Fresh security-focused whole-branch review; fix Critical/Important with tests.
- [ ] `npm run deploy`; live checks: `/` headers (HSTS, Permissions-Policy, CSP with open-meteo), `/api/me` null, `/prayer-times.json?city=5041` has Istanbul rows, real Google button renders without console errors, `__Host-` cookie (owner signs in once).
- [ ] Merge to main, push.
