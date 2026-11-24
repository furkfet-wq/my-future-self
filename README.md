# My Future Self

A black and white habit and salah tracker with a carbon fibre Rubik's cube, live prayer times for Coventry, a daily Quran verse and motivation quotes.

## Run it

You need [Node.js](https://nodejs.org) installed.

- **Windows:** double-click `Open My Future Self.bat`. The first run installs what the app needs (a minute or two), then the app opens in your browser. Keep the black window open while you use it.
- **Any system:** open a terminal in this folder and run:

  ```
  npm install
  npm run dev
  ```

  then open http://localhost:5173

Run it with `npm run dev`: the prayer times are read from namazvakitleri.com.tr through the app's local dev server.

## What it does

- Habits grid (Monday to Sunday, month by month): click a box, black with a tick means done.
- Salah table with the five daily prayers plus optional Tahajjud, Duha and Awwabin.
- Prayer times with live countdowns, and an alarm 15 min 36 s before a daily prayer ends if it is not ticked.
- Daily actions: feel, productivity, energy (0 to 10), money made, money spent, time distracted.
- Week, month and all-time charts, a day-by-day table, streaks and a celebration when everything is done.
- Settings (gear, top right): alarm, prayer times, salah table, verse and quote on or off, plus an alarm test.

## PIN lock

The first time you open the app you choose your own 10-digit PIN; after that the app asks for it every time it opens. The PIN is never stored: only a salted PBKDF2-SHA-256 hash of it, in your own browser. After 5 wrong tries the app makes you wait (30 s, then longer). If you forget it, "Forgot PIN?" deletes the app's data on that device so you can start again; it cannot be recovered. You can change it in Settings.

The PIN stops other people using your computer from opening the app. It does not encrypt the saved data, so someone with technical access to your browser's storage could still read it.

## Privacy

Everything you enter is saved only in your own browser (localStorage) on your own device. The app has no accounts, no server and no database, and it never sends your data anywhere. It only fetches public content: prayer times (namazvakitleri.com.tr), Quran verses (api.alquran.cloud), quotes (api.quotable.kurokeita.dev) and fonts (Google Fonts). Clearing your browser data deletes your entries.
