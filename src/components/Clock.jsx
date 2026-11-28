import { useEffect, useRef, useState } from "react";
import { nextRing, fmtIn, fmtClock, timerLeft, stopwatchElapsed } from "../lib/clock.js";
import { MAX_ALARMS } from "../../shared/doc.js";
import "./clock.css";

const DAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
];
const QUICK_MIN = [1, 5, 10, 15, 30];
const newId = () => Math.random().toString(36).slice(2, 10);

// Re-render every `ms` (the clock faces tick).
function useTick(ms) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/* Round clock button: the hands sweep round on hover, the clock wobbles when clicked. */
export function ClockButton({ onClick }) {
  const [wobble, setWobble] = useState(false);
  return (
    <button
      className={`tool-btn clk-btn${wobble ? " wobble" : ""}`}
      onAnimationEnd={() => setWobble(false)}
      onClick={() => {
        setWobble(true);
        onClick();
      }}
      aria-label="Open clock: alarms, timer and stopwatch"
      title="Clock"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <circle cx="12" cy="13" r="8" />
        <path className="clk-h" d="M12 13V9.5" />
        <path className="clk-m" d="M12 13h3.5" />
        <path d="M5 4.5 2.8 6.6M19 4.5l2.2 2.1" />
      </svg>
    </button>
  );
}

/* ---------- Alarms ---------- */
function AlarmEditor({ alarm, onSave, onCancel, onDelete }) {
  const [time, setTime] = useState(alarm.time);
  const [label, setLabel] = useState(alarm.label);
  const [days, setDays] = useState(alarm.days);
  const toggleDay = (d) => setDays((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]));
  return (
    <form
      className="al-edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (/^\d{2}:\d{2}$/.test(time)) onSave({ ...alarm, time, label: label.trim().slice(0, 40), days: [...days].sort((x, y) => x - y), on: true });
      }}
    >
      <label className="al-time-in">
        <span>Time</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Alarm time" required />
      </label>
      <label className="al-label-in">
        <span>Name (optional)</span>
        <input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Gym" aria-label="Alarm name" />
      </label>
      <div className="al-days" role="group" aria-label="Repeat on">
        <span>Repeat</span>
        <div>
          {DAYS.map(([d, name]) => (
            <button type="button" key={d} className={days.includes(d) ? "on" : ""} aria-pressed={days.includes(d)} onClick={() => toggleDay(d)}>
              {name}
            </button>
          ))}
        </div>
        <small>{days.length ? "Rings on the days you picked" : "No days picked: rings once"}</small>
      </div>
      <div className="al-actions">
        <button type="submit" className="clk-primary" aria-label="Save alarm">
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        {onDelete && (
          <button type="button" className="clk-danger" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

function Alarms({ alarms, onAlarms, ringing }) {
  const now = new Date(useTick(15000));
  const [editing, setEditing] = useState(null); // alarm being edited, or a new one
  const sorted = [...alarms].sort((a, b) => a.time.localeCompare(b.time));
  const soonest = alarms
    .map((a) => ({ a, t: nextRing(a, now) }))
    .filter((x) => x.t)
    .sort((x, y) => x.t - y.t)[0];

  if (editing) {
    const isNew = !alarms.some((a) => a.id === editing.id);
    return (
      <AlarmEditor
        alarm={editing}
        onCancel={() => setEditing(null)}
        onSave={(a) => {
          onAlarms(isNew ? [...alarms, a] : alarms.map((x) => (x.id === a.id ? a : x)));
          setEditing(null);
        }}
        onDelete={isNew ? null : () => (onAlarms(alarms.filter((x) => x.id !== editing.id)), setEditing(null))}
      />
    );
  }
  return (
    <div className="al">
      <p className="al-next">{soonest ? `${soonest.a.label || "Next alarm"}: ${fmtIn(soonest.t - now)}` : "No alarms on"}</p>
      <ul className="al-list">
        {sorted.map((a) => {
          const t = nextRing(a, now);
          const name = a.label || "Alarm";
          return (
            <li key={a.id} className={a.on ? "" : "off"}>
              <button className="al-main" onClick={() => setEditing(a)} aria-label={`Edit ${name} ${a.time}`}>
                <b>{a.time}</b>
                <span>
                  {name} · {a.days.length ? DAYS.filter(([d]) => a.days.includes(d)).map(([, n]) => n).join(" ") : "Once"}
                </span>
                {t && <small>{fmtIn(t - now)}</small>}
              </button>
              <button
                role="switch"
                aria-checked={a.on}
                aria-label={`${name} ${a.time} on or off`}
                className={`st-switch${a.on ? " on" : ""}`}
                onClick={() => onAlarms(alarms.map((x) => (x.id === a.id ? { ...x, on: !x.on } : x)))}
              >
                <i />
                <em>{a.on ? "On" : "Off"}</em>
              </button>
            </li>
          );
        })}
      </ul>
      {ringing < MAX_ALARMS ? (
        <button className="clk-primary al-add" onClick={() => setEditing({ id: newId(), time: "07:00", label: "", days: [], on: true })}>
          Add alarm
        </button>
      ) : (
        <p className="al-next">
          You have the most alarms allowed ({MAX_ALARMS}). Calendar reminders with a ring time count too.
        </p>
      )}
      <p className="clk-note">Alarms ring while My Future Self is open in a tab, even in the background.</p>
    </div>
  );
}

/* ---------- Timer ---------- */
function NumBox({ label, value, max, onChange }) {
  return (
    <label className="tm-num">
      <input
        type="number"
        inputMode="numeric"
        min="0"
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))))}
        onFocus={(e) => e.target.select()}
      />
      <span>{label}</span>
    </label>
  );
}

