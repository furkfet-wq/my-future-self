# Clock, Notepad and Muslim mode

Date: 2026-11-27. Status: approved by the owner, plus a security pass they asked for ("make sure users' information is safe").

## Why

The app is going public. The owner wants two everyday tools inside it (a clock with alarms, timer and stopwatch,
and a notepad), and a Muslim mode so people who are not Muslim can use the app without the Islamic parts.

## Goals

1. **Clock button + full-screen Clock.** A round clock-icon button with a small animation. Clicking opens a
   full-screen panel with three tabs: Alarms, Timer, Stopwatch. Professional and easy to understand.
2. **Notepad button + Notepad window.** A notepad-icon button opens a black window with white text that covers
   about 80% of the screen; the website stays visible around it (owner). Close with ×; make it bigger or smaller. A sound
   on every letter typed. Change text size, colour, highlight and font (font = "text type"). The note never gets
   deleted: it saves itself as you type, online with the account.
3. **Muslim mode** switch in Settings. On (default) = everything as now. Off = every Islamic part hidden.
4. Both buttons sit **above the big time on the Today card** (owner: "for now").
5. **Own timer** (owner): any length in hours, minutes and seconds, not only the quick buttons.
6. **Prayer location** (owner): on the Prayer times card, change the location by searching a place name (it finds
   the place) or with "Use my location"; prayer times, countdowns and the alarm then follow that place.

## Non-goals

- Alarms ringing when the browser is closed (a website cannot do this; told to the owner).
- Several notes (owner did not answer; one notepad page chosen, matches "a page").
- Phone/desktop notifications, alarm sounds to choose from, world clock.

## Anti-goals

- Losing note text (crash, closing the tab, two devices).
- An alarm that silently does not ring while the app is open.
- Muslim mode off deleting salah data (it only hides).

## Approaches (notepad editor)

1. **TipTap 3 (CHOSEN by the owner, "if it's safe").** Proven editor (ProseMirror), MIT, ~30M downloads/week,
   official @tiptap packages. Pinned to exactly **3.35.0** (a week old; 3.35.1 came out today). Notes are stored as
   TipTap JSON, never as HTML, and cleaned against an allow-list on both the app and the server.
2. Hand-built with the browser's contentEditable/execCommand: no dependency, but old, quirky API. Dropped.

## Design

### Placement
- `TodayPanel` gets a small row above `.tp-time` with two round 38 px buttons (same style as the account button):
  clock icon (hands sweep round on hover, a gentle ring wobble on click) and notepad icon (pencil writes a line
  on hover). Both rise slowly on hover like everything else.

### Clock (full screen, `.st`-style panel, black/white, Escape or × closes)
- **Alarms:** list of alarms, each with time (24 h, big digits), label (≤ 40 chars), repeat days (Mon–Sun chips;
  none = rings once), on/off switch, delete. "Add alarm" opens a simple editor. Next alarm shown at the top
  ("Rings in 7 h 12 min").
- **Timer:** your own time (hours / minutes / seconds wheels or boxes, the main way), plus quick buttons
  1, 5, 10, 15, 30 min. Big countdown ring, Start / Pause / Resume /
  Reset.
- **Stopwatch:** big time with hundredths, Start / Stop / Lap / Reset, lap list (lap time and total).
- **Ringing:** full-screen "Alarm" / "Time's up" screen with the label, the loud siren already used for the prayer
  alarm (`alarmStart`, plays even with Sound off), buttons **Stop** and (alarms only) **Snooze 5 min**. A ringing
  alarm or timer shows even if the Clock panel is closed. Once-only alarms switch themselves off after ringing.
- Alarms are saved with the account (on every device; they ring on whichever devices have the app open).
  Timer and stopwatch belong to the device (saved in the browser so a reload does not lose them).

### Notepad (window, not full screen)
- A window about 80% of the screen (80vw x 80vh), centred, with the website visible and dimmed slightly around it.
  Title bar: "Notepad", a size button (make it full size / back to normal) and ×. Drag the bottom-right corner
  (or any edge) to make it bigger or smaller; drag the title bar to move it. Size and place are remembered on that
  device. Escape does not close it (to avoid losing the window by accident); × does.
- Black, white text, toolbar under the title bar: font (5 choices: Archivo = app font, Serif, Mono, Rounded,
  Handwriting-style system font), size (12–48 px steps), text colour (white + 8 colours), highlight (none + 6
  colours), bold / italic / underline, undo / redo. Formatting applies to the selected text (like Word).
