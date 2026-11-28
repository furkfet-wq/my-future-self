// Clock maths for alarms, the timer and the stopwatch. No React here, so it can be tested with `node --test`.
// Alarm = { id, time: "HH:MM", label, days: [0-6] (0 = Sunday; empty = rings once), on }

const MISSED_MAX_MS = 10 * 60 * 1000; // a tab that slept rings alarms missed in the last 10 minutes, not older

function ringOn(alarm, day) {
  const [h, m] = alarm.time.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}

// The next time this alarm rings after `now` (strictly later), or null if it is off.
export function nextRing(alarm, now) {
  if (!alarm?.on) return null;
  for (let i = 0; i <= 7; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (alarm.days.length && !alarm.days.includes(day.getDay())) continue;
    const t = ringOn(alarm, day);
    if (t > now) return t;
  }
  return null;
}

// Alarms whose ring time falls in (since, now], looking back at most 10 minutes.
export function dueAlarms(alarms, since, now) {
  const from = new Date(Math.max(since.getTime(), now.getTime() - MISSED_MAX_MS));
  return alarms.filter((a) => {
    if (!a.on) return false;
    const t = nextRing(a, from);
    return t !== null && t <= now;
  });
}

export function fmtIn(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Rings in less than a minute";
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d) return `Rings in ${d} day${d > 1 ? "s" : ""}${h ? ` ${h} h` : ""}`;
  if (h) return `Rings in ${h} h${m ? ` ${m} min` : ""}`;
  return `Rings in ${m} min`;
}

// Whole days, hours, minutes and seconds in a time (the stopwatch shows these, no fractions of a second).
export function splitDHMS(ms) {
  const t = Math.floor(Math.max(0, ms) / 1000);
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
// "2d 03:04:05", "03:04:05", "04:05"
export function fmtDHMS(ms) {
  const { d, h, m, s } = splitDHMS(ms);
  const base = d || h ? `${two(h)}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
  return d ? `${d}d ${base}` : base;
}

const two = (n) => String(n).padStart(2, "0");
// "1:02:03.45" (hours only when needed, hundredths when asked)
export function fmtClock(ms, withHundredths) {
  const t = Math.max(0, ms);
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const base = h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
  return withHundredths ? `${base}.${two(Math.floor((t % 1000) / 10))}` : base;
}

// Timer: running -> { endsAt, pausedLeft: null }; paused -> { endsAt: null, pausedLeft }.
export function timerLeft({ endsAt, pausedLeft }, now) {
  if (endsAt == null) return Math.max(0, pausedLeft || 0);
  return Math.max(0, endsAt - now);
}

// Stopwatch: running -> startedAt set; `banked` = time counted before the last start.
export function stopwatchElapsed({ startedAt, banked }, now) {
  return (banked || 0) + (startedAt == null ? 0 : now - startedAt);
}
