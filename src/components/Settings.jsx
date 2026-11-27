import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

import { SETTINGS_KEY as KEY } from "../lib/startup.js";
export const DEFAULT_SETTINGS = { alarm: true, prayerTimes: true, salahTable: true, verse: true, quote: true, hiddenGraphs: {} };

// Every graph that can be hidden with its × button.
export const GRAPHS = [
  ["wk-dots", "This week: Habits done each day"],
  ["wk-rise", "This week: Rising progress"],
  ["wk-stats", "This week: Day stats"],
  ["m-overall", "This month: Overall"],
  ["m-daily", "This month: Daily progress"],
  ["m-weekly", "This month: Weekly progress"],
  ["m-habits", "This month: Habit performance"],
  ["m-mood", "This month: Feel and productivity"],
  ["m-money", "This month: Money"],
  ["s-overall", "Salah: Salah overall"],
  ["s-daily", "Salah: Salah each day"],
  ["s-weekly", "Salah: Salah each week"],
  ["s-prayers", "Salah: Prayer by prayer"],
];

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY) || "{}") || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// Gear icon (shape from the Feather icon set, MIT licence). Spins while hovered.
export function GearButton({ onClick }) {
  return (
    <button className="gear" onClick={onClick} aria-label="Open settings" title="Settings">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );
}

function Switch({ label, hint, on, onChange }) {
  return (
    <div className="st-row">
      <div>
        <b>{label}</b>
        {hint && <span>{hint}</span>}
      </div>
      <button role="switch" aria-checked={on} aria-label={label} className={`st-switch${on ? " on" : ""}`} onClick={() => onChange(!on)}>
        <i />
        <em>{on ? "On" : "Off"}</em>
      </button>
    </div>
  );
}

export function SettingsPanel({ settings, onChange, onClose, onTestAlarm, onChangePin, pinOn, onPin }) {
  const root = useRef(null);
  const set = (k) => (v) => onChange({ ...settings, [k]: v });

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".st-back", { opacity: 0, duration: 0.3 });
        gsap.from(".st-panel", { y: 24, scale: 0.96, opacity: 0, duration: 0.45, ease: "power3.out" });
        gsap.from(".st-row, .st-test", { y: 10, opacity: 0, duration: 0.35, stagger: 0.05, delay: 0.12, ease: "power2.out", clearProps: "all" });
      });
    },
    { scope: root }
  );

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="st" ref={root}>
      <div className="st-back" onClick={onClose} />
      <div className="st-panel" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="st-head">
          <h2>Settings</h2>
          <button className="st-close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>
        <Switch label="Prayer alarm" hint="Rings 15 min 36 sec before a daily prayer ends if it is not ticked" on={settings.alarm} onChange={set("alarm")} />
        <Switch label="Prayer times" hint="Today's prayer times with live countdowns" on={settings.prayerTimes} onChange={set("prayerTimes")} />
        <Switch label="Salah table" hint="The grid where you tick each prayer" on={settings.salahTable} onChange={set("salahTable")} />
        <Switch label="Quran verse" hint="Verse of the day next to the cube" on={settings.verse} onChange={set("verse")} />
        <Switch label="Motivation quote" hint="Quote next to the cube" on={settings.quote} onChange={set("quote")} />
        <Switch label="PIN lock" hint="Ask for a 10-digit PIN when the app opens. Off by default." on={pinOn} onChange={onPin} />
        {pinOn && (
          <div className="st-test st-pin">
            <div>
              <b>Change PIN</b>
              <span>Pick a new 10-digit PIN</span>
            </div>
            <button onClick={onChangePin}>Change PIN</button>
          </div>
        )}
        <h3 className="st-sub">Graphs</h3>
        {GRAPHS.map(([id, label]) => (
          <Switch
            key={id}
            label={label}
            on={!settings.hiddenGraphs?.[id]}
            onChange={(v) => onChange({ ...settings, hiddenGraphs: { ...settings.hiddenGraphs, [id]: !v } })}
          />
        ))}
        <div className="st-test">
          <div>
            <b>Test alarm</b>
            <span>Plays the alarm now so you can hear and see it. Stop it from the red banner.</span>
          </div>
          <button onClick={onTestAlarm}>Test alarm</button>
        </div>
      </div>
    </div>
  );
}
