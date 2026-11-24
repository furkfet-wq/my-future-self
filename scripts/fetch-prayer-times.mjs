// Saves Coventry prayer times from namazvakitleri.com.tr to public/prayer-times.json.
// Run by the GitHub Pages workflow once a day, because the live site cannot read namazvakitleri directly.
import { writeFile, mkdir } from "node:fs/promises";

const URL = "https://namazvakitleri.com.tr/en/city/3170/coventry-prayer-times";

const res = await fetch(URL, { headers: { "User-Agent": "Mozilla/5.0 (MyFutureSelf prayer times)" } });
if (!res.ok) throw new Error(`namazvakitleri answered ${res.status}`);
const html = await res.text();
const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
if (!m) throw new Error("Prayer page changed (no data block)");
const rows = JSON.parse(m[1])?.props?.pageProps?.data?.PrayerTimes;
if (!Array.isArray(rows) || rows.length < 7) throw new Error("Prayer page changed (no times)");

const keep = ["date", "imsak", "gunes", "ogle", "ikindi", "aksam", "yatsi"];
const clean = rows.map((r) => Object.fromEntries(keep.map((k) => [k, r[k]])));
await mkdir("public", { recursive: true });
await writeFile("public/prayer-times.json", JSON.stringify({ source: URL, saved: new Date().toISOString(), rows: clean }));
console.log(`Saved ${clean.length} days (${clean[0].date} to ${clean[clean.length - 1].date})`);
