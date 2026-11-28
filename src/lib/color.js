// Colour maths for the notepad colour menu (no libraries). h 0-360, s and v 0-1, hex "#rrggbb".

export const HEX = /^#[0-9a-f]{6}$/;

export function hsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return "#" + [f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

// What someone typed -> "#rrggbb", or null. Takes "f00", "#F00", "ff0000", "#ff0000".
export function parseHex(text) {
  let t = String(text || "").trim().toLowerCase();
  if (!t.startsWith("#")) t = "#" + t;
  if (/^#[0-9a-f]{3}$/.test(t)) t = "#" + [...t.slice(1)].map((c) => c + c).join("");
  return HEX.test(t) ? t : null;
}

// Remembered custom colours (this browser only, never sent anywhere): newest first, no repeats.
export const pushRecent = (list, hex, max = 12) => [hex, ...list.filter((c) => c !== hex)].slice(0, max);
