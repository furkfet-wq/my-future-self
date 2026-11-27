# My Future Self

A black and white habit and salah tracker with a carbon fibre Rubik's cube, live prayer times for Coventry, a daily Quran verse and motivation quotes.

## Use it

Open **https://my-future-self.flamesmp.workers.dev** and sign in with Google. Your data is saved to your account, so you see the same habits on every device where you sign in with the same Google account. On Windows, `Open My Future Self.bat` just opens that address.

## Develop it

You need [Node.js](https://nodejs.org). In this folder:

```
npm install
npm run build
npx wrangler dev          # the Worker on http://127.0.0.1:8787 (sign-in, saved data, prayer times)
npm run dev               # the app on http://localhost:5173, /api is passed to the Worker
```

For local sign-in, create `.dev.vars` with `EXTRA_ORIGINS=http://localhost:5173`, and apply the database tables once:
`npx wrangler d1 execute my-future-self --local --file worker/schema.sql`.

Tests: `npm test` (unit), `npm run test:e2e` (Worker API against a local database), `npm run test:browser` (sign-in and saving in Edge). Run `npm run build` first for the last two.

Deploy: `npm run deploy` (saves a fresh backup of the prayer times, builds, and uploads to Cloudflare).

How it fits together: one Cloudflare Worker (`worker/`) serves the built app from `dist/` and answers `/api/*` (Google sign-in, saved data, account delete) and `/prayer-times.json`. Data is stored in the Cloudflare D1 database `my-future-self` (`worker/schema.sql`), one document per Google account.

## What it does

- Habits grid (Monday to Sunday, month by month): click a box, black with a tick means done.
- Salah table with the five daily prayers plus optional Tahajjud, Duha and Awwabin.
- Prayer times with live countdowns, and an alarm 15 min 36 s before a daily prayer ends if it is not ticked.
- Daily actions: feel, productivity, energy (0 to 10), money made, money spent, time distracted.
- Week, month and all-time charts, a day-by-day table, streaks and a celebration when everything is done.
- Settings (gear, top right): alarm, prayer times, salah table, verse and quote on or off, plus an alarm test.

## PIN lock

Optional and off by default. Turn it on in Settings to choose a 10-digit PIN; after that the app asks for it every time it opens on that device. The PIN is never stored: only a salted PBKDF2-SHA-256 hash of it, in your own browser. After 5 wrong tries the app makes you wait (30 s, then longer). "Forgot PIN?" removes the app's data from that browser; your saved data comes back from your account when you sign in again. You can change it or turn it off in Settings.

## Privacy

Sign-in is with Google: the app keeps your name, email, profile picture and Google account ID. What you enter is saved in the app's Cloudflare D1 database, linked to your Google account, with a copy in your browser. Only you can see your data; it is not sold or shared. One cookie keeps you signed in. To delete everything, use **Delete my account** in the account menu next to the Settings gear. The full text is in `public/privacy.html` (shown in the app at `/privacy.html`).
