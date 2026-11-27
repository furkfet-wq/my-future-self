import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePrayerPage } from "./prayer.js";

const page = (data) =>
  `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { data } } })}</script></body></html>`;
const row = (date) => ({ date, imsak: "05:29", gunes: "07:22", ogle: "11:56", ikindi: "13:54", aksam: "16:20", yatsi: "17:59", hicri: "x", extra: 1 });

test("parses the __NEXT_DATA__ rows", () => {
  const rows = parsePrayerPage(page({ PrayerTimes: [row("2026-11-27"), row("2026-11-28")] }));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { date: "2026-11-27", imsak: "05:29", gunes: "07:22", ogle: "11:56", ikindi: "13:54", aksam: "16:20", yatsi: "17:59" });
});

test("throws on a page without the data block", () => {
  assert.throws(() => parsePrayerPage("<html>nothing here</html>"));
  assert.throws(() => parsePrayerPage(page({ PrayerTimes: [] })));
});

test("namazvakitleri is fetched once per 6 hours even where the Cache API does nothing (workers.dev)", async () => {
  const { prayerTimes } = await import("./prayer.js");
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    return new Response(page({ PrayerTimes: [row("2026-11-27")] }));
  };
  try {
    const env = { PRAYER_URL: "https://example.test/p" };
    const a = await (await prayerTimes(new Request("https://app.test/prayer-times.json"), env)).json();
    const b = await (await prayerTimes(new Request("https://app.test/prayer-times.json"), env)).json();
    assert.equal(calls, 1);
    assert.deepEqual(a.rows, b.rows);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---- any place ----
const cityPage = (id, name, rows) =>
  `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { city: { id, name, country: { name: "Türkiye" } }, data: { PrayerTimes: rows } } } })}</script>`;

test("nearest city of Istanbul coordinates is 5041 and of Coventry is 3170", async () => {
  const { nearestCity } = await import("./prayer.js");
  assert.equal(nearestCity(41.01, 28.98).id, 5041);
  const cov = nearestCity(52.4068, -1.5197);
  assert.equal(cov.id, 3170);
  assert.ok(cov.km < 5, `${cov.km} km`);
});

test("parsePrayerCity reads the city name", async () => {
  const { parsePrayerCity } = await import("./prayer.js");
  assert.deepEqual(parsePrayerCity(cityPage(5041, "İstanbul", [row("2026-11-27")])), { id: 5041, name: "İstanbul", country: "Türkiye" });
});

test("city pages are cached per city", async () => {
  const { prayerTimes } = await import("./prayer.js");
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    return new Response(cityPage(5041, "İstanbul", [row("2026-11-27")]));
  };
  try {
    const env = {};
    const r1 = await (await prayerTimes(new Request("https://app.test/prayer-times.json?city=5041"), env)).json();
    await prayerTimes(new Request("https://app.test/prayer-times.json?city=5041"), env);
    assert.equal(seen.filter((u) => u.includes("/city/5041/")).length, 1);
    assert.deepEqual(r1.city, { id: 5041, name: "İstanbul", country: "Türkiye" });
    assert.equal(r1.rows[0].date, "2026-11-27");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("unknown city id is refused", async () => {
  const { prayerTimes } = await import("./prayer.js");
  for (const q of ["city=999999999", "city=abc", "city=-1"]) {
    const res = await prayerTimes(new Request(`https://app.test/prayer-times.json?${q}`), {});
    assert.equal(res.status, 400, q);
  }
});
