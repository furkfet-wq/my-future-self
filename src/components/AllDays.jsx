import { useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { dateKey } from "../lib/dates.js";
import { rangeData, firstDataKey, shiftKey, fmtMoney, fmtMins } from "../lib/week.js";
import { SALAH, MAIN } from "../lib/prayer.js";
import { WeekDotLine, WeekRisingBars, WeekStatLine, TABS } from "./ExtraCharts.jsx";

const RANGES = [
  { id: 30, label: "Last 30 days" },
  { id: 90, label: "Last 90 days" },
  { id: "all", label: "All time" },
];

const STAT_TABS = [...TABS, { id: "balance", label: "Total money", unit: "£" }];

function DayDetail({ state, d, onEdit, muslim }) {
  const ref = useRef(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(ref.current, { height: 0, opacity: 0, duration: 0.55, ease: "power3.out", clearProps: "height,opacity" });
        gsap.from(".ad-hab", { opacity: 0, y: 8, stagger: 0.04, duration: 0.4, delay: 0.15, ease: "power2.out", clearProps: "all" });
      });
    },
    { scope: ref }
  );
  const checks = state.checks[d.key] || {};
  return (
    <div className="ad-detail" ref={ref}>
      <div className="ad-detail-in">
        <div className="ad-habs">
          {state.habits.length === 0 && <p className="ad-dim">No habits yet.</p>}
          {state.habits.map((h) => (
            <div className="ad-hab" key={h.id}>
              <span className={`ad-box${checks[h.id] ? " done" : ""}`}>{checks[h.id] && <svg className="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
              <span>{h.name}</span>
              <em>{checks[h.id] ? "Done" : "Not done"}</em>
            </div>
          ))}
        </div>
        <dl className="ad-facts">
          <div><dt>Habits done</dt><dd>{d.done}/{d.total} ({d.pct}%)</dd></div>
          <div><dt>Feel</dt><dd>{d.feel == null ? "–" : `${d.feel}/10`}</dd></div>
          <div><dt>Productive</dt><dd>{d.productive == null ? "–" : `${d.productive}/10`}</dd></div>
          <div><dt>Energy</dt><dd>{d.energy == null ? "–" : `${d.energy}/10`}</dd></div>
          <div><dt>Money made</dt><dd>{fmtMoney(d.money)}</dd></div>
          <div><dt>Money spent</dt><dd>{fmtMoney(d.spent)}</dd></div>
          <div><dt>Distracted</dt><dd>{fmtMins(d.distracted)}</dd></div>
          {muslim && <div>
            <dt>Salah prayed</dt>
            <dd>
              {MAIN.filter((id) => state.salah?.[d.key]?.[id]).length}/5
              {SALAH.some((p) => p.optional && state.salah?.[d.key]?.[p.id]) &&
                ` + ${SALAH.filter((p) => p.optional && state.salah?.[d.key]?.[p.id]).length} optional`}
            </dd>
          </div>}
          <div><dt>Total money after this day</dt><dd>{fmtMoney(d.balance)}</dd></div>
        </dl>
        <button className="ad-edit" onClick={() => onEdit(d.key)}>
          Edit this day
        </button>
      </div>
    </div>
  );
}

