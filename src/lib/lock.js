// PIN lock. The PIN itself is never stored: only a salted PBKDF2-SHA-256 hash, in this browser.
// It stops other people using this computer from opening the app; it does not encrypt the data.

const KEY = "mfs-lock-v1";
const TRIES = "mfs-lock-tries-v1";
export const PIN_LENGTH = 10;
const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

async function derive(pin, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, key, 256);
  return toHex(bits);
}

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && v.salt && v.hash ? v : null;
  } catch {
    return null;
  }
}

export const hasPin = () => !!read();

export async function setPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt);
  localStorage.setItem(KEY, JSON.stringify({ v: 1, salt: toHex(salt), hash }));
  localStorage.removeItem(TRIES);
}

export async function checkPin(pin) {
  const v = read();
  if (!v) return false;
  const h = await derive(pin, fromHex(v.salt));
  let diff = h.length ^ v.hash.length;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ v.hash.charCodeAt(i);
  return diff === 0;
}

// Wrong attempts: after 5 in a row, wait 30 s, then 60 s, 120 s ... (kept across reloads)
export function waitLeftMs() {
  try {
    const t = JSON.parse(localStorage.getItem(TRIES) || "{}");
    return Math.max(0, (t.until || 0) - Date.now());
  } catch {
    return 0;
  }
}
export function recordTry(ok) {
  if (ok) return localStorage.removeItem(TRIES);
  let t = {};
  try {
    t = JSON.parse(localStorage.getItem(TRIES) || "{}");
  } catch {
    /* ignore */
  }
  const n = (t.n || 0) + 1;
  const until = n >= 5 && n % 5 === 0 ? Date.now() + 30000 * 2 ** (n / 5 - 1) : t.until || 0;
  localStorage.setItem(TRIES, JSON.stringify({ n, until }));
}

// "Forgot PIN": the only way back in is to delete this device's app data.
export function resetEverything() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith("mfs-") || k === "habit-tracker-v1")) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

// Turning the PIN lock off in Settings: forget the PIN hash and any wrong-try wait.
export function clearPin() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(TRIES);
}
