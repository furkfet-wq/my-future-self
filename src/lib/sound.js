// Small synthesized sound kit (Web Audio, no files). Browsers only allow sound after the
// first click or key press on the page, so sounds before that are silently skipped.

const KEY = "mfs-sound";
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
})();
let ctx = null;
let unlocked = false; // set by the first click / key press
let master = null;
let noiseBuf = null;
const listeners = new Set();

function ac(force = false) {
  if ((muted && !force) || !unlocked) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone({ freq, type = "sine", dur = 0.12, vol = 0.2, attack = 0.004, slideTo = null, when = 0, force = false }) {
  const c = ac(force);
  if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise({ dur = 0.03, vol = 0.12, freq = 2500, q = 0.8, type = "highpass", when = 0 }) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.4);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  // ticking a habit box: bright two-note "done"
  done() {
    tone({ freq: 660, type: "triangle", dur: 0.13, vol: 0.2 });
    tone({ freq: 990, dur: 0.2, vol: 0.13, when: 0.06 });
  },
  // un-ticking: soft falling note
  undone() {
    tone({ freq: 440, type: "triangle", dur: 0.16, vol: 0.16, slideTo: 250 });
  },
  // any button
  click() {
    noise({ dur: 0.025, vol: 0.09, freq: 2600 });
    tone({ freq: 1500, dur: 0.035, vol: 0.04 });
  },
  // typing
  key() {
    noise({ dur: 0.02, vol: 0.06, freq: 3800 });
  },
  // rating pick: pitch rises with the number
  pip(n) {
    tone({ freq: 280 * Math.pow(2, n / 12), type: "sine", dur: 0.16, vol: 0.16 });
    noise({ dur: 0.015, vol: 0.04, freq: 3000 });
  },
  // new habit added
  add() {
    tone({ freq: 520, type: "triangle", dur: 0.1, vol: 0.15 });
    tone({ freq: 780, type: "triangle", dur: 0.16, vol: 0.13, when: 0.07 });
  },
  // cube layer clack (speed 0..1, louder and higher in the frenzy)
  turn(speed = 0) {
    noise({ dur: 0.045, vol: 0.05 + speed * 0.12, freq: 900 + speed * 1600, q: 2.5, type: "bandpass" });
    tone({ freq: 140 + speed * 220, type: "triangle", dur: 0.05, vol: 0.04 + speed * 0.06 });
  },
  // loader box ticking black
  loaderTick(i) {
    tone({ freq: 300 + i * 14, type: "triangle", dur: 0.06, vol: 0.06 });
  },
  // all of today's habits done: rising arpeggio
  complete() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone({ freq: f, type: "triangle", dur: 0.35, vol: 0.16, when: i * 0.09 });
    });
  },
  // rising swell while the cube goes wild
  riser(dur = 5) {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(720, t + dur);
    f.type = "lowpass";
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(4000, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
    o.connect(f).connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.2);
  },
  // white flash: bright shimmering chord
  flash() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((fr, i) => {
      tone({ freq: fr, dur: 1.8, vol: 0.09, attack: 0.02, when: i * 0.015 });
      tone({ freq: fr * 1.004, dur: 1.6, vol: 0.05, attack: 0.03 });
    });
    noise({ dur: 0.9, vol: 0.08, freq: 6000 });
  },
  // streak number pops in
  pop() {
    tone({ freq: 880, dur: 0.12, vol: 0.14, slideTo: 1320 });
  },
};

// Loud two-tone siren, repeats every second until alarmStop().
let alarmTimer = null;
export function alarmStart() {
  if (alarmTimer) return;
  const play = () => {
    tone({ freq: 880, type: "square", dur: 0.45, vol: 0.32, attack: 0.01, force: true });
    tone({ freq: 440, type: "sawtooth", dur: 0.45, vol: 0.18, attack: 0.01, force: true });
    tone({ freq: 660, type: "square", dur: 0.45, vol: 0.32, attack: 0.01, when: 0.5, force: true });
    tone({ freq: 330, type: "sawtooth", dur: 0.45, vol: 0.18, attack: 0.01, when: 0.5, force: true });
  };
  play();
  alarmTimer = setInterval(play, 1000);
}
export function alarmStop() {
  clearInterval(alarmTimer);
  alarmTimer = null;
}

// poking the cube: plastic knock, higher and harder with every click
sfx.knock = (level = 1) => {
  const k = Math.min(level, 12) / 12;
  noise({ dur: 0.05, vol: 0.12 + k * 0.12, freq: 1400 + k * 2200, q: 3, type: "bandpass" });
  tone({ freq: 180 + k * 260, type: "triangle", dur: 0.09, vol: 0.14 + k * 0.1, slideTo: 120 + k * 120 });
};
// angry growl (strength 0..1)
sfx.growl = (strength = 1) => {
  tone({ freq: 70, type: "sawtooth", dur: 0.6 + strength * 0.5, vol: 0.1 + strength * 0.12, attack: 0.05, slideTo: 48 });
  tone({ freq: 104, type: "square", dur: 0.5 + strength * 0.4, vol: 0.05 + strength * 0.06, attack: 0.05, slideTo: 80 });
  noise({ dur: 0.6, vol: 0.05 + strength * 0.06, freq: 300, q: 1, type: "lowpass" });
};
// the cube hits the screen: deep, soft boom
sfx.smash = () => {
  tone({ freq: 90, dur: 1.0, vol: 0.42, attack: 0.006, slideTo: 34 });
  tone({ freq: 52, type: "triangle", dur: 1.2, vol: 0.28, attack: 0.006, slideTo: 28 });
  noise({ dur: 0.4, vol: 0.3, freq: 700, q: 0.7, type: "lowpass" });
};

export function isMuted() {
  return muted;
}

export function setMuted(v) {
  muted = v;
  try {
    localStorage.setItem(KEY, v ? "off" : "on");
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(v));
  if (!v) sfx.click();
}

export function onMuteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Generic sounds: every button click and every key typed in a text field.
// Elements with data-sfx="own" play their own sound instead.
export function installGlobalSounds() {
  const onDown = (e) => {
    const b = e.target.closest?.("button, [role='tab'], a");
    if (!b || b.disabled || b.closest("[data-sfx='own']")) return;
    sfx.click();
  };
  const onKey = (e) => {
    const t = e.target;
    if (!t || !(t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") sfx.key();
    else if (e.key === "Enter") sfx.click();
  };
  // first interaction unlocks audio (registered first so the first click is heard too)
  const unlock = () => {
    unlocked = true;
    ac();
  };
  document.addEventListener("pointerdown", unlock, { once: true, capture: true });
  document.addEventListener("keydown", unlock, { once: true, capture: true });
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey, true);
}