export default function AllDays({ state, onEdit, muslim = true }) {
  const [range, setRange] = useState(30);
  const [openKey, setOpenKey] = useState(null);
  const todayKey = dateKey(new Date());

  const data = useMemo(() => {
    const from = range === "all" ? firstDataKey(state, shiftKey(todayKey, -6)) : shiftKey(todayKey, -(range - 1));
    return rangeData(state, from, todayKey);
  }, [state, range, todayKey]);

  const rows = useMemo(() => data.slice().reverse(), [data]);
  const logged = data.filter((d) => d.done > 0 || d.feel != null || d.productive != null || d.energy != null || d.money != null || d.spent != null || d.distracted != null);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const avgPct = avg(data.map((d) => d.pct));
  const avgFeel = avg(data.filter((d) => d.feel != null).map((d) => d.feel));
  const avgProd = avg(data.filter((d) => d.productive != null).map((d) => d.productive));
  const avgEnergy = avg(data.filter((d) => d.energy != null).map((d) => d.energy));
  const made = data.reduce((a, d) => a + (d.money || 0), 0);
  const spentAll = data.reduce((a, d) => a + (d.spent || 0), 0);
  const avgDist = avg(data.filter((d) => d.distracted != null).map((d) => d.distracted));
  const best = data.reduce((b, d) => (d.pct > (b?.pct ?? -1) ? d : b), null);
  const perfectDays = data.filter((d) => d.total > 0 && d.done === d.total).length;
  let longest = 0;
  let run = 0;
  for (const d of data) {
    run = d.total > 0 && d.done === d.total ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const salahDone = data.reduce((n, d) => n + MAIN.filter((id) => state.salah?.[d.key]?.[id]).length, 0);
  const salahPct = data.length ? Math.round((salahDone / (data.length * MAIN.length)) * 100) : 0;
  const endBalance = data.length ? data[data.length - 1].balance : null;

  return (
    <section className="ad" id="all-days">
      <div className="ad-head">
        <h2>All days</h2>
        <div className="xc-tabs" role="tablist" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r.id} role="tab" aria-selected={range === r.id} className={range === r.id ? "on" : ""} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ad-sum">
        <div><span>Days shown</span><b>{data.length}</b></div>
        <div><span>Days with data</span><b>{logged.length}</b></div>
        <div><span>Average done</span><b>{Math.round(avgPct ?? 0)}%</b></div>
        <div><span>Average feel</span><b>{avgFeel == null ? "–" : avgFeel.toFixed(1)}</b></div>
        <div><span>Average productive</span><b>{avgProd == null ? "–" : avgProd.toFixed(1)}</b></div>
        <div><span>Average energy</span><b>{avgEnergy == null ? "–" : avgEnergy.toFixed(1)}</b></div>
        <div><span>Money made</span><b>{fmtMoney(Math.round(made * 100) / 100)}</b></div>
        <div><span>Money spent</span><b>{fmtMoney(Math.round(spentAll * 100) / 100)}</b></div>
        <div><span>Average distracted</span><b>{fmtMins(avgDist == null ? null : Math.round(avgDist))}</b></div>
        <div><span>Best day</span><b>{best && best.pct > 0 ? `${best.short} (${best.pct}%)` : "–"}</b></div>
        <div><span>100% habit days</span><b>{perfectDays}</b></div>
        <div><span>Longest 100% streak</span><b>{longest} day{longest === 1 ? "" : "s"}</b></div>
        {muslim && <div><span>Main salah prayed</span><b>{salahDone} ({salahPct}%)</b></div>}
        <div><span>Total money now</span><b>{fmtMoney(endBalance)}</b></div>
      </div>

      <div className="charts">
        <section className="card c-full">
          <h2>Habits done each day <small>% of all habits</small></h2>
          <WeekDotLine data={data} wide />
        </section>
        <section className="card c-full">
          <h2>Rising progress <small>% done per day</small></h2>
          <WeekRisingBars data={data} wide />
        </section>
        <section className="card c-full">
          <h2>Day stats <small>feel, productivity and money over time</small></h2>
          <WeekStatLine data={data} tabs={STAT_TABS} wide />
        </section>
      </div>

      <section className="card ad-table-card">
        <h2>Every day <small>Click a day to see everything about it</small></h2>
        <div className="ad-table" role="table">
          <div className="ad-tr ad-th" role="row">
            <span role="columnheader">Date</span>
            <span role="columnheader">Habits</span>
            <span role="columnheader">Feel</span>
            <span role="columnheader">Productive</span>
            <span role="columnheader">Energy</span>
            <span role="columnheader">Made</span>
            <span role="columnheader">Spent</span>
            <span role="columnheader">Distracted</span>
            <span role="columnheader">Total</span>
          </div>
          {rows.map((d) => {
            const open = openKey === d.key;
            return (
              <div key={d.key} className={`ad-item${open ? " open" : ""}`}>
                <button className="ad-tr" role="row" aria-expanded={open} onClick={() => setOpenKey(open ? null : d.key)}>
                  <span role="cell" className="ad-date">
                    {d.title}
                    {d.key === todayKey && <em>Today</em>}
                  </span>
                  <span role="cell" className="ad-done">
                    <i className="ad-mini"><i style={{ width: `${d.pct}%` }} /></i>
                    {d.done}/{d.total}
                  </span>
                  <span role="cell">{d.feel ?? "–"}</span>
                  <span role="cell">{d.productive ?? "–"}</span>
                  <span role="cell">{d.energy ?? "–"}</span>
                  <span role="cell">{fmtMoney(d.money)}</span>
                  <span role="cell">{fmtMoney(d.spent)}</span>
                  <span role="cell">{fmtMins(d.distracted)}</span>
                  <span role="cell" className="ad-dim">{fmtMoney(d.balance)}</span>
                </button>
                {open && <DayDetail state={state} d={d} onEdit={onEdit} muslim={muslim} />}
              </div>
            );
          })}
        </div>
      </section>
    </section>
  );
}
