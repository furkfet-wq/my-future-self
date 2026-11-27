// Coventry prayer times from namazvakitleri.com.tr, answered at /prayer-times.json.
// The page carries the times as JSON in its __NEXT_DATA__ block. Cached 6 hours; if the site
// fails, the copy saved at deploy time (prayer-fallback.json) is served instead.
import { withSecurityHeaders, json } from "./http.js";
import CITIES from "./cities.json" with { type: "json" }; // [[id, lat, lng], ...] from namazvakitleri (scripts/fetch-cities.mjs)

export const PRAYER_PAGE = "https://namazvakitleri.com.tr/en/city/3170/coventry-prayer-times";
const KEEP = ["date", "imsak", "gunes", "ogle", "ikindi", "aksam", "yatsi"];
const CACHE_S = 6 * 3600;

export function parsePrayerPage(html) {
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("Prayer page changed (no data block)");
  const rows = JSON.parse(m[1])?.props?.pageProps?.data?.PrayerTimes;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Prayer page changed (no times)");
  return rows.map((r) => Object.fromEntries(KEEP.map((k) => [k, r[k]])));
}

// Kept in this Worker's memory too: the Cache API does nothing on *.workers.dev addresses.
let memo = { body: null, until: 0 };
const jsonResponse = (body) =>
  withSecurityHeaders(
    new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_S}` } })
  );

const CITY_IDS = new Set(CITIES.map((c) => c[0]));
const NV = "https://namazvakitleri.com.tr";
const MAX_CITIES = 300;
const cityMemo = new Map(); // id -> { body, until }

// The namazvakitleri city nearest to a place (distance on a flat map is fine at this scale).
export function nearestCity(lat, lng) {
  const rad = Math.PI / 180;
  const k = Math.cos(lat * rad);
  let best = null;
  let bestD = Infinity;
  for (const [id, clat, clng] of CITIES) {
    let dLng = Math.abs(clng - lng);
    if (dLng > 180) dLng = 360 - dLng;
    const d = (clat - lat) ** 2 + (dLng * k) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return { id: best, km: Math.round(Math.sqrt(bestD) * rad * 6371) };
}

export function parsePrayerCity(html) {
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  const c = m ? JSON.parse(m[1])?.props?.pageProps?.city : null;
  return c && Number.isInteger(c.id) ? { id: c.id, name: String(c.name || ""), country: String(c.country?.name || "") } : null;
}

async function cityTimes(id, env) {
  const hit = cityMemo.get(id);
  if (hit && Date.now() < hit.until) return jsonResponse(hit.body);
  try {
    const res = await fetch(`${env.PRAYER_BASE || NV}/en/city/${id}/x`, { headers: { "User-Agent": "Mozilla/5.0 (MyFutureSelf prayer times)" } });
    if (!res.ok) throw new Error(`namazvakitleri answered ${res.status}`);
    const html = await res.text();
    const rows = parsePrayerPage(html);
    const city = parsePrayerCity(html) || { id, name: "", country: "" };
    const body = JSON.stringify({ source: `${NV}/en/city/${id}`, city, saved: new Date().toISOString(), rows });
    if (cityMemo.size >= MAX_CITIES) cityMemo.delete(cityMemo.keys().next().value);
    cityMemo.set(id, { body, until: Date.now() + CACHE_S * 1000 });
    return jsonResponse(body);
  } catch (e) {
    console.warn("city prayer times failed:", e.message);
    return json({ error: "prayer times unavailable" }, 502);
  }
}

// /api/prayer-city?lat=..&lon=.. -> the nearest namazvakitleri city
export function prayerCity(request) {
  const q = new URL(request.url).searchParams;
  const lat = q.get("lat") === null ? NaN : Number(q.get("lat"));
  const lon = q.get("lon") === null ? NaN : Number(q.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ error: "bad coordinates" }, 400);
  return json(nearestCity(lat, lon));
}

export async function prayerTimes(request, env, ctx) {
  const city = new URL(request.url).searchParams.get("city");
  if (city !== null) {
    const id = /^\d{1,9}$/.test(city) ? Number(city) : NaN;
    if (!CITY_IDS.has(id)) return json({ error: "unknown city" }, 400);
    return cityTimes(id, env);
  }
  if (memo.body && Date.now() < memo.until) return jsonResponse(memo.body);
  const cache = caches.default;
  const key = new Request(new URL("/prayer-times.json", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const source = env.PRAYER_URL || PRAYER_PAGE;
  try {
    const res = await fetch(source, { headers: { "User-Agent": "Mozilla/5.0 (MyFutureSelf prayer times)" } });
    if (!res.ok) throw new Error(`namazvakitleri answered ${res.status}`);
    const rows = parsePrayerPage(await res.text());
    const body = JSON.stringify({ source: PRAYER_PAGE, saved: new Date().toISOString(), rows });
    memo = { body, until: Date.now() + CACHE_S * 1000 };
    const out = jsonResponse(body);
    ctx?.waitUntil?.(cache.put(key, out.clone()));
    return out;
  } catch (e) {
    console.warn("prayer times fallback:", e.message);
    const fallback = await env.ASSETS.fetch(new Request(new URL("/prayer-fallback.json", request.url)));
    return withSecurityHeaders(new Response(fallback.body, { status: fallback.status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }));
  }
}
