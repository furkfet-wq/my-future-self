import { useEffect, useRef, useState } from "react";
import { nextRing, fmtIn, timerLeft, stopwatchElapsed, splitDHMS, fmtDHMS } from "../lib/clock.js";
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
const QUICK_MIN = [1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60, 90, 120, 180]; // two rows of 7
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
const RECENT_KEY = "mfs-recent-timers-v1"; // this browser only
const loadRecent = () => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x?.ms) && x.ms > 0 && x.ms < 100 * 3600000).slice(0, 4) : [];
  } catch {
    return [];
  }
};
const msLabel = (ms) => {
  const t = Math.round(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return [h && `${h} h`, m && `${m} min`, s && `${s} s`].filter(Boolean).join(" ") || "0 s";
};
const clockAt = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

// One number box with ▲ ▼ buttons; wraps round (59 -> 0).
function NumBox({ label, value, max, onChange }) {
  const step = (d) => onChange((value + d + max + 1) % (max + 1));
  return (
    <div className="tm-num">
      <button className="tm-step" onClick={() => step(1)} aria-label={`${label} up`} tabIndex={-1}>
        ▲
      </button>
      <input
        type="number"
        inputMode="numeric"
        min="0"
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))))}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => (e.key === "ArrowUp" || e.key === "ArrowDown") && (e.preventDefault(), step(e.key === "ArrowUp" ? 1 : -1))}
      />
      <button className="tm-step" onClick={() => step(-1)} aria-label={`${label} down`} tabIndex={-1}>
        ▼
      </button>
      <span>{label}</span>
    </div>
  );
}

