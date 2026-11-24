import { dateKey, mondayIndex } from "./dates.js";
import { MAIN } from "./prayer.js";

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function shiftKey(key, days) {
  const d = parseKey(key);
  return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

// The 7 dates (Mon..Sun) of the week that contains `key`.
export function weekOf(key) {
  const d = parseKey(key);
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayIndex(d));
  return Array.from({ length: 7 }, (_, i) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
}

export function dayStats(state, key) {
  const total = state.habits.length;
  const ids = new Set(state.habits.map((h) => h.id));
  const day = state.checks[key] || {};
  const done = Object.keys(day).filter((id) => day[id] && ids.has(id)).length;
  const log = state.logs[key] || {};
  return {
    key,
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    feel: log.feel ?? null,
    productive: log.productive ?? null,
    energy: log.energy ?? null,
    spent: log.spent ?? null,
    distracted: log.distracted ?? null,
    money: log.money ?? null,
  };
}

export function weekData(state, key) {
  const today = dateKey(new Date());
  return weekOf(key).map((d, i) => ({
    ...dayStats(state, dateKey(d)),
    future: dateKey(d) > today,
    name: DAY_NAMES[i],
    short: DAY_ABBR[i],
    date: d.getDate(),
    title: `${DAY_NAMES[i]} ${d.getDate()}`,
  }));
}

// First day that has any data (or `fallbackKey` when nothing is logged yet).
export function firstDataKey(state, fallbackKey) {
  const keys = [...Object.keys(state.checks), ...Object.keys(state.logs)].sort();
  return keys.length && keys[0] < fallbackKey ? keys[0] : fallbackKey;
}

// Every day from `fromKey` to `toKey` inclusive, oldest first, with stats and running money balance.
export function rangeData(state, fromKey, toKey) {
  // balance before the range starts
  let balance = state.startBalance;
  for (const [k, log] of Object.entries(state.logs)) {
    if (k < fromKey) balance += (Number.isFinite(log.money) ? log.money : 0) - (Number.isFinite(log.spent) ? log.spent : 0);
  }
  const out = [];
  let key = fromKey;
  for (let guard = 0; key <= toKey && guard < 4000; guard++) {
    const s = dayStats(state, key);
    balance += (Number.isFinite(s.money) ? s.money : 0) - (Number.isFinite(s.spent) ? s.spent : 0);
    const d = parseKey(key);
    out.push({
      ...s,
      balance,
      short: `${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`,
      title: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    });
    key = shiftKey(key, 1);
  }
  return out;
}

// Days in a row (ending today) where every habit was done. Today not finished yet does not break it.
export function streak(state, todayKey) {
  const total = state.habits.length;
  if (!total) return 0;
  let key = todayKey;
  let n = 0;
  for (let i = 0; i < 3650; i++) {
    const s = dayStats(state, key);
    if (s.done === total) n++;
    else if (i > 0) break;
    key = shiftKey(key, -1);
  }
  return n;
}

// Days in a row (ending today) with all five daily prayers ticked. Today not finished yet does not break it.
export function salahStreak(state, todayKey) {
  let key = todayKey;
  let n = 0;
  for (let i = 0; i < 3650; i++) {
    const day = state.salah?.[key] || {};
    if (MAIN.every((id) => day[id])) n++;
    else if (i > 0) break;
    key = shiftKey(key, -1);
  }
  return n;
}

export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

export function fmtMins(v) {
  if (v == null) return "–";
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtMoney(v) {
  if (v == null) return "–";
  const whole = Number.isInteger(v);
  return `${v < 0 ? "-" : ""}£${Math.abs(v).toLocaleString("en-GB", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
