// Habits belong to months: a habit added in a month (since = "YYYY-MM") shows from that month on, never in
// older months. Habits made before this existed have no `since` and show in every month.
export const monthOf = (dayOrMonthKey) => String(dayOrMonthKey).slice(0, 7);
export const habitsFor = (habits, dayOrMonthKey) => {
  const m = monthOf(dayOrMonthKey);
  return (Array.isArray(habits) ? habits : []).filter((h) => h && (!h.since || h.since <= m));
};
