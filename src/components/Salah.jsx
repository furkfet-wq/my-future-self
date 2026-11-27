import PlacePicker from "./PlacePicker.jsx";
import { useEffect, useRef, useState } from "react";
import HabitGrid from "./HabitGrid.jsx";
import { dateKey } from "../lib/dates.js";
import {
  SALAH,
  MAIN,
  prayerName,
  prayerStatus,
  rowNotes,
  fmtLeft,
  fmtHMS,
  ALARM_BEFORE_MS,
} from "../lib/prayer.js";
import { alarmStart, alarmStop } from "../lib/sound.js";

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const TIMES = [
  ["fajr", "Fajr"],
  ["sunrise", "Sunrise"],
  ["dhuhr", "Dhuhr"],
  ["asr", "Asr"],
  ["maghrib", "Maghrib"],
  ["isha", "Isha"],
];

const DISMISS_KEY = "mfs-alarm-dismissed";
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/* Prayer times: today's times and live countdowns (hours, minutes, seconds). */
export function PrayerTimesCard({ state, prayer, alarmOn = true, place = null, onPlace }) {
  const [picking, setPicking] = useState(false);
  const cityName = prayer.city || (place ? place.name : "Coventry");
  const now = useNow();
  const todayKey = dateKey(now);
  const days = prayer.days;
  const today = days?.[todayKey];
  const status = days ? prayerStatus(days, now) : null;
  const cur = status?.current;
  const nxt = status?.next;
  const curDone = cur && state.salah?.[cur.key]?.[cur.id];

  // next time the prayer alarm will ring: 15 min 36 s before the end of the first unticked daily prayer
  let dismissed = {};
  try {
    dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) || "{}");
  } catch {
    /* ignore */
  }
  const nextAlarm = status?.all.find(
    (p) =>
      MAIN.includes(p.id) &&
      now < p.end &&
      !state.salah?.[p.key]?.[p.id] &&
      !dismissed[`${p.key}-${p.id}`]
  );
  const ringAt = nextAlarm ? new Date(nextAlarm.end.getTime() - ALARM_BEFORE_MS) : null;

  return (
    <section className="card" id="prayer-times">
      <h2>
        Prayer times
        <small>
          Times for {cityName}
          {place?.km > 30 ? ` (nearest city, ${place.km} km away)` : ""}, from namazvakitleri.com.tr
        </small>
      </h2>
      {onPlace && (
        <button className="pp-change" onClick={() => setPicking(true)}>
          Change
        </button>
      )}
      {picking && (
        <PlacePicker
          place={place}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setPicking(false);
            onPlace(p);
          }}
        />
      )}

      {!days && !prayer.error && <p className="sl-wait">Loading today's prayer times…</p>}
      {!days && prayer.error && (
        <p className="sl-wait">Could not load prayer times right now. Check your internet; they will load when you are back online.</p>
      )}

      {today && (
        <div className="pt">
          <div className="sl-times">
            {TIMES.map(([id, label]) => (
              <div key={id} className={`sl-time${cur?.id === id && cur.key === todayKey ? " now" : ""}${nxt?.id === id && nxt.key === todayKey ? " next" : ""}`}>
                <span>{label}</span>
                <b>{today[id]}</b>
              </div>
            ))}
          </div>

          <div className="pt-counts">
            <div className="pt-count">
              {cur ? (
                <>
                  <span>
                    {prayerName(cur.id)} ends in{" "}
                    {curDone ? <em>prayed</em> : <em className="todo">not ticked yet</em>}
                  </span>
                  <b>{fmtHMS(cur.end - now)}</b>
                  <small>ends at {hhmm(cur.end)}</small>
                </>
              ) : (
                <>
                  <span>No daily prayer time right now</span>
                  <b>–</b>
                </>
              )}
            </div>
            <div className={`pt-count pt-alarm${ringAt && now >= ringAt && alarmOn ? " ringing" : ""}`}>
              {!alarmOn ? (
                <>
                  <span>Alarm</span>
                  <b>Off</b>
                  <small>switch it on in Settings</small>
                </>
              ) : !ringAt ? (
                <>
                  <span>Alarm</span>
                  <b>–</b>
                  <small>all daily prayers ticked</small>
                </>
              ) : now >= ringAt ? (
                <>
                  <span>Alarm for {prayerName(nextAlarm.id)}</span>
                  <b>Ringing</b>
                  <small>tick {prayerName(nextAlarm.id)} to stop it</small>
                </>
              ) : (
                <>
                  <span>Alarm for {prayerName(nextAlarm.id)} in</span>
                  <b>{fmtHMS(ringAt - now)}</b>
                  <small>rings at {hhmm(ringAt)} unless {prayerName(nextAlarm.id)} is ticked</small>
                </>
              )}
            </div>
          </div>
          {prayer.error && <p className="sl-stale">Showing saved times: live update failed.</p>}
        </div>
      )}
    </section>
  );
}

