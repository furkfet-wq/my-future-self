// Calendar reminders. No React here, so it can be tested with `node --test`.
// Saved as state.reminders = { "YYYY-MM-DD": [{ id, name, text, time: "HH:MM" or "" }] } (see shared/doc.js).
import { dateKey } from "./dates.js";

const MISSED_MAX_MS = 10 * 60 * 1000; // same as alarms: a tab that slept rings reminders missed in the last 10 minutes

export const newReminderId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

// A day's reminders: timed ones first (earliest first), then the rest in the order they were added.
export function dayReminders(reminders, key) {
  const list = reminders?.[key] || [];
  return [...list].sort((a, b) => (a.time && b.time ? a.time.localeCompare(b.time) : a.time ? -1 : b.time ? 1 : 0));
}

// When a reminder rings: its day at its time (local), or null when it has no time.
export function ringTime(key, r) {
  if (!r.time) return null;
  const [y, mo, d] = key.split("-").map(Number);
  const [h, m] = r.time.split(":").map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0);
}

// Reminders whose ring time falls in (since, now], looking back at most 10 minutes. -> [{ key, r }]
export function dueReminders(reminders, since, now) {
  const from = new Date(Math.max(since.getTime(), now.getTime() - MISSED_MAX_MS));
  const keys = [...new Set([dateKey(from), dateKey(now)])];
  const out = [];
  for (const key of keys)
    for (const r of reminders?.[key] || []) {
      const t = ringTime(key, r);
      if (t && t > from && t <= now) out.push({ key, r });
    }
  return out;
}

// Changes one day's list and drops the day when it becomes empty (keeps the saved data small).
export function withDay(reminders, key, list) {
  const next = { ...(reminders || {}) };
  if (list.length) next[key] = list;
  else delete next[key];
  return next;
}
