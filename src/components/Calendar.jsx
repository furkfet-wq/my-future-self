import { useEffect, useRef, useState } from "react";
import { dateKey, weeksOfMonth, MONTH_NAMES, DAY_SHORT, prettyDate } from "../lib/dates.js";
import { dayReminders, newReminderId, ringTime, withDay } from "../lib/reminders.js";
import { REMINDER_NAME_MAX, REMINDER_TEXT_MAX, MAX_REMINDERS } from "../../shared/doc.js";
import "./calendar.css";

const MONTHS_AHEAD = 12;
const JUMPS = [
  [0, "Now"],
  [3, "+3 months"],
  [6, "+6 months"],
  [12, "+12 months"],
];

/* Calendar button: the top page flips over on hover. */
export function CalendarButton({ onClick }) {
  return (
    <button className="tool-btn cal-btn" onClick={onClick} aria-label="Open calendar and reminders" title="Calendar">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M8 3v4M16 3v4" />
        <path className="cal-flap" d="M3.5 10h17" />
        <path className="cal-dots" d="M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01" />
      </svg>
    </button>
  );
}

const countAll = (reminders) => Object.values(reminders || {}).reduce((n, l) => n + l.length, 0);

/* One reminder: name, ring time (optional) and text. */
function ReminderCard({ r, dayKey, onChange, onDelete, autoFocus }) {
  const [asking, setAsking] = useState(false);
  const at = ringTime(dayKey, r);
  const status = !r.time ? "No ring. Add a time to ring." : at > new Date() ? `Rings at ${r.time}` : `Rang at ${r.time}`;
  return (
    <div className="cal-card">
      <div className="cal-card-top">
        <label className="cal-field cal-name">
          <span>Name</span>
          <input value={r.name} maxLength={REMINDER_NAME_MAX} placeholder="e.g. Dentist" autoFocus={autoFocus} onChange={(e) => onChange({ ...r, name: e.target.value })} />
        </label>
        <label className="cal-field cal-time">
          <span>Ring at</span>
          <input type="time" value={r.time} onChange={(e) => onChange({ ...r, time: e.target.value })} />
        </label>
      </div>
      <label className="cal-field">
        <span>Reminder</span>
        <textarea value={r.text} maxLength={REMINDER_TEXT_MAX} rows={3} placeholder="Write what you need to remember…" onChange={(e) => onChange({ ...r, text: e.target.value })} />
      </label>
      <div className="cal-card-foot">
        <small className={at && at > new Date() ? "cal-rings" : ""}>{status}</small>
        {asking ? (
          <span className="cal-ask">
            Delete this reminder?
            <button className="cal-small danger" onClick={onDelete}>
              Delete
            </button>
            <button className="cal-small" onClick={() => setAsking(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button className="cal-small" onClick={() => setAsking(true)}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* The calendar: this month and the next 12, click a day to add, name and write reminders. */
export function Calendar({ reminders, onReminders, onClose, startKey }) {
  const today = new Date();
  const todayKey = dateKey(today);
  const [offset, setOffset] = useState(() => {
    if (!startKey) return 0;
    const [y, m] = startKey.split("-").map(Number);
    return Math.min(MONTHS_AHEAD, Math.max(0, (y - today.getFullYear()) * 12 + (m - 1 - today.getMonth())));
  });
  const [selected, setSelected] = useState(startKey || todayKey);
  const [fresh, setFresh] = useState(null); // id of the reminder just added (its name box gets the cursor)
  const box = useRef(null);
  const view = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const weeks = weeksOfMonth(view.getFullYear(), view.getMonth());

  const full = countAll(reminders) >= MAX_REMINDERS;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const setList = (next) => onReminders(withDay(reminders, selected, next));
  const raw = reminders?.[selected] || []; // kept in the order added, so a card never jumps while you type
  const add = () => {
    if (full) return;
    const r = { id: newReminderId(), name: "", text: "", time: "" };
    setList([...raw, r]);
    setFresh(r.id);
  };
  const change = (r) => setList(raw.map((x) => (x.id === r.id ? r : x)));
  const remove = (id) => setList(raw.filter((x) => x.id !== id));
  const goMonth = (o) => setOffset(Math.min(MONTHS_AHEAD, Math.max(0, o)));

  return (
    <div className="cal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cal" role="dialog" aria-modal="true" aria-label="Calendar" ref={box}>
        <div className="cal-head">
          <b>Calendar</b>
          <div className="cal-jumps" role="group" aria-label="Jump to">
            {JUMPS.map(([o, label]) => (
              <button key={o} className={`cal-jump${offset === o ? " on" : ""}`} onClick={() => goMonth(o)}>
                {label}
              </button>
            ))}
          </div>
          <button className="np-icon" onClick={onClose} aria-label="Close calendar" title="Close">
            ×
          </button>
        </div>

        <div className="cal-body">
          <div className="cal-month">
            <div className="cal-nav">
              <button className="np-icon" onClick={() => goMonth(offset - 1)} disabled={offset === 0} aria-label="Previous month">
                ‹
              </button>
              <h2 key={offset} className="cal-title">
                {MONTH_NAMES[view.getMonth()]} {view.getFullYear()}
              </h2>
              <button className="np-icon" onClick={() => goMonth(offset + 1)} disabled={offset === MONTHS_AHEAD} aria-label="Next month">
                ›
              </button>
            </div>
            <div className="cal-grid" key={`g${offset}`}>
              {DAY_SHORT.map((d) => (
                <div key={d} className="cal-dow">
                  {d}
                </div>
              ))}
              {weeks.flat().map((d, i) => {
                if (!d) return <div key={`x${i}`} className="cal-day cal-empty" />;
                const k = dateKey(d);
                const items = dayReminders(reminders, k);
                const cls = ["cal-day", k === todayKey && "today", k === selected && "sel", k < todayKey && "past", items.length && "has"].filter(Boolean).join(" ");
                return (
                  <button key={k} className={cls} onClick={() => setSelected(k)} aria-label={`${prettyDate(k)}${items.length ? `, ${items.length} reminder${items.length > 1 ? "s" : ""}` : ""}`} aria-pressed={k === selected}>
                    <span className="cal-num">{d.getDate()}</span>
                    {items.slice(0, 2).map((r) => (
                      <span key={r.id} className="cal-chip">
                        {r.time && <em>{r.time}</em>}
                        {r.name || "Reminder"}
                      </span>
                    ))}
                    {items.length > 2 && <span className="cal-more">+{items.length - 2} more</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="cal-side" aria-label={`Reminders on ${prettyDate(selected)}`}>
            <h3>{selected === todayKey ? `Today, ${prettyDate(selected)}` : prettyDate(selected)}</h3>
            {raw.length === 0 && <p className="cal-none">No reminders on this day.</p>}
            <div className="cal-cards">
              {raw.map((r) => (
                <ReminderCard key={r.id} r={r} dayKey={selected} autoFocus={r.id === fresh} onChange={change} onDelete={() => remove(r.id)} />
              ))}
            </div>
            <button className="cal-add" onClick={add} disabled={full}>
              + Add reminder
            </button>
            {full && <p className="cal-none">You have {MAX_REMINDERS} reminders. Delete some to add more.</p>}
          </aside>
        </div>
      </div>
    </div>
  );
}
