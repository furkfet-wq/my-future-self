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
const SETTING_FLAGS = ["alarm", "prayerTimes", "salahTable", "verse", "quote", "muslim"];
const MAX_HABITS = 200;

// Notepad: the only fonts, sizes and colours the toolbar offers. Anything else is dropped.
export const NOTE_FONTS = ["Archivo", "Georgia, serif", "ui-monospace, monospace", '"Arial Rounded MT Bold", "Nunito", sans-serif', '"Segoe Print", "Bradley Hand", cursive'];
export const NOTE_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "40px", "48px"];
export const NOTE_COLOURS = ["#ffffff", "#ff5c5c", "#ffa24c", "#ffd84c", "#6ee07a", "#4cc3ff", "#7a8cff", "#c77dff", "#ff7ac8"];
export const NOTE_HIGHLIGHTS = ["#ffd84c", "#6ee07a", "#4cc3ff", "#ff7ac8", "#ffa24c", "#ffffff"];
export const NOTE_MAX_BYTES = 300_000;
export const NOTE_MAX_CHARS = 50_000; // letters in the notepad (spaces count, new lines do not)
// Things that ring, wherever they were made: clock alarms + calendar reminders that have a ring time.
export const MAX_ALARMS = 50;
export const ringingCount = (alarms, reminders) =>
  (alarms?.length || 0) + Object.values(reminders || {}).reduce((n, list) => n + list.filter((r) => r.time).length, 0);
const TEXT_STYLE = { color: NOTE_COLOURS, fontSize: NOTE_SIZES, fontFamily: NOTE_FONTS };
// Text and highlight colours: one of the toolbar's, or any colour from the colour menu as exactly "#rrggbb"
// (lower case, nothing else, so it can never carry anything but a colour into the page).
const okColour = (allowed, c) => allowed.includes(c) || (typeof c === "string" && /^#[0-9a-f]{6}$/.test(c));

function cleanMarks(marks) {
  const out = [];
  const seen = new Set();
  for (const m of Array.isArray(marks) ? marks : []) {
    if (!isObj(m) || seen.has(m.type)) continue;
    let mark = null;
    if (m.type === "bold" || m.type === "italic" || m.type === "underline") mark = { type: m.type };
    else if (m.type === "highlight" && okColour(NOTE_HIGHLIGHTS, m.attrs?.color)) mark = { type: "highlight", attrs: { color: m.attrs.color } };
    else if (m.type === "textStyle" && isObj(m.attrs)) {
      const attrs = {};
      for (const [k, allowed] of Object.entries(TEXT_STYLE)) if (k === "color" ? okColour(allowed, m.attrs[k]) : allowed.includes(m.attrs[k])) attrs[k] = m.attrs[k];
      if (Object.keys(attrs).length) mark = { type: "textStyle", attrs };
    }
    if (mark) {
      seen.add(m.type);
      out.push(mark);
    }
  }
  return out;
}

function cleanInline(node) {
  if (!isObj(node)) return null;
  if (node.type === "hardBreak") return { type: "hardBreak" };
  if (node.type !== "text" || typeof node.text !== "string" || !node.text) return null;
  const marks = cleanMarks(node.marks);
  return marks.length ? { type: "text", text: node.text, marks } : { type: "text", text: node.text };
}

export function cleanNotes(notes) {
  if (!isObj(notes) || notes.type !== "doc" || !Array.isArray(notes.content)) return null;
  const content = [];
  let room = NOTE_MAX_CHARS; // text past 50,000 letters is cut off
  for (const block of notes.content) {
    if (!isObj(block) || block.type !== "paragraph") continue;
    const inner = [];
    for (const node of (Array.isArray(block.content) ? block.content : []).map(cleanInline).filter(Boolean)) {
      if (node.type === "text") {
        if (room <= 0) continue;
        if (node.text.length > room) node.text = node.text.slice(0, room);
        room -= node.text.length;
      }
      inner.push(node);
    }
    content.push(inner.length ? { type: "paragraph", content: inner } : { type: "paragraph" });
  }
  const out = { type: "doc", content };
  return JSON.stringify(out).length > NOTE_MAX_BYTES ? null : out;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export function cleanAlarms(list) {
  const out = [];
  for (const a of Array.isArray(list) ? list : []) {
    if (out.length >= MAX_ALARMS) break;
    if (!isObj(a) || typeof a.id !== "string" || !a.id || a.id.length > 24 || !TIME.test(a.time)) continue;
    const days = Array.isArray(a.days) ? [...new Set(a.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((x, y) => x - y) : [];
    out.push({ id: a.id, time: a.time, label: typeof a.label === "string" ? a.label.slice(0, 40) : "", days, on: a.on === true });
  }
  return out;
}

// Calendar reminders: { "YYYY-MM-DD": [{ id, name, text, time: "HH:MM" or "" (no ring) }] }
export const MAX_REMINDERS = 1000;
export const REMINDER_NAME_MAX = 60;
export const REMINDER_TEXT_MAX = 1000;
export function cleanReminders(days, ringRoom = MAX_ALARMS) {
  const out = {};
  let count = 0;
  let rings = 0; // ring times kept; past the alarm limit a reminder is kept, without its ring time
  for (const [day, list] of Object.entries(isObj(days) ? days : {})) {
    if (!DAY.test(day) || !Array.isArray(list)) continue;
    const kept = [];
    for (const r of list) {
      if (count >= MAX_REMINDERS) break;
      if (!isObj(r) || typeof r.id !== "string" || !r.id || r.id.length > 24) continue;
      kept.push({
        id: r.id,
        name: typeof r.name === "string" ? r.name.slice(0, REMINDER_NAME_MAX) : "",
        text: typeof r.text === "string" ? r.text.slice(0, REMINDER_TEXT_MAX) : "",
        time: TIME.test(r.time) && rings++ < ringRoom ? r.time : "",
      });
      count++;
    }
    if (kept.length) out[day] = kept;
  }
  return out;
}

// The chosen place keeps no coordinates: only its name and the prayer-times city (privacy).
function cleanPlace(p) {
  if (!isObj(p) || !Number.isInteger(p.cityId) || p.cityId <= 0) return undefined;
  const str = (x) => (typeof x === "string" ? x.slice(0, 80) : "");
  const km = Number.isInteger(p.km) && p.km >= 0 && p.km <= 20000 ? p.km : 0;
  return { name: str(p.name), region: str(p.region), country: str(p.country), cityId: p.cityId, km };
}

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
  const place = cleanPlace(raw.place);
  const alarms = cleanAlarms(s.alarms);
  if (place) settings.place = place;
  return {
    v: DOC_VERSION,
    state: {
      habits,
      checks: cleanTicks(s.checks),
      logs: cleanLogs(s.logs),
      salah: cleanTicks(s.salah),
      startBalance: typeof s.startBalance === "number" && Number.isFinite(s.startBalance) ? s.startBalance : 0,
      notes: cleanNotes(s.notes),
      alarms,
      reminders: cleanReminders(s.reminders, MAX_ALARMS - alarms.length),
    },
    settings,
  };
}

// Same content, whatever the key order.
const canon = (x) =>
  Array.isArray(x) ? x.map(canon) : isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x;
export const sameDoc = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
