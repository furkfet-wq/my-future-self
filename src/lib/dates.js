// Local-date helpers. Weeks start on Monday. Month is 0-11.

const pad = (n) => String(n).padStart(2, "0");

export function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function daysInMonth(year, month0) {
  return new Date(year, month0 + 1, 0).getDate();
}

export function monthDays(year, month0) {
  const n = daysInMonth(year, month0);
  return Array.from({ length: n }, (_, i) => new Date(year, month0, i + 1));
}

// Monday = 0 ... Sunday = 6
export function mondayIndex(date) {
  return (date.getDay() + 6) % 7;
}

// Array of weeks. Each week is 7 entries (Mon..Sun): a Date inside the month, or null outside it.
export function weeksOfMonth(year, month0) {
  const weeks = [];
  let week = new Array(7).fill(null);
  for (const d of monthDays(year, month0)) {
    const i = mondayIndex(d);
    week[i] = d;
    if (i === 6) {
      weeks.push(week);
      week = new Array(7).fill(null);
    }
  }
  if (week.some(Boolean)) weeks.push(week);
  return weeks;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const DAY_SHORT = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function prettyDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
