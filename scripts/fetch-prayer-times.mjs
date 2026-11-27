// Saves Coventry prayer times to public/prayer-fallback.json. Runs before every deploy (npm run deploy).
// The live site reads /prayer-times.json from the Worker; this file is only its backup if namazvakitleri fails.
// A failed fetch keeps the old file and does not stop the deploy.
import { writeFile, mkdir } from "node:fs/promises";
import { parsePrayerPage, PRAYER_PAGE } from "../worker/prayer.js";

try {
  const res = await fetch(PRAYER_PAGE, { headers: { "User-Agent": "Mozilla/5.0 (MyFutureSelf prayer times)" } });
  if (!res.ok) throw new Error(`namazvakitleri answered ${res.status}`);
  const rows = parsePrayerPage(await res.text());
  await mkdir("public", { recursive: true });
  await writeFile("public/prayer-fallback.json", JSON.stringify({ source: PRAYER_PAGE, saved: new Date().toISOString(), rows }));
  console.log(`Saved ${rows.length} days (${rows[0].date} to ${rows.at(-1).date})`);
} catch (e) {
  console.warn(`Prayer fallback not updated: ${e.message}`);
}
