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