function Timer({ timer, setTimer }) {
  const now = useTick(200);
  const [h, setH] = useState(0);
  const [m, setM] = useState(5);
  const [s, setS] = useState(0);
  const active = timer.endsAt != null || timer.pausedLeft != null;
  const left = timerLeft(timer, now);
  const start = (ms) => ms > 0 && setTimer({ endsAt: Date.now() + ms, pausedLeft: null, total: ms });

  if (!active) {
    const total = ((h * 60 + m) * 60 + s) * 1000;
    return (
      <div className="tm">
        <div className="tm-set">
          <NumBox label="Hours" value={h} max={23} onChange={setH} />
          <b>:</b>
          <NumBox label="Minutes" value={m} max={59} onChange={setM} />
          <b>:</b>
          <NumBox label="Seconds" value={s} max={59} onChange={setS} />
        </div>
        <div className="tm-quick">
          {QUICK_MIN.map((q) => (
            <button key={q} onClick={() => (setH(0), setM(q), setS(0))}>
              {q} min
            </button>
          ))}
        </div>
        <button className="clk-primary clk-big" disabled={!total} onClick={() => start(total)}>
          Start
        </button>
      </div>
    );
  }
  const frac = timer.total ? left / timer.total : 0;
  const R = 120;
  const C = 2 * Math.PI * R;
  return (
    <div className="tm">
      <div className="tm-ring">
        <svg viewBox="0 0 280 280" aria-hidden="true">
          <circle cx="140" cy="140" r={R} className="tm-track" />
          <circle cx="140" cy="140" r={R} className="tm-left" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - frac) }} />
        </svg>
        <div className="tm-left-txt">{fmtClock(Math.ceil(left / 1000) * 1000, false)}</div>
      </div>
      <div className="clk-row">
        {timer.endsAt != null ? (
          <button className="clk-primary" onClick={() => setTimer({ ...timer, endsAt: null, pausedLeft: left })}>
            Pause
          </button>
        ) : (
          <button className="clk-primary" onClick={() => setTimer({ ...timer, endsAt: Date.now() + timer.pausedLeft, pausedLeft: null })}>
            Resume
          </button>
        )}
        <button onClick={() => setTimer({ endsAt: null, pausedLeft: null, total: 0 })}>Reset</button>
      </div>
    </div>
  );
}

