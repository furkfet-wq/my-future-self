import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { weeksOfMonth, dateKey, DAY_SHORT } from "../lib/dates.js";
import { sfx } from "../lib/sound.js";

// Used for habits (editable) and for salah (fixed rows, rowInfo adds times / "optional").
export default function HabitGrid({
  state, year, month0, selectedKey, ready, actions, onSelect,
  rows, checks: checksProp, editable = true, label = "Habits", rowInfo, compact = false,
}) {
  const list = rows || state.habits;
  const checks = checksProp || state.checks;
  const root = useRef(null);
  const [newName, setNewName] = useState("");
  const [confirmId, setConfirmId] = useState(null);

  // Full Mon..Sun weeks: slots before the 1st / after the last day show the real days of the
  // previous / next month (dimmed, still clickable), so every week has 7 boxes.
  const weeks = weeksOfMonth(year, month0).map((week, w, all) =>
    week.map((d, i) => {
      if (d) return d;
      if (w === 0) {
        const first = week.find(Boolean);
        const fi = week.indexOf(first);
        return new Date(first.getFullYear(), first.getMonth(), first.getDate() - (fi - i));
      }
      const lastWeek = all[all.length - 1];
      const last = [...lastWeek].reverse().find(Boolean);
      const li = lastWeek.indexOf(last);
      return new Date(last.getFullYear(), last.getMonth(), last.getDate() + (i - li));
    })
  );
  const isOut = (d) => d.getMonth() !== month0;
  const todayKey = dateKey(new Date());
  const cols = weeks.length * 7;

  // Entrance wave on first show and when the month changes.
  const { contextSafe } = useGSAP(
    () => {
      if (!ready) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".hg-name", { opacity: 0, x: -16, duration: 0.5, ease: "power3.out", stagger: 0.05, clearProps: "all" });
        gsap.from(".hg-box", {
          scale: 0.4,
          opacity: 0,
          duration: 0.35,
          ease: "back.out(2.2)",
          stagger: { amount: 0.7, from: "start" },
          clearProps: "transform,opacity",
        });
      });

      // Start the grid at today's column (or the selected day) so you begin from where you are.
      const sc = root.current;
      const target = sc.querySelector(".hg-day.today") || sc.querySelector(".hg-day.sel");
      if (target && sc.scrollWidth > sc.clientWidth) {
        const left =
          target.getBoundingClientRect().left - sc.getBoundingClientRect().left + sc.scrollLeft - sc.clientWidth * 0.6;
        gsap.to(sc, { scrollLeft: Math.max(0, left), duration: 1.1, ease: "power3.inOut", delay: 0.3 });
      }
    },
    { scope: root, dependencies: [ready, year, month0] }
  );

  const pop = contextSafe((e) => {
    gsap.fromTo(
      e.currentTarget,
      { scale: 0.55 },
      { scale: 1, duration: 0.45, ease: "back.out(3)", overwrite: true, clearProps: "transform" }
    );
  });

  function toggle(e, key, id) {
    if (checks[key]?.[id]) sfx.undone();
    else sfx.done();
    actions.toggle(key, id);
    // only move the selected day for days inside the month on screen
    if (key.startsWith(`${year}-${String(month0 + 1).padStart(2, "0")}-`)) onSelect(key);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) pop(e);
  }

  function submitHabit(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    actions.addHabit(newName);
    sfx.add();
    setNewName("");
    // slide the new row in after React renders it
    requestAnimationFrame(contextSafe(() => {
      const rows = root.current?.querySelectorAll(".hg-name");
      const last = rows?.[rows.length - 1];
      if (last && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.from(last, { opacity: 0, x: -20, duration: 0.45, ease: "power3.out", clearProps: "all" });
        gsap.from(root.current.querySelectorAll(`[data-row="${list.length}"] .hg-box`), {
          scale: 0.4,
          opacity: 0,
          duration: 0.3,
          ease: "back.out(2)",
          stagger: 0.012,
          clearProps: "transform,opacity",
        });
      }
    }));
  }

  function remove(id) {
    if (confirmId !== id) {
      setConfirmId(id);
      setTimeout(() => setConfirmId((c) => (c === id ? null : c)), 2500);
      return;
    }
    setConfirmId(null);
    sfx.undone();
    actions.deleteHabit(id);
  }

  return (
    <>
    <div className={`hg-scroll${compact ? " hg-compact" : ""}`} ref={root}>
      <div className="hg" style={{ gridTemplateColumns: compact ? `minmax(168px, 240px) repeat(${cols}, 28px)` : `minmax(180px, 250px) repeat(${cols}, 34px)` }}>
        {/* header row 1: week labels */}
        <div className="hg-corner" />
        {weeks.map((_, w) => (
          <div className="hg-week" key={w} style={{ gridColumn: `span 7` }}>
            Week {w + 1}
          </div>
        ))}

        {/* header row 2: day names + numbers */}
        <div className="hg-corner hg-corner-label">{label}</div>
        {weeks.map((week, w) =>
          week.map((d, i) => {
            const key = d ? dateKey(d) : null;
            return (
              <button
                key={`${w}-${i}`}
                className={`hg-day${i === 0 ? " wk-start" : ""}${isOut(d) ? " out" : ""}${key === selectedKey ? " sel" : ""}${key === todayKey ? " today" : ""}`}
                disabled={!d}
                onClick={() => key && onSelect(key)}
                aria-label={d ? d.toDateString() : undefined}
              >
                <span>{DAY_SHORT[i]}</span>
                <b>{d ? d.getDate() : ""}</b>
              </button>
            );
          })
        )}

        {/* habit rows */}
        {list.map((h, r) => (
          <HabitRow
            key={h.id}
            r={r}
            h={h}
            info={rowInfo?.(h)}
            editable={editable}
            weeks={weeks}
            month0={month0}
            checks={checks}
            selectedKey={selectedKey}
            confirming={confirmId === h.id}
            onToggle={toggle}
            onRemove={() => remove(h.id)}
          />
        ))}
      </div>
    </div>

      {editable && list.length === 0 && <p className="hg-empty">No habits yet. Add your first one below.</p>}

      {editable && (
      <form className="hg-add" onSubmit={submitHabit}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a habit, e.g. Cold shower"
          maxLength={60}
          aria-label="New habit name"
        />
        <button type="submit" disabled={!newName.trim()}>
          Add habit
        </button>
      </form>
      )}
    </>
  );
}

