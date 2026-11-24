import { useEffect, useMemo, useState } from "react";
import { dateKey, daysInMonth } from "../lib/dates.js";
import { MAIN } from "../lib/prayer.js";
import { dayStats, streak, isoWeek, dayOfYear, fmtMoney, fmtMins } from "../lib/week.js";

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id;
    const tick = () => {
      setNow(new Date());
      id = setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    id = setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => clearTimeout(id);
  }, []);
  return now;
}

const pad = (n) => String(n).padStart(2, "0");

export default function TodayPanel({ state, balance, onOpenToday }) {
  const now = useNow();
  const key = dateKey(now);
  const s = useMemo(() => dayStats(state, key), [state, key]);
  const run = useMemo(() => streak(state, key), [state, key]);
  const prayed = useMemo(() => MAIN.filter((id) => state.salah?.[key]?.[id]).length, [state, key]);
  const salahPct = Math.round((prayed / MAIN.length) * 100);
  const yearDays = new Date(now.getFullYear(), 1, 29).getDate() === 29 ? 366 : 365;
  const leftInMonth = daysInMonth(now.getFullYear(), now.getMonth()) - now.getDate();

  return (
    <section className="tp" aria-label="Today">
      <div className="tp-clock">
        <div className="tp-time">
          {pad(now.getHours())}:{pad(now.getMinutes())}
          <small>{pad(now.getSeconds())}</small>
        </div>
        <p className="tp-date">
          {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
        <p className="tp-meta">
          Week {isoWeek(now)} <span>/</span> Day {dayOfYear(now)} of {yearDays} <span>/</span>{" "}
          {leftInMonth === 0 ? "Last day of the month" : `${leftInMonth} day${leftInMonth === 1 ? "" : "s"} left this month`}
        </p>
      </div>

      <div className="tp-progress">
        <div className="tp-row">
          <span>Today's habits</span>
          <b>
            {s.done}/{s.total}
          </b>
        </div>
        <div className="tp-bar">
          <i style={{ width: `${s.pct}%` }} />
        </div>
        <div className="tp-pct">{s.pct}%</div>

        <div className="tp-row tp-row-2">
          <span>Today's salah</span>
          <b>
            {prayed}/{MAIN.length}
          </b>
        </div>
        <div className="tp-bar">
          <i style={{ width: `${salahPct}%` }} />
        </div>
        <div className="tp-pct">{salahPct}%</div>
        <button className="tp-go" onClick={onOpenToday}>
          Log today
        </button>
      </div>

      <dl className="tp-stats">
        <div>
          <dt>Feel</dt>
          <dd>{s.feel == null ? "–" : `${s.feel}/10`}</dd>
        </div>
        <div>
          <dt>Productive</dt>
          <dd>{s.productive == null ? "–" : `${s.productive}/10`}</dd>
        </div>
        <div>
          <dt>Energy</dt>
          <dd>{s.energy == null ? "–" : `${s.energy}/10`}</dd>
        </div>
        <div>
          <dt>Money today</dt>
          <dd>{fmtMoney(s.money)}</dd>
        </div>
        <div>
          <dt>Spent today</dt>
          <dd>{fmtMoney(s.spent)}</dd>
        </div>
        <div>
          <dt>Distracted</dt>
          <dd>{fmtMins(s.distracted)}</dd>
        </div>
        <div>
          <dt>Total money</dt>
          <dd>{fmtMoney(balance)}</dd>
        </div>
        <div>
          <dt>100% streak</dt>
          <dd>
            {run} day{run === 1 ? "" : "s"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