/* ---------- Stopwatch ---------- */
function Stopwatch({ sw, setSw }) {
  const [now, setNow] = useState(Date.now());
  const running = sw.startedAt != null;
  useEffect(() => {
    if (!running) return undefined;
    let raf;
    const loop = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  const elapsed = stopwatchElapsed(sw, running ? now : 0);
  const laps = sw.laps || [];
  return (
    <div className="sw">
      <div className="sw-time">{fmtClock(elapsed, true)}</div>
      <div className="clk-row">
        {running ? (
          <>
            <button className="clk-primary" onClick={() => setSw({ ...sw, startedAt: null, banked: stopwatchElapsed(sw, Date.now()) })}>
              Stop
            </button>
            <button onClick={() => setSw({ ...sw, laps: [...laps, stopwatchElapsed(sw, Date.now())].slice(-99) })}>Lap</button>
          </>
        ) : (
          <>
            <button className="clk-primary" onClick={() => setSw({ ...sw, startedAt: Date.now() })}>
              {elapsed ? "Resume" : "Start"}
            </button>
            {elapsed > 0 && <button onClick={() => setSw({ startedAt: null, banked: 0, laps: [] })}>Reset</button>}
          </>
        )}
      </div>
      {laps.length > 0 && (
        <ol className="sw-laps">
          {laps
            .map((total, i) => ({ n: i + 1, total, lap: total - (laps[i - 1] || 0) }))
            .reverse()
            .map((l) => (
              <li key={l.n}>
                <span>Lap {l.n}</span>
                <b>{fmtClock(l.lap, true)}</b>
                <em>{fmtClock(l.total, true)}</em>
              </li>
            ))}
        </ol>
      )}
    </div>
  );
}

/* ---------- The full-screen Clock ---------- */
export function ClockPanel({ alarms, onAlarms, ringing = alarms.length, timer, setTimer, sw, setSw, onClose }) {
  const [tab, setTab] = useState("alarms");
  const now = useTick(1000);
  const root = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !e.target.closest?.("input") && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const tabs = [
    ["alarms", "Alarms"],
    ["timer", "Timer"],
    ["stopwatch", "Stopwatch"],
  ];
  return (
    <div className="clk" role="dialog" aria-modal="true" aria-label="Clock" ref={root}>
      <div className="clk-top">
        <div className="clk-now">{new Date(now).toLocaleTimeString("en-GB")}</div>
        <button className="st-close clk-close" onClick={onClose} aria-label="Close clock">
          ×
        </button>
      </div>
      <div className="clk-tabs" role="tablist">
        {tabs.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
      </div>
      <div className="clk-body" role="tabpanel">
        {tab === "alarms" && <Alarms alarms={alarms} onAlarms={onAlarms} ringing={ringing} />}
        {tab === "timer" && <Timer timer={timer} setTimer={setTimer} />}
        {tab === "stopwatch" && <Stopwatch sw={sw} setSw={setSw} />}
      </div>
    </div>
  );
}

/* ---------- Ringing ---------- */
export function Ringer({ ring, onStop, onSnooze }) {
  const now = useTick(1000);
  const title = { timer: "Time's up", reminder: "Reminder" }[ring.kind] || "Alarm";
  return (
    <div className="rng" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="rng-box">
        <div className="rng-bell" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="64" height="64">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 13V9.5M12 13h3.5M5 4.5 2.8 6.6M19 4.5l2.2 2.1" />
          </svg>
        </div>
        <h1>{title}</h1>
        {ring.label && <p className="rng-label">{ring.label}</p>}
        <p className="rng-now">{new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
        <div className="clk-row">
          <button className="clk-primary clk-big" onClick={onStop} autoFocus>
            Stop
          </button>
          {ring.kind !== "timer" && (
            <button className="clk-big" onClick={onSnooze}>
              Snooze 5 min
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
