import { dateKey } from "./dates.js";

/* Prayer times for Coventry, read live from namazvakitleri.com.tr.
   The site does not allow other websites to read it, so the app asks its own dev server,
   which forwards to the site (see vite.config.js, path /namaz). The page carries ~38 days of
   times as JSON (fields: imsak = Fajr, gunes = Sunrise, ogle = Dhuhr, ikindi = Asr,
   aksam = Maghrib, yatsi = Isha). */

const PAGE = "/namaz/en/city/3170/coventry-prayer-times";
// On the live site the Worker answers prayer-times.json (worker/prayer.js), cached 6 hours.
const ENV = import.meta.env || {};
const STATIC_FILE = `${ENV.BASE_URL || "/"}prayer-times.json`;
const CACHE = "mfs-prayer-v1";
const REFRESH_MS = 6 * 3600 * 1000;

// Display order: chronological through the day. Optional prayers are marked.
export const SALAH = [
  { id: "tahajjud", name: "Tahajjud", optional: true },
  { id: "fajr", name: "Fajr", main: true },
  { id: "duha", name: "Duha", optional: true },
  { id: "dhuhr", name: "Dhuhr", main: true },
  { id: "asr", name: "Asr", main: true },
  { id: "maghrib", name: "Maghrib", main: true },
  { id: "awwabin", name: "Awwabin", optional: true },
  { id: "isha", name: "Isha", main: true },
];
export const MAIN = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const NAMES = Object.fromEntries(SALAH.map((s) => [s.id, s.name]));
export const prayerName = (id) => NAMES[id] || id;

function parsePage(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Prayer page changed (no data block)");
  return parseRows(JSON.parse(m[1])?.props?.pageProps?.data?.PrayerTimes);
}

function parseRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("Prayer page changed (no times)");
  const days = {};
  const hhmm = /^\d{2}:\d{2}$/;
  for (const r of rows) {
    const t = { fajr: r.imsak, sunrise: r.gunes, dhuhr: r.ogle, asr: r.ikindi, maghrib: r.aksam, isha: r.yatsi };
    if (/^\d{4}-\d{2}-\d{2}$/.test(r.date) && Object.values(t).every((v) => hhmm.test(v))) days[r.date] = t;
  }
  if (!Object.keys(days).length) throw new Error("Prayer times could not be read");
  return days;
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE) || "null");
  } catch {
    return null;
  }
}

export async function loadPrayerTimes({ force = false } = {}) {
  const cached = readCache();
  const today = dateKey(new Date());
  if (!force && cached?.days?.[today] && Date.now() - cached.at < REFRESH_MS) return { days: cached.days, at: cached.at, fresh: false };
  try {
    const live = !ENV.DEV && ENV.PROD;
    const res = await fetch(live ? `${STATIC_FILE}?d=${today}` : PAGE, { headers: { Accept: live ? "application/json" : "text/html" } });
    if (!res.ok) throw new Error(`Prayer site answered ${res.status}`);
    // keep last week's saved days (offline fallback) plus the fresh ones; older days are dropped
    const keepFrom = shift(today, -7);
    const old = Object.fromEntries(Object.entries(cached?.days || {}).filter(([k]) => k >= keepFrom));
    const days = { ...old, ...(live ? parseRows((await res.json()).rows) : parsePage(await res.text())) };
    const at = Date.now();
    try {
      localStorage.setItem(CACHE, JSON.stringify({ at, days }));
    } catch {
      /* ignore */
    }
    return { days, at, fresh: true };
  } catch (e) {
    if (cached?.days?.[today]) return { days: cached.days, at: cached.at, fresh: false, error: e.message };
    throw e;
  }
}

// "HH:MM" on a given date key -> Date
function at(key, hhmm) {
  const [y, mo, d] = key.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}
function shift(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

/* Windows of the five daily prayers on `key`:
   Fajr: Fajr to sunrise. Dhuhr: to Asr. Asr: to Maghrib. Maghrib: to Isha.
   Isha: until the next day's Fajr starts. */
export function windowsFor(days, key) {
  const t = days[key];
  if (!t) return null;
  const next = days[shift(key, 1)];
  const maghrib = at(key, t.maghrib);
  const nextFajr = next ? at(shift(key, 1), next.fajr) : new Date(at(key, t.fajr).getTime() + 86400000);
  return {
    key,
    times: t,
    list: [
      { id: "fajr", start: at(key, t.fajr), end: at(key, t.sunrise) },
      { id: "dhuhr", start: at(key, t.dhuhr), end: at(key, t.asr) },
      { id: "asr", start: at(key, t.asr), end: maghrib },
      { id: "maghrib", start: maghrib, end: at(key, t.isha) },
      { id: "isha", start: at(key, t.isha), end: nextFajr },
    ],
  };
}

// Current prayer window (if any) and the next prayer start, looking at yesterday, today, tomorrow.
export function prayerStatus(days, now = new Date()) {
  const k = dateKey(now);
  const all = [shift(k, -1), k, shift(k, 1)]
    .map((d) => windowsFor(days, d))
    .filter(Boolean)
    .flatMap((w) => w.list.map((p) => ({ ...p, key: w.key })));
  const current = all.find((p) => now >= p.start && now < p.end) || null;
  const next = all.find((p) => p.start > now) || null;
  return { current, next, all };
}

// Notes shown next to each salah row (today's times / when optional prayers are prayed)
export function rowNotes(days, key) {
  const t = days?.[key];
  if (!t) return {};
  const addMin = (hhmm, n) => {
    const d = at(key, hhmm);
    d.setMinutes(d.getMinutes() + n);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  return {
    tahajjud: "before Fajr",
    fajr: t.fajr,
    duha: `until ${addMin(t.dhuhr, -10)}`,
    dhuhr: t.dhuhr,
    asr: t.asr,
    maghrib: t.maghrib,
    awwabin: "after Maghrib",
    isha: t.isha,
  };
}

export function fmtLeft(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m >= 10) return `${m}m`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// always hours, minutes and seconds: "0h 47m 05s"
export function fmtHMS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

export const ALARM_BEFORE_MS = (15 * 60 + 36) * 1000; // 15 min 36 s before a prayer ends