- Typing sound: the app's existing key sound (`sfx.key`) on each typed letter, respecting the Sound switch.
- Saves 0.5 s after typing stops into the account data (then online with the usual 2 s save), and when the page
  closes. A small "Saved" note in the corner.
- Size limit: about 300 KB of note; past that the page says the note is full.

### Muslim mode
- `settings.muslim` (default true), saved with the account.
- Off hides: Quran verse, prayer times card, Salah table, prayer alarm, "Salah this month" charts, salah streak
  badge + salah celebration, "Today's salah" bar on the Today card, salah lines in All days, the cube's
  "Pray your salah." message (the other 4 stay), and the Islamic switches in Settings (alarm, prayer times,
  Salah table, verse). Salah data is kept.

#### Prayer location
- "Change" link on the Prayer times card opens a small search: type a place, pick from the list (name, region,
  country). Search uses Open-Meteo's free place search (no key) from the browser. "Use my location" uses the
  browser's location (asks permission) and shows the nearest place name.
- Saved in `settings.place = {name, region, country, lat, lon, tz}`; empty = Coventry (as now).
- Times come ONLY from namazvakitleri (owner: other sources are sometimes inaccurate). namazvakitleri has 8,606
  cities worldwide, each with a public page `/en/city/<id>/...` carrying the times (same parsing as today).
  The chosen place's coordinates pick the NEAREST namazvakitleri city (list of id + lat/lng saved into the Worker
  at deploy time from namazvakitleri's own location list; the saved copy is used if that list cannot be fetched).
  The card shows which city the times are for ("Times for Istanbul") and, if the nearest city is far (> 30 km),
  says how far. Coventry stays the default (city 3170). Worker: `/prayer-times.json?city=<id>`, cached 6 h per
  city, unknown id -> 400.
- Times are the place's local clock times; the app assumes the device is in that place (normal use), so
  countdowns use the device clock (builder's call: no time-zone conversion).
- Privacy page and CSP updated for the place search service.

## Security pass (owner: "make sure the website actually protects them")

Already in place: Google token checked by the Worker, HttpOnly + Secure + SameSite session cookie (only its hash
stored), Origin check on every change, each account can only read/write its own data, saves naming another account
refused, every incoming copy cleaned, CSP blocking outside scripts, no framing, D1 encrypted at rest by Cloudflare.

Add:
1. **Rate limits** (Workers rate-limiting binding): sign-in 10/min per IP, data saves 60/min per account,
   prayer times and other API calls 120/min per IP; over the limit -> 429 and the app retries later. Protects
   accounts from password-style guessing of sessions and protects the shared free quota.
2. **Stronger cookie name** `__Host-mfs_session` (the browser then refuses it from any other site or path).
   Everyone signs in once more after the update.
3. **More security headers:** Strict-Transport-Security (1 year), Permissions-Policy (no camera, microphone,
   payment; location only for this site's "Use my location"), X-Frame-Options DENY.
4. **"Sign out everywhere"** in the account menu: ends every session of that account (lost or shared device).
5. **Fix the deferred minors:** signing out when offline says it failed instead of leaving the session valid;
   a 401 while saving goes back to the sign-in screen; an unknown Google key id refetches Google's keys once;
   signing out also removes the PIN from that browser.
6. **Notes and alarms** are plain data checked against an allow-list (no HTML is ever stored or injected).
7. **No personal data in logs:** Worker errors log only the error, never tokens, emails or notes.
8. **Final security review** of the whole change by a separate reviewer before going live, plus `npm audit`.

Honest limit (tell the owner): the data is protected from other users and outsiders, but it is not end-to-end
encrypted. Whoever controls the Cloudflare account (the owner) could read it. That is normal for this kind of app
and must stay in the privacy page.

## Data
- Account document `state` gains `notes` (TipTap JSON or null) and `alarms` (list of
  `{id, time:"HH:MM", label, days:[0-6], on}`, at most 30). `settings` gains `muslim` and `place`.
- `shared/doc.js` `cleanDoc` keeps them only if valid: note nodes `doc, paragraph, text, hardBreak`; marks
  `bold, italic, underline, highlight{color}, textStyle{color,fontFamily,fontSize}` with values from the fixed
  lists above. Anything else is dropped.

## Left to the builder
- Exact icons, animations and toolbar layout (black/white, slow rise on hover, matches the app).
- Tests: unit tests for cleaning notes/alarms and the "next alarm" maths; browser tests for opening the panels,
  setting an alarm that rings, timer finishing, typing and formatting a note that survives a reload and a second
  device, and Muslim mode hiding/showing.
