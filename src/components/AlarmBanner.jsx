import { useEffect, useState } from "react";
import "./alarm.css";

// One look for everything that rings: prayer alarm, clock alarm, timer, calendar reminder.
// The red blinking page, the siren and the spinning cube are started by whoever shows this banner.
const ICONS = {
  // bell
  alarm: <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0" />,
  // hourglass
  timer: <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" />,
  // calendar
  reminder: <path d="M4.5 6.5h15v13h-15zM4.5 10.5h15M9 4v4M15 4v4M8.5 14h3" />,
  // crescent
  prayer: <path d="M15.5 4.5a8 8 0 1 0 4 12.5 6.5 6.5 0 1 1-4-12.5z" />,
};
ICONS.test = ICONS.alarm;

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * kind: "alarm" | "timer" | "reminder" | "prayer" | "test"
 * eyebrow: small red line on top (e.g. "Alarm"), title: what it is, detail: one more line (optional)
 * actions: [{ label, onClick, primary }]
 */
export function AlarmBanner({ kind = "alarm", eyebrow, title, detail, actions }) {
  const now = useClock();
  return (
    <>
      <div className="alarm-veil" aria-hidden="true" />
      <div className="alarm" role="alertdialog" aria-live="assertive" aria-label={`${eyebrow}: ${title}`}>
        <div className="alarm-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30">
            {ICONS[kind] || ICONS.alarm}
          </svg>
        </div>
        <div className="alarm-text">
          <span className="alarm-eyebrow">
            {eyebrow}
            <i>{now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</i>
          </span>
          <b className="alarm-title">{title}</b>
          {detail && <span className="alarm-detail">{detail}</span>}
        </div>
        <div className="alarm-actions">
          {actions.map((a, i) => (
            <button key={a.label} className={a.primary ? "alarm-primary" : "alarm-stop"} onClick={a.onClick} autoFocus={i === 0}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
