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
export const NOTE_MAX_BYTES = 600_000; // one note as saved (text + styling)
export const NOTE_MAX_CHARS = 100_000; // letters in the notepad, all tabs together (spaces count, new lines do not)
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

// `room.left` = letters still allowed; shared by all notepad tabs, so text past the total limit is cut off.
export function cleanNotes(notes, room = { left: NOTE_MAX_CHARS }) {
  if (!isObj(notes) || notes.type !== "doc" || !Array.isArray(notes.content)) return null;
  const content = [];
  for (const block of notes.content) {
    if (!isObj(block) || block.type !== "paragraph") continue;
    const inner = [];
    for (const node of (Array.isArray(block.content) ? block.content : []).map(cleanInline).filter(Boolean)) {
      if (node.type === "text") {
        if (room.left <= 0) continue;
        if (node.text.length > room.left) node.text = node.text.slice(0, room.left);
        room.left -= node.text.length;
      }
      inner.push(node);
    }
    content.push(inner.length ? { type: "paragraph", content: inner } : { type: "paragraph" });
  }
  const out = { type: "doc", content };
  return JSON.stringify(out).length > NOTE_MAX_BYTES ? null : out;
}

// Notepad tabs: [{ id, name, doc }], at most 25; all tabs together hold at most NOTE_MAX_CHARS letters.
export const MAX_NOTE_TABS = 25;
export function cleanNoteTabs(list) {
  const out = [];
  const room = { left: NOTE_MAX_CHARS };
  for (const t of Array.isArray(list) ? list : []) {
    if (out.length >= MAX_NOTE_TABS) break;
    if (!isObj(t) || typeof t.id !== "string" || !t.id || t.id.length > 24 || out.some((o) => o.id === t.id)) continue;
    out.push({ id: t.id, name: typeof t.name === "string" ? t.name.slice(0, 30) : "", doc: cleanNotes(t.doc, room) });
  }
  return out;
}
// letters in a note (what the limit counts: text only, new lines do not count)
export const noteLetters = (doc) =>
  (isObj(doc) && Array.isArray(doc.content) ? doc.content : []).reduce(
    (n, b) => n + (Array.isArray(b?.content) ? b.content : []).reduce((m, x) => m + (typeof x?.text === "string" ? x.text.length : 0), 0),
    0
  );

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

// Sticky notes on the page: [{ id, x, y, w, h, color, doc }] (x / y in page pixels, doc = rich text).
// Text: paragraphs and bullet lists; bold, italic, underline, strikethrough. Nothing else is kept.
export const STICKY_COLOURS = ["yellow", "green", "pink", "purple", "blue", "gray", "charcoal"];
export const MAX_STICKIES = 50;
export const STICKY_MAX_CHARS = 5000;
const STICKY_MARKS = ["bold", "italic", "underline", "strike"];
function cleanStickyInline(node, room) {
  if (!isObj(node)) return null;
  if (node.type === "hardBreak") return { type: "hardBreak" };
  if (node.type !== "text" || typeof node.text !== "string" || !node.text || room.left <= 0) return null;
  const text = node.text.slice(0, room.left);
  room.left -= text.length;
  const seen = new Set();
  const marks = (Array.isArray(node.marks) ? node.marks : []).filter((m) => isObj(m) && STICKY_MARKS.includes(m.type) && !seen.has(m.type) && seen.add(m.type)).map((m) => ({ type: m.type }));
  return marks.length ? { type: "text", text, marks } : { type: "text", text };
}
function cleanStickyPara(block, room) {
  const inner = (Array.isArray(block?.content) ? block.content : []).map((n) => cleanStickyInline(n, room)).filter(Boolean);
  return inner.length ? { type: "paragraph", content: inner } : { type: "paragraph" };
}
export function cleanStickyDoc(doc) {
  const room = { left: STICKY_MAX_CHARS };
  const content = [];
  for (const block of isObj(doc) && doc.type === "doc" && Array.isArray(doc.content) ? doc.content.slice(0, 500) : []) {
    if (!isObj(block)) continue;
    if (block.type === "paragraph") content.push(cleanStickyPara(block, room));
    else if (block.type === "bulletList" && Array.isArray(block.content)) {
      const items = block.content
        .filter((li) => isObj(li) && li.type === "listItem")
        .slice(0, 200)
        .map((li) => ({ type: "listItem", content: [cleanStickyPara((Array.isArray(li.content) ? li.content : []).find((p) => isObj(p) && p.type === "paragraph"), room)] }));
      if (items.length) content.push({ type: "bulletList", content: items });
    }
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}
export function cleanStickies(list) {
  const out = [];
  const num = (v, lo, hi, d) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : d);
  for (const n of Array.isArray(list) ? list : []) {
    if (out.length >= MAX_STICKIES) break;
    if (!isObj(n) || typeof n.id !== "string" || !n.id || n.id.length > 24 || out.some((o) => o.id === n.id)) continue;
    out.push({
      id: n.id,
      x: num(n.x, 0, 20000, 40),
      y: num(n.y, 0, 100000, 40),
      w: num(n.w, 200, 900, 300),
      h: num(n.h, 150, 900, 300),
      color: STICKY_COLOURS.includes(n.color) ? n.color : "yellow",
      doc: cleanStickyDoc(n.doc),
    });
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
    // since = the month the habit was added in ("YYYY-MM"); it never shows in older months
    .map((h) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(h.since) ? { id: h.id, name: h.name.trim().slice(0, 60), since: h.since } : { id: h.id, name: h.name.trim().slice(0, 60) }));
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
      crosses: cleanTicks(s.crosses), // right-click X on a habit: means nothing, stats ignore it
      startBalance: typeof s.startBalance === "number" && Number.isFinite(s.startBalance) ? s.startBalance : 0,
      notes: cleanNotes(s.notes), // before tabs: the one note (moved into tab 1 by the app)
      noteTabs: cleanNoteTabs(s.noteTabs),
      alarms,
      reminders: cleanReminders(s.reminders, MAX_ALARMS - alarms.length),
      stickies: cleanStickies(s.stickies),
    },
    settings,
  };
}

// Same content, whatever the key order.
const canon = (x) =>
  Array.isArray(x) ? x.map(canon) : isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x;
export const sameDoc = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
