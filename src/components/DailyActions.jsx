import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { prettyDate } from "../lib/dates.js";
import { sfx } from "../lib/sound.js";

const SCALE = Array.from({ length: 11 }, (_, i) => i);

function Rating({ label, value, onChange }) {
  return (
    <div className="da-field">
      <div className="da-label">
        <span>{label}</span>
        <b>{value == null ? "–" : `${value}/10`}</b>
      </div>
      <div className="da-scale" role="radiogroup" aria-label={label}>
        {SCALE.map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={value === n}
            className={`da-pip${value === n ? " on" : ""}${value != null && n < value ? " lit" : ""}`}
            data-sfx="own"
            onClick={() => {
              if (value === n) sfx.undone();
              else sfx.pip(n);
              onChange(value === n ? null : n);
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function Money({ label = "Did you make any money?", aria = "Money made today in pounds", value, onChange }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  return (
    <div className="da-field">
      <div className="da-label">
        <span>{label}</span>
        <b>{value == null ? "–" : `${value < 0 ? "-" : ""}£${Math.abs(value).toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`}</b>
      </div>
      <label className="da-money">
        <span>£</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          placeholder="0.00"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? n : null);
          }}
          aria-label={aria}
        />
      </label>
    </div>
  );
}

// Time distracted, typed as hours + minutes, stored as total minutes.
function Distracted({ value, onChange }) {
  const [h, setH] = useState(value == null ? "" : String(Math.floor(value / 60)));
  const [m, setM] = useState(value == null ? "" : String(value % 60));
  const commit = (hs, ms) => {
    const hn = parseInt(hs, 10);
    const mn = parseInt(ms, 10);
    if (!Number.isFinite(hn) && !Number.isFinite(mn)) return onChange(null);
    onChange(Math.max(0, (Number.isFinite(hn) ? hn : 0) * 60 + (Number.isFinite(mn) ? mn : 0)));
  };
  const shown = value == null ? "–" : value >= 60 ? `${Math.floor(value / 60)}h ${value % 60}m` : `${value}m`;
  return (
    <div className="da-field">
      <div className="da-label">
        <span>How long were you distracted today?</span>
        <b>{shown}</b>
      </div>
      <div className="da-time">
        <label className="da-money">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="24"
            placeholder="0"
            value={h}
            onChange={(e) => {
              setH(e.target.value);
              commit(e.target.value, m);
            }}
            aria-label="Hours distracted"
          />
          <span>h</span>
        </label>
        <label className="da-money">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="59"
            placeholder="0"
            value={m}
            onChange={(e) => {
              setM(e.target.value);
              commit(h, e.target.value);
            }}
            aria-label="Minutes distracted"
          />
          <span>m</span>
        </label>
      </div>
    </div>
  );
}

export default function DailyActions({ log, dayKey, onChange }) {
  const root = useRef(null);

  // soft swap whenever a different day is picked
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".da-date, .da-field", { opacity: 0, y: 10, duration: 0.4, ease: "power3.out", stagger: 0.06, clearProps: "all" });
      });
    },
    { scope: root, dependencies: [dayKey] }
  );

  return (
    <div className="da" ref={root}>
      <p className="da-date">{prettyDate(dayKey)}</p>
      <div className="da-grid">
        <Rating label="How did your day feel?" value={log.feel ?? null} onChange={(v) => onChange({ feel: v })} />
        <Rating label="How productive was your day?" value={log.productive ?? null} onChange={(v) => onChange({ productive: v })} />
        <Rating label="How was your energy?" value={log.energy ?? null} onChange={(v) => onChange({ energy: v })} />
        <Money key={dayKey} value={log.money ?? null} onChange={(v) => onChange({ money: v })} />
        <Money
          key={`${dayKey}-spent`}
          label="Did you spend any money?"
          aria="Money spent today in pounds"
          value={log.spent ?? null}
          onChange={(v) => onChange({ spent: v == null ? null : Math.abs(v) })}
        />
        <Distracted key={`${dayKey}-dist`} value={log.distracted ?? null} onChange={(v) => onChange({ distracted: v })} />
      </div>
    </div>
  );
}
