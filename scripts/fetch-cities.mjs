// Saves namazvakitleri's city list (id, lat, lng) to worker/cities.json. Runs before every deploy.
// The Worker uses it to find the nearest namazvakitleri city to a place someone picks.
// A failed fetch keeps the old file and does not stop the deploy.
import { writeFile } from "node:fs/promises";

try {
  const res = await fetch("https://nv-api.com/getAllLocations", { headers: { "User-Agent": "Mozilla/5.0 (MyFutureSelf prayer times)" } });
  if (!res.ok) throw new Error(`nv-api answered ${res.status}`);
  const { countries } = await res.json();
  const rows = [];
  for (const c of countries || []) for (const s of c.states || []) for (const city of s.cities || [])
    if (Number.isInteger(city.id) && Number.isFinite(city.lat) && Number.isFinite(city.lng)) rows.push([city.id, city.lat, city.lng]);
  if (rows.length < 1000) throw new Error(`only ${rows.length} cities`);
  await writeFile("worker/cities.json", JSON.stringify(rows));
  console.log(`Saved ${rows.length} prayer-time cities`);
} catch (e) {
  console.warn(`City list not updated: ${e.message}`);
}