/* Salah table: same grid as habits, fixed rows (no add / delete). */
export function SalahCard({ state, prayer, year, month0, selectedKey, ready, onSelect, onToggle }) {
  const now = useNow(30000);
  const todayKey = dateKey(now);
  const days = prayer.days;
  const notes = rowNotes(days, todayKey);
  const cur = days ? prayerStatus(days, now).current : null;

  return (
    <section className="card card-grid" id="salah">
      <h2>
        Salah
        <small>Tick each prayer when you pray it</small>
      </h2>
      <HabitGrid
        state={state}
        rows={SALAH}
        checks={state.salah || {}}
        editable={false}
        compact
        label="Salah"
        rowInfo={(r) => ({ optional: r.optional, note: r.optional ? `optional · ${notes[r.id] || ""}` : notes[r.id], now: cur?.id === r.id })}
        year={year}
        month0={month0}
        selectedKey={selectedKey}
        ready={ready}
        actions={{ toggle: onToggle }}
        onSelect={onSelect}
      />
    </section>
  );
}

/* Alarm: 15 minutes 36 seconds before one of the five daily prayers ends, if it is not ticked. */

export function PrayerAlarm({ state, prayer, onPrayed, enabled = true, test = 0, onTestEnd }) {
  const now = useNow();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(DISMISS_KEY) || "{}");
    } catch {
      return {};
    }
  });
  const active = useRef(null);

  let target = null;
  if (enabled && prayer.days) {
    const { all } = prayerStatus(prayer.days, now);
    target =
      all.find(
        (p) =>
          MAIN.includes(p.id) &&
          now >= p.end - ALARM_BEFORE_MS &&
          now < p.end &&
          !state.salah?.[p.key]?.[p.id] &&
          !dismissed[`${p.key}-${p.id}`]
      ) || null;
  }
  // test from Settings: rings straight away, stops from the banner
  if (test) target = { test: true, key: "test", id: "test", end: new Date(test + ALARM_BEFORE_MS) };
  const targetId = target ? (target.test ? `test-${test}` : `${target.key}-${target.id}`) : null;

  useEffect(() => {
    if (targetId && active.current !== targetId) {
      active.current = targetId;
      alarmStart();
      window.dispatchEvent(new CustomEvent("mfs:alarm", { detail: true }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (!targetId && active.current) {
      active.current = null;
      alarmStop();
      window.dispatchEvent(new CustomEvent("mfs:alarm", { detail: false }));
    }
  }, [targetId]);

  useEffect(
    () => () => {
      alarmStop();
      window.dispatchEvent(new CustomEvent("mfs:alarm", { detail: false }));
    },
    []
  );

  if (!target) return null;
  if (target.test) {
    return (
      <>
        <div className="alarm-veil" aria-hidden="true" />
        <div className="alarm" role="alert">
          <div>
            <b>Alarm test</b>
            <span>This is how the prayer alarm looks and sounds.</span>
          </div>
          <button className="alarm-stop" onClick={onTestEnd}>
            Stop test
          </button>
        </div>
      </>
    );
  }
  const name = prayerName(target.id);
  const stop = () => {
    // keep only recent entries (keys start with the date) so this never grows forever
    const cutoff = dateKey(new Date(Date.now() - 2 * 86400000));
    const next = Object.fromEntries(Object.entries({ ...dismissed, [targetId]: true }).filter(([k]) => k.slice(0, 10) >= cutoff));
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <div className="alarm-veil" aria-hidden="true" />
      <div className="alarm" role="alert">
        <div>
          <b>
            {name} ends in {fmtHMS(target.end - now)}
          </b>
          <span>You have not ticked {name} yet.</span>
        </div>
        <button onClick={() => onPrayed(target.key, target.id)}>I prayed {name}</button>
        <button className="alarm-stop" onClick={stop}>
          Stop alarm
        </button>
      </div>
    </>
  );
}
