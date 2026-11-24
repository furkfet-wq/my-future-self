// Pure statistics for the habit tracker. No React, no DOM.
// Month is 0-11. Weeks start on Monday (dow: Mon=0 .. Sun=6).
// Date keys are LOCAL dates "YYYY-MM-DD" (same format as dates.js dateKey).
//
// state = {
//   habits: [{ id, name }],
//   checks: { "YYYY-MM-DD": { [habitId]: true } },
//   logs:   { "YYYY-MM-DD": { feel, productive, money } },
//   startBalance: number
// }

const pad = (n) => String(n).padStart(2, "0");
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Number or null. Accepts numeric strings; "", null, undefined, NaN, Infinity -> null. */
export function toNum(v) {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Round money to pennies so 0.1 + 0.2 does not show 0.30000000000000004. */
const money2 = (n) => Math.round(n * 100) / 100;
/** Money made minus money spent on one day. */
const net = (log) => (toNum(log?.money) ?? 0) - (toNum(log?.spent) ?? 0);

/** Integer percentage 0-100, 0 when total is 0. */
const pctOf = (done, total) =>
  total > 0 ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0;

const clamp10 = (v) => {
  const n = toNum(v);
  return n === null ? null : Math.min(10, Math.max(0, n));
};

function parts(state) {
  const habits = Array.isArray(state?.habits)
    ? state.habits.filter((h) => h && h.id != null)
    : [];
  const checks = state?.checks && typeof state.checks === "object" ? state.checks : {};
  const logs = state?.logs && typeof state.logs === "object" ? state.logs : {};
  const startBalance = toNum(state?.startBalance) ?? 0;
  return { habits, checks, logs, startBalance };
}

/** startBalance + every money amount ever logged (all months). */
export function totalBalance(state) {
  const { logs, startBalance } = parts(state);
  let sum = 0;
  for (const [key, log] of Object.entries(logs)) {
    if (!KEY_RE.test(key)) continue;
    sum += net(log);
  }
  return money2(startBalance + sum);
}

/**
 * Everything the charts need for one month.
 * Extra fields beyond the plan contract (safe to ignore): weeks[].start/end (day numbers),
 * mood[].dow, money.daily[].dow, habits[] keep the order of state.habits.
 */
export function computeStats(state, year, month0) {
  const { habits, checks, logs, startBalance } = parts(state);

  // Normalise year/month (month0 = 12 -> January of next year, etc.).
  const first = new Date(Number(year) || 0, Number(month0) || 0, 1);
  const y = first.getFullYear();
  const m0 = first.getMonth();
  const dim = new Date(y, m0 + 1, 0).getDate();
  const total = habits.length;
  const ids = habits.map((h) => h.id);

  const monthPrefix = `${y}-${pad(m0 + 1)}-`;
  const firstKey = `${monthPrefix}01`;

  // Money logged before this month (all earlier months count toward the balance).
  let running = startBalance;
  for (const [key, log] of Object.entries(logs)) {
    if (KEY_RE.test(key) && key < firstKey) running += net(log);
  }

  const perHabit = new Map(ids.map((id) => [id, 0]));
  const days = [];
  const mood = [];
  const daily = [];
  const weeks = [];
  let week = null;
  let monthIncome = 0;

  for (let d = 1; d <= dim; d++) {
    const key = monthPrefix + pad(d);
    const dow = (new Date(y, m0, d).getDay() + 6) % 7;
    const label = String(d);

    // Habits: count only ids that still exist, so deleted habits never inflate %.
    const dayChecks = checks[key];
    let done = 0;
    if (dayChecks && typeof dayChecks === "object") {
      for (const id of ids) {
        if (dayChecks[id]) {
          done++;
          perHabit.set(id, perHabit.get(id) + 1);
        }
      }
    }
    days.push({ key, label, dow, done, total, pct: pctOf(done, total) });

    // Weeks: Mon-first, only days inside the month.
    if (!week || dow === 0) {
      week = { label: `W${weeks.length + 1}`, start: d, end: d, done: 0, total: 0, pct: 0 };
      weeks.push(week);
    }
    week.end = d;
    week.done += done;
    week.total += total;

    // Daily actions.
    const log = logs[key] || null;
    mood.push({
      key,
      label,
      dow,
      feel: clamp10(log?.feel),
      productive: clamp10(log?.productive),
    });

    const income = net(log);
    monthIncome += income;
    running += income;
    daily.push({ key, label, dow, income: money2(income), balance: money2(running) });
  }

  for (const w of weeks) w.pct = pctOf(w.done, w.total);

  const goalPerHabit = dim;
  const habitStats = habits.map((h) => {
    const done = perHabit.get(h.id) || 0;
    return {
      id: h.id,
      name: String(h.name ?? ""),
      done,
      goal: goalPerHabit,
      left: Math.max(0, goalPerHabit - done),
      pct: pctOf(done, goalPerHabit),
    };
  });

  const goal = total * dim;
  const completed = habitStats.reduce((s, h) => s + h.done, 0);

  return {
    days,
    weeks,
    overall: { goal, completed, left: Math.max(0, goal - completed), pct: pctOf(completed, goal) },
    habits: habitStats,
    mood,
    money: {
      startBalance: money2(startBalance),
      balance: money2(running), // start + everything logged up to the last day of this month
      monthIncome: money2(monthIncome),
      daily,
    },
  };
}

/*
Self-check examples (run with node, see run_dir/check-stats.mjs):
  computeStats({ habits: [], checks: {}, logs: {}, startBalance: 236 }, 2026, 10)
    -> days.length 30, every pct 0, overall { goal: 0, completed: 0, left: 0, pct: 0 },
       money.balance 236, money.daily[0].balance 236
  November 2026 starts on a Sunday -> weeks[0] = { label: "W1", start: 1, end: 1 }, 6 weeks total.
  logs { "2026-10-31": { money: 10 }, "2026-11-02": { money: -5 } }, start 236
    -> Nov daily[0].balance 246, daily[1].balance 241, money.monthIncome -5, money.balance 241
*/
