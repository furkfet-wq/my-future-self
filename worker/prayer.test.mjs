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
