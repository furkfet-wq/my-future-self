// Calculator maths without eval (the page's CSP forbids it anyway).
// An expression is a string like "12+3×4" or "−5÷2+10%": numbers, + − × ÷, a minus in front of a number,
// and % after a number (divides it by 100). × and ÷ go before + and −.

export const OPS = ["+", "−", "×", "÷"];
export const isOp = (ch) => OPS.includes(ch);

// "12+3×4" -> [12, "+", 3, "×", 4]; null if it is not a valid expression. A trailing operator is ignored.
export function tokenize(expr) {
  const out = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    const wantNumber = out.length === 0 || typeof out[out.length - 1] === "string";
    if (wantNumber) {
      let sign = 1;
      if (ch === "−" || ch === "-") {
        sign = -1;
        i++;
      }
      const m = /^(\d+\.?\d*|\.\d+)(%?)/.exec(expr.slice(i));
      if (!m) return i >= expr.length && sign === 1 ? out : null;
      let n = Number(m[1]) * sign;
      if (m[2]) n /= 100;
      out.push(n);
      i += m[0].length;
    } else if (isOp(ch)) {
      out.push(ch);
      i++;
    } else return null;
  }
  if (typeof out[out.length - 1] === "string") out.pop();
  return out;
}

// Number result, or null for an invalid expression or a division by 0.
export function evaluate(expr) {
  const t = tokenize(expr);
  if (!t || t.length === 0) return null;
  const sums = [t[0]];
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i];
    const n = t[i + 1];
    if (op === "×") sums[sums.length - 1] *= n;
    else if (op === "÷") {
      if (n === 0) return null;
      sums[sums.length - 1] /= n;
    } else sums.push(op === "−" ? -n : n);
  }
  const r = sums.reduce((a, b) => a + b, 0);
  return Number.isFinite(r) ? r : null;
}

// 0.1+0.2 shows 0.3, not 0.30000000000000004
export function formatNumber(n) {
  if (!Number.isFinite(n)) return "Error";
  const r = Number(n.toPrecision(12));
  return Object.is(r, -0) ? "0" : String(r).replace("-", "−");
}

const MAX_LEN = 40;
const TOO_BIG = 1e15;

// where the last number in the expression starts (its minus sign included)
function lastNumberStart(expr) {
  let i = expr.length;
  while (i > 0 && /[\d.%]/.test(expr[i - 1])) i--;
  if (i > 0 && expr[i - 1] === "−" && (i === 1 || isOp(expr[i - 2]))) i--;
  return i;
}

// One key press -> the next calculator state. `done`: the screen shows a finished result.
export function press(s, key) {
  const { expr, done } = s;
  const last = expr.at(-1) || "";
  if (key === "C") return { expr: "", done: false, prev: "", err: "" };
  if (key === "⌫") return { ...s, expr: done ? "" : expr.slice(0, -1), done: false, err: "" };
  if (key === "=") {
    if (!expr || done) return s;
    const r = evaluate(expr);
    if (r === null) return { ...s, err: /÷0(?![\d.])/.test(expr) ? "Can't divide by 0" : "Not a sum" };
    if (Math.abs(r) >= TOO_BIG) return { ...s, err: "Too big" };
    return { expr: formatNumber(r), done: true, prev: `${expr} =`, err: "" };
  }
  if (expr.length >= MAX_LEN && key !== "±") return s;
  const base = { ...s, done: false, err: "" };
  if (/^\d$/.test(key)) {
    if (done) return { ...base, expr: key };
    const num = expr.slice(lastNumberStart(expr)).replace("−", "");
    if (last === "%") return s;
    if (num === "0") return { ...base, expr: expr.slice(0, -1) + key };
    return { ...base, expr: expr + key };
  }
  if (key === ".") {
    if (done) return { ...base, expr: "0." };
    const num = expr.slice(lastNumberStart(expr));
    if (num.includes(".") || last === "%") return s;
    return { ...base, expr: expr + (/\d/.test(last) ? "." : "0.") };
  }
  if (key === "%") return /[\d.]/.test(last) ? { ...base, expr: expr + "%" } : s;
  if (key === "±") {
    const i = lastNumberStart(expr);
    if (i === expr.length) return s;
    return expr[i] === "−" ? { ...base, expr: expr.slice(0, i) + expr.slice(i + 1) } : { ...base, expr: expr.slice(0, i) + "−" + expr.slice(i) };
  }
  if (isOp(key)) {
    if (!expr) return key === "−" ? { ...base, expr: "−" } : s;
    if (isOp(last)) {
      // "×−" / "÷−" start a minus number; otherwise the new operator replaces the old one
      if (key === "−" && (last === "×" || last === "÷")) return { ...base, expr: expr + "−" };
      const trimmed = expr.replace(/[+−×÷]+$/, "");
      return trimmed ? { ...base, expr: trimmed + key } : s;
    }
    if (last === ".") return { ...base, expr: expr.slice(0, -1) + key };
    return { ...base, expr: expr + key };
  }
  return s;
}