function Timer({ timer, setTimer }) {
  const now = useTick(250);
  const [h, setH] = useState(0);
  const [m, setM] = useState(5);
  const [s, setS] = useState(0);
  const [label, setLabel] = useState("");
  const [recent, setRecent] = useState(loadRecent);
  const active = timer.endsAt != null || timer.pausedLeft != null;
  const left = timerLeft(timer, now);
  const start = (ms, name = label) => {
    if (ms <= 0) return;
    const r = [{ ms, label: name.trim().slice(0, 40) }, ...recent.filter((x) => x.ms !== ms || x.label !== name.trim())].slice(0, 4);
    setRecent(r);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(r));
    } catch {
      /* ignore */
    }
    setTimer({ endsAt: Date.now() + ms, pausedLeft: null, total: ms, label: name.trim().slice(0, 40) });
  };

  if (!active) {
    const total = ((h * 60 + m) * 60 + s) * 1000;
    const set = (ms) => {
      const t = Math.round(ms / 1000);
      setH(Math.floor(t / 3600));
      setM(Math.floor((t % 3600) / 60));
      setS(t % 60);
    };
    return (
      <div className="tm">
        <div className="clk-card tm-card">
          <div className="tm-set">
            <NumBox label="Hours" value={h} max={23} onChange={setH} />
            <b>:</b>
            <NumBox label="Minutes" value={m} max={59} onChange={setM} />
            <b>:</b>
            <NumBox label="Seconds" value={s} max={59} onChange={setS} />
          </div>
          <label className="tm-name">
            <span>Name (optional)</span>
            <input value={label} maxLength={40} placeholder="e.g. Tea, Study, Oven" onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start(total)} />
          </label>
          <p className="tm-ends">{total ? `Ends at ${clockAt(now + total)} · ${msLabel(total)}` : "Pick a time"}</p>
          <button className="clk-primary clk-big" disabled={!total} onClick={() => start(total)}>
            Start
          </button>
        </div>
        <div className="clk-section">
          <span className="clk-lbl">Quick start</span>
          <div className="tm-quick">
            {QUICK_MIN.map((q) => (
              <button key={q} onClick={() => set(q * 60000)} onDoubleClick={() => start(q * 60000)} title="Click to set, double-click to start">
                {q < 60 ? `${q} min` : `${q / 60} h`}
              </button>
            ))}
          </div>
        </div>
        {recent.length > 0 && (
          <div className="clk-section">
            <span className="clk-lbl">Recent</span>
            <div className="tm-recent">
              {recent.map((r) => (
                <button key={`${r.ms}-${r.label}`} onClick={() => start(r.ms, r.label || "")}>
                  <b>{msLabel(r.ms)}</b>
                  <span>{r.label || "Timer"}</span>
                  <i aria-hidden="true">▶</i>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
  const frac = timer.total ? left / timer.total : 0;
  const R = 130;
  const C = 2 * Math.PI * R;
  const running = timer.endsAt != null;
  return (
    <div className="tm">
      <div className={`tm-ring${running ? "" : " paused"}`}>
        <svg viewBox="0 0 300 300" aria-hidden="true">
          <circle cx="150" cy="150" r={R} className="tm-track" />
          <circle cx="150" cy="150" r={R} className="tm-left" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - frac) }} />
        </svg>
        <div className="tm-center">
          <span className="tm-label">{timer.label || "Timer"}</span>
          <div className="tm-left-txt">{fmtDHMS(Math.ceil(left / 1000) * 1000)}</div>
          <span className="tm-sub">{running ? `Ends at ${clockAt(timer.endsAt)}` : "Paused"}</span>
        </div>
      </div>
      <div className="clk-row">
        {running ? (
          <button className="clk-primary clk-big" onClick={() => setTimer({ ...timer, endsAt: null, pausedLeft: left })}>
            Pause
          </button>
        ) : (
          <button className="clk-primary clk-big" onClick={() => setTimer({ ...timer, endsAt: Date.now() + timer.pausedLeft, pausedLeft: null })}>
            Resume
          </button>
        )}
        <button
          onClick={() =>
            setTimer(
              running
                ? { ...timer, endsAt: timer.endsAt + 60000, total: timer.total + 60000 }
                : { ...timer, pausedLeft: timer.pausedLeft + 60000, total: timer.total + 60000 }
            )
          }
        >
          +1 min
        </button>
        <button onClick={() => setTimer({ endsAt: null, pausedLeft: null, total: 0 })}>Reset</button>
      </div>
      <p className="clk-note">Total {msLabel(timer.total)}. It keeps going when you close the clock.</p>
    </div>
  );
}

/* ---------- Stopwatch ---------- */
function Stopwatch({ sw, setSw }) {
  const running = sw.startedAt != null;
  const now = useTick(running ? 250 : 60000); // whole seconds only: no need to redraw 60 times a second
  const elapsed = stopwatchElapsed(sw, running ? now : 0);
  const { d, h, m, s } = splitDHMS(elapsed);
  const laps = sw.laps || [];
  const lapTimes = laps.map((t, i) => t - (laps[i - 1] || 0));
  const fastest = lapTimes.length > 1 ? Math.min(...lapTimes) : null;
  const slowest = lapTimes.length > 1 ? Math.max(...lapTimes) : null;
  const avg = lapTimes.length ? lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length : 0;
  const R = 130;
  const C = 2 * Math.PI * R;
  const secFrac = (elapsed % 60000) / 60000;
  const parts = [
    ["Days", d],
    ["Hours", h],
    ["Minutes", m],
    ["Seconds", s],
  ];
  return (
    <div className="sw">
      <div className={`tm-ring sw-ring${running ? " live" : ""}`}>
        <svg viewBox="0 0 300 300" aria-hidden="true">
          <circle cx="150" cy="150" r={R} className="tm-track" />
          <circle cx="150" cy="150" r={R} className="tm-left" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - secFrac) }} />
        </svg>
        <div className="tm-center">
          <span className="tm-label">{running ? "Running" : elapsed ? "Stopped" : "Stopwatch"}</span>
          <div className="sw-units" aria-label={fmtDHMS(elapsed)}>
            {parts.map(([name, v]) => (
              <div key={name} className={`sw-unit${name === "Days" && !d ? " dim" : ""}`}>
                <b>{String(v).padStart(2, "0")}</b>
                <span>{name}</span>
              </div>
            ))}
          </div>
          <span className="tm-sub">{sw.startedAt != null ? `Since ${clockAt(sw.startedAt)}` : laps.length ? `${laps.length} lap${laps.length > 1 ? "s" : ""}` : "Press Start"}</span>
        </div>
      </div>
      <div className="clk-row">
        {running ? (
          <>
            <button className="clk-primary clk-big" onClick={() => setSw({ ...sw, startedAt: null, banked: stopwatchElapsed(sw, Date.now()) })}>
              Stop
            </button>
            <button onClick={() => setSw({ ...sw, laps: [...laps, stopwatchElapsed(sw, Date.now())].slice(-99) })}>Lap</button>
          </>
        ) : (
          <>
            <button className="clk-primary clk-big" onClick={() => setSw({ ...sw, startedAt: Date.now() })}>
              {elapsed ? "Resume" : "Start"}
            </button>
            {elapsed > 0 && <button onClick={() => setSw({ startedAt: null, banked: 0, laps: [] })}>Reset</button>}
          </>
        )}
      </div>
      {laps.length > 0 && (
        <div className="clk-card sw-card">
          <div className="sw-stats">
            <div>
              <span>Laps</span>
              <b>{laps.length}</b>
            </div>
            <div>
              <span>Average</span>
              <b>{fmtDHMS(avg)}</b>
            </div>
            <div>
              <span>Fastest</span>
              <b>{fastest == null ? "–" : fmtDHMS(fastest)}</b>
            </div>
            <div>
              <span>Slowest</span>
              <b>{slowest == null ? "–" : fmtDHMS(slowest)}</b>
            </div>
          </div>
          <ol className="sw-laps">
            {lapTimes
              .map((lap, i) => ({ n: i + 1, lap, total: laps[i] }))
              .reverse()
              .map((l) => (
                <li key={l.n} className={l.lap === fastest ? "best" : l.lap === slowest ? "worst" : ""}>
                  <span>
                    Lap {l.n}
                    {l.lap === fastest && <em className="tag">Fastest</em>}
                    {l.lap === slowest && <em className="tag">Slowest</em>}
                  </span>
                  <b>{fmtDHMS(l.lap)}</b>
                  <em>{fmtDHMS(l.total)}</em>
                </li>
              ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ---------- Mouse light ----------
   Over empty dark background a soft light follows the mouse; over any menu part (buttons, boxes, cards, rings,
   tabs, lists) it fades out. The light glides after the mouse (eased every frame) and the loop stops by itself
   once the light has caught up, so nothing runs while the mouse is still. */
const MENU_PARTS = "button, input, label, select, textarea, li, .clk-card, .clk-tabs, .clk-row, .tm-ring, .tm-quick, .tm-recent, .al-list, .al-edit, .clk-note, .al-next, .clk-now";
function useMouseLight(root, spot) {
  useEffect(() => {
    const el = root.current;
    const light = spot.current;
    if (!el || !light || !matchMedia("(hover: hover)").matches) return undefined;
    const pos = { x: innerWidth / 2, y: innerHeight, tx: innerWidth / 2, ty: innerHeight };
    let raf = 0;
    const draw = () => {
      pos.x += (pos.tx - pos.x) * 0.16;
      pos.y += (pos.ty - pos.y) * 0.16;
      light.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      raf = Math.abs(pos.tx - pos.x) + Math.abs(pos.ty - pos.y) > 0.3 ? requestAnimationFrame(draw) : 0;
    };
    const onMove = (e) => {
      const onMenu = !!e.target.closest?.(MENU_PARTS);
      if (!light.classList.contains("on") && !onMenu) {
        // first time on the background: start right at the mouse instead of flying in
        pos.x = pos.tx = e.clientX;
        pos.y = pos.ty = e.clientY;
        light.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      }
      light.classList.toggle("on", !onMenu);
      pos.tx = e.clientX;
      pos.ty = e.clientY;
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const onLeave = () => light.classList.remove("on");
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [root, spot]);
}

/* ---------- The full-screen Clock ---------- */
export function ClockPanel({ alarms, onAlarms, ringing = alarms.length, timer, setTimer, sw, setSw, onClose }) {
  const [tab, setTab] = useState("alarms");
  const now = useTick(1000);
  const root = useRef(null);
  const spot = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !e.target.closest?.("input") && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  useMouseLight(root, spot);
  const tabs = [
    ["alarms", "Alarms"],
    ["timer", "Timer"],
    ["stopwatch", "Stopwatch"],
  ];
  return (
    <div className="clk" role="dialog" aria-modal="true" aria-label="Clock" ref={root}>
      <div className="clk-light" aria-hidden="true" />
      <div className="clk-spot" ref={spot} aria-hidden="true" />
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
