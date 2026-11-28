import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { weeksOfMonth, dateKey, DAY_SHORT } from "../lib/dates.js";
import { sfx } from "../lib/sound.js";
import { habitsFor } from "../lib/habits.js";

// Used for habits (editable) and for salah (fixed rows, rowInfo adds times / "optional").
export default function HabitGrid({
  state, year, month0, selectedKey, ready, actions, onSelect,
  rows, checks: checksProp, editable = true, label = "Habits", rowInfo, compact = false,
}) {
  const monthKey = `${year}-${String(month0 + 1).padStart(2, "0")}`;
  const list = rows || habitsFor(state.habits, monthKey); // a month shows only habits added in or before it
  const checks = checksProp || state.checks;
  const root = useRef(null);
  const [newName, setNewName] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [dropAt, setDropAt] = useState(null); // row index the dragged habit will land on

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
    actions.addHabit(newName, monthKey); // new habit: from this month on, never in older months
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

  // Press on a habit name: a click (no movement) renames it, holding and moving drags the row.
  function pressName(e, r, id) {
    if (!editable || e.button !== 0 || e.target.closest("button, input")) return;
    const sc = root.current;
    const startY = e.clientY;
    const rowEls = sc.querySelectorAll(`[data-row="${r}"]`);
    let dragging = false;
    let target = r;
    const holdTimer = setTimeout(() => begin(), 220);
    function begin() {
      if (dragging) return;
      dragging = true;
      sc.classList.add("hg-dragging");
      rowEls.forEach((el) => el.classList.add("hg-lift"));
      sfx.add();
    }
    function move(ev) {
      const dy = ev.clientY - startY;
      if (!dragging && Math.abs(dy) > 5) begin();
      if (!dragging) return;
      ev.preventDefault();
      rowEls.forEach((el) => (el.style.transform = `translateY(${dy}px)`));
      const names = [...sc.querySelectorAll(".hg-name")];
      target = r;
      names.forEach((n, i) => {
        const b = n.getBoundingClientRect();
        if (i < r && ev.clientY < b.top + b.height / 2) target = Math.min(target, i);
        if (i > r && ev.clientY > b.top + b.height / 2) target = Math.max(target, i);
      });
      setDropAt(target === r ? null : target);
    }
    function up() {
      clearTimeout(holdTimer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      rowEls.forEach((el) => {
        el.style.transform = "";
        el.classList.remove("hg-lift");
      });
      sc.classList.remove("hg-dragging");
      setDropAt(null);
      if (!dragging) return setEditId(id);
      if (target !== r) {
        actions.moveHabit(state.habits.indexOf(list[r]), state.habits.indexOf(list[target])); // positions in the full list
        sfx.done();
      }
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
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
            editing={editId === h.id}
            dropMark={dropAt === r ? "drop" : ""}
            onPress={(e) => pressName(e, r, h.id)}
            onRename={(name) => {
              if (name.trim() && name.trim() !== h.name) actions.renameHabit(h.id, name);
              setEditId(null);
            }}
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

function HabitRow({ r, h, info, editable, weeks, month0, checks, selectedKey, confirming, editing, dropMark, onPress, onRename, onToggle, onRemove }) {
  return (
    <>
      <div
        className={`hg-name${info?.optional ? " opt" : ""}${info?.now ? " now" : ""}${editable ? " movable" : ""}${dropMark ? " " + dropMark : ""}`}
        data-row={r}
        onPointerDown={editable && !editing ? onPress : undefined}
      >
        {editing ? (
          <input
            className="hg-rename"
            defaultValue={h.name}
            maxLength={60}
            autoFocus
            aria-label={`Rename ${h.name}`}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => onRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.currentTarget.value = h.name;
                e.currentTarget.blur();
              }
            }}
          />
        ) : (
          <span title={editable ? `${h.name} (click to rename, hold and drag to move)` : h.name}>{h.name}</span>
        )}
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
