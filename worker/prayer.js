// Coventry prayer times from namazvakitleri.com.tr, answered at /prayer-times.json.
// The page carries the times as JSON in its __NEXT_DATA__ block. Cached 6 hours; if the site
// fails, the copy saved at deploy time (prayer-fallback.json) is served instead.
import { withSecurityHeaders } from "./http.js";

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

export async function prayerTimes(request, env, ctx) {
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
