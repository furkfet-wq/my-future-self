// The saved-data document, shared by the app and the Worker:
// { v: 1, state: { habits, checks, logs, salah, startBalance }, settings }
export const DOC_VERSION = 1;

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

export function validateDoc(doc) {
  if (!isObj(doc) || doc.v !== DOC_VERSION || !isObj(doc.state) || !isObj(doc.settings)) return false;
  const s = doc.state;
  if (!Array.isArray(s.habits) || !s.habits.every((h) => isObj(h) && typeof h.id === "string" && typeof h.name === "string")) return false;
  if (!isObj(s.checks) || !isObj(s.logs) || !isObj(s.salah)) return false;
  return typeof s.startBalance === "number" && Number.isFinite(s.startBalance);
}

// ---- deep clean: every document from outside (old-address link, server, another device) goes through this ----
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LOG_FIELDS = ["feel", "productive", "energy", "money", "spent", "distracted"];
const SETTING_FLAGS = ["alarm", "prayerTimes", "salahTable", "verse", "quote"];
const MAX_HABITS = 200;

function cleanTicks(days) {
  const out = {};
  for (const [day, ids] of Object.entries(isObj(days) ? days : {})) {
    if (!DAY.test(day) || !isObj(ids)) continue;
    const kept = {};
    for (const [id, v] of Object.entries(ids)) if (v === true && id.length <= 64) kept[id] = true;
    if (Object.keys(kept).length) out[day] = kept;
  }
  return out;
}

function cleanLogs(days) {
  const out = {};
  for (const [day, log] of Object.entries(isObj(days) ? days : {})) {
    if (!DAY.test(day) || !isObj(log)) continue;
    const kept = {};
    for (const f of LOG_FIELDS) if (typeof log[f] === "number" && Number.isFinite(log[f])) kept[f] = log[f];
    if (Object.keys(kept).length) out[day] = kept;
  }
  return out;
}

export function cleanDoc(doc) {
  if (!isObj(doc) || !isObj(doc.state)) return null;
  const s = doc.state;
  const habits = (Array.isArray(s.habits) ? s.habits : [])
    .filter((h) => isObj(h) && typeof h.id === "string" && h.id && h.id.length <= 64 && typeof h.name === "string" && h.name.trim())
    .slice(0, MAX_HABITS)
    .map((h) => ({ id: h.id, name: h.name.trim().slice(0, 60) }));
  const settings = {};
  const raw = isObj(doc.settings) ? doc.settings : {};
  for (const k of SETTING_FLAGS) if (typeof raw[k] === "boolean") settings[k] = raw[k];
  if (isObj(raw.hiddenGraphs)) {
    settings.hiddenGraphs = {};
    for (const [g, v] of Object.entries(raw.hiddenGraphs)) if (v === true && g.length <= 32) settings.hiddenGraphs[g] = true;
  }
  return {
    v: DOC_VERSION,
    state: {
      habits,
      checks: cleanTicks(s.checks),
      logs: cleanLogs(s.logs),
      salah: cleanTicks(s.salah),
      startBalance: typeof s.startBalance === "number" && Number.isFinite(s.startBalance) ? s.startBalance : 0,
    },
    settings,
  };
}

// Same content, whatever the key order.
const canon = (x) =>
  Array.isArray(x) ? x.map(canon) : isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x;
export const sameDoc = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