function HabitRow({ r, h, info, editable, weeks, month0, checks, selectedKey, confirming, onToggle, onRemove }) {
  return (
    <>
      <div className={`hg-name${info?.optional ? " opt" : ""}${info?.now ? " now" : ""}`} data-row={r}>
        <span title={h.name}>{h.name}</span>
        {info?.note && <em className="hg-note">{info.note}</em>}
        {editable && (
          <button
            className={`hg-del${confirming ? " confirm" : ""}`}
            onClick={onRemove}
            aria-label={confirming ? `Confirm delete ${h.name}` : `Delete ${h.name}`}
          >
            {confirming ? "Delete?" : "×"}
          </button>
        )}
      </div>
      {weeks.map((week, w) =>
        week.map((d, i) => {
          const wk = i === 0 ? " wk-start" : "";
          if (!d) return <div className={`hg-cell off${wk}`} key={`${w}-${i}`} data-row={r}><span className="hg-box" /></div>;
          const key = dateKey(d);
          const done = !!checks[key]?.[h.id];
          return (
            <div className={`hg-cell${wk}${d.getMonth() !== month0 ? " out" : ""}${key === selectedKey ? " sel" : ""}`} key={`${w}-${i}`} data-row={r}>
              <button
                className={`hg-box${done ? " done" : ""}`}
                data-sfx="own"
                onClick={(e) => onToggle(e, key, h.id)}
                role="checkbox"
                aria-checked={done}
                aria-label={`${h.name} on ${d.toDateString()}`}
              >
                {done && <svg className="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
              </button>
            </div>
          );
        })
      )}
    </>
  );
}
