import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useStore } from "./lib/store.js";
import { dateKey } from "./lib/dates.js";
import { computeStats, totalBalance } from "./lib/stats.js";
import Loader from "./components/Loader.jsx";
import Header from "./components/Header.jsx";
import HabitGrid from "./components/HabitGrid.jsx";
import DailyActions from "./components/DailyActions.jsx";
import {
  DailyProgressBars,
  WeeklyProgressBars,
  DonutStat,
  HabitPerformanceBars,
  MoodLines,
  MoneyChart,
} from "./components/Charts.jsx";
import "./components/charts.css";
import Hero from "./components/Hero.jsx";
import TodayPanel from "./components/TodayPanel.jsx";
import AllDays from "./components/AllDays.jsx";
import { WeekDotLine, WeekRisingBars, WeekStatLine } from "./components/ExtraCharts.jsx";
import { sfx, isMuted, setMuted, onMuteChange } from "./lib/sound.js";
import { loadPrayerTimes, MAIN, SALAH, prayerName } from "./lib/prayer.js";
import { SalahCard, PrayerAlarm, PrayerTimesCard } from "./components/Salah.jsx";
import { SettingsPanel, GearButton, loadSettings, saveSettings } from "./components/Settings.jsx";
import Lock from "./components/Lock.jsx";
import { hasPin } from "./lib/lock.js";
import { weekData, shiftKey, parseKey, dayStats, streak as perfectStreak, salahStreak } from "./lib/week.js";

// The angry cube hits the screen: a soft glow where it hit and a smooth, fading page shake.
function ScreenHit() {
  const [hit, setHit] = useState(null);
  useEffect(() => {
    const on = (e) => setHit({ id: Date.now(), x: e.detail?.x ?? innerWidth / 2, y: e.detail?.y ?? innerHeight / 3 });
    window.addEventListener("mfs:screen-hit", on);
    return () => window.removeEventListener("mfs:screen-hit", on);
  }, []);
  return hit ? <Impact key={hit.id} x={hit.x} y={hit.y} onDone={() => setHit(null)} /> : null;
}

function Impact({ x, y, onDone }) {
  const ref = useRef(null);
  useGSAP(
    () => {
      gsap
        .timeline({ onComplete: onDone })
        .fromTo(".im-glow", { opacity: 0.9, scale: 0.4 }, { opacity: 0, scale: 1.6, duration: 0.9, ease: "power2.out" });
      // damped sine shake: strong at first, smoothly settling
      const app = document.querySelector("main.app");
      if (app && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const p = { t: 0 };
        gsap.to(p, {
          t: 1,
          duration: 0.9,
          ease: "none",
          onUpdate: () => {
            const k = Math.pow(1 - p.t, 2.2);
            gsap.set(app, { x: Math.sin(p.t * 34) * 14 * k, y: Math.cos(p.t * 27) * 7 * k });
          },
          onComplete: () => gsap.set(app, { clearProps: "transform" }),
        });
      }
    },
    { scope: ref }
  );
  return (
    <div className="im" ref={ref} aria-hidden="true">
      <div className="im-glow" style={{ left: x, top: y }} />
    </div>
  );
}

function SoundToggle() {
  const [off, setOff] = useState(isMuted());
  useEffect(() => onMuteChange(setOff), []);
  return (
    <button className="snd" onClick={() => setMuted(!off)} aria-pressed={!off} data-sfx="own">
      {off ? "Sound off" : "Sound on"}
    </button>
  );
}

// Whole page turns white for a second, then fades back.
function Flash({ onDone }) {
  const ref = useRef(null);
  useGSAP(
    () => {
      sfx.flash();
      gsap
        .timeline({ onComplete: onDone })
        .to(ref.current, { opacity: 1, duration: 0.18, ease: "power2.out" })
        .to(ref.current, { opacity: 0, duration: 0.8, ease: "power2.inOut" }, "+=1");
    },
    { scope: ref }
  );
  return <div className="flash" ref={ref} aria-hidden="true" />;
}

function Card({ id, title, note, className = "", children }) {
  return (
    <section id={id} className={`card ${className}`}>
      <h2>
        {title}
        {note && <small>{note}</small>}
      </h2>
      {children}
    </section>
  );
}

export default function App() {
  const [state, actions] = useStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [selectedKey, setSelectedKey] = useState(dateKey(now));
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  // PIN lock: first open = choose a PIN, later opens = enter it; nothing else shows until then
  const [locked, setLocked] = useState(true);
  const [lockMode] = useState(() => (hasPin() ? "unlock" : "setup"));
  const [changingPin, setChangingPin] = useState(false);

  const [flash, setFlash] = useState(false);
  // one counter per badge, so only the streak that was just completed pops
  const [pulse, setPulse] = useState({ h: 0, s: 0 });
  const celebrateKind = useRef("h");
  const celebrating = useRef(false);
  const [heldStreak, setHeldStreak] = useState(null);

  // Re-render just after midnight so today's highlight, streaks and week charts move to the new day.
  const [, setDayTick] = useState(0);
  useEffect(() => {
    let id;
    const arm = () => {
      const n = new Date();
      const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 2);
      id = setTimeout(() => {
        setDayTick((t) => t + 1);
        arm();
      }, next - n);
    };
    arm();
    return () => clearTimeout(id);
  }, []);

  // Settings (gear in the top-right corner)
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alarmTest, setAlarmTest] = useState(0);
  const changeSettings = (s) => {
    setSettings(s);
    saveSettings(s);
  };

  // Live prayer times (refreshed every 30 minutes, saved copy used when offline)
  const [prayer, setPrayer] = useState({ days: null, error: null });
  useEffect(() => {
    let live = true;
    const load = () =>
      loadPrayerTimes()
        .then((r) => live && setPrayer({ days: r.days, error: r.error || null }))
        .catch((e) => live && setPrayer((p) => ({ ...p, error: e.message })));
    load();
    const id = setInterval(load, 30 * 60 * 1000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  const stats = useMemo(() => computeStats(state, year, month0), [state, year, month0]);
  // Salah charts reuse the same month stats, with the prayers as the "habits" and salah ticks as the checks.
  const salahMain = useMemo(
    () => computeStats({ habits: MAIN.map((id) => ({ id, name: prayerName(id) })), checks: state.salah || {}, logs: {}, startBalance: 0 }, year, month0),
    [state.salah, year, month0]
  );
  const salahAll = useMemo(
    () => computeStats({ habits: SALAH.map((p) => ({ id: p.id, name: p.optional ? `${p.name} (optional)` : p.name })), checks: state.salah || {}, logs: {}, startBalance: 0 }, year, month0),
    [state.salah, year, month0]
  );
  const todayKey = dateKey(now);
  const streakDays = useMemo(() => perfectStreak(state, todayKey), [state, todayKey]);
  const salahDays = useMemo(() => salahStreak(state, todayKey), [state, todayKey]);

  // Today goes to 100%: back to the cube, layers spin faster and faster, page flashes white, streak pops.
  function celebrate(kind) {
    if (celebrating.current) return;
    celebrating.current = true;
    celebrateKind.current = kind;
    setHeldStreak({ h: streakDays, s: salahDays }); // show the old numbers until the flash is over
    sfx.complete();
    window.scrollTo({ top: 0, behavior: "smooth" });
    let safety = null;
    const onDone = () => {
      clearTimeout(safety);
      window.removeEventListener("mfs:frenzy-done", onDone);
      setFlash(true);
    };
    window.addEventListener("mfs:frenzy-done", onDone);
    // if the cube cannot answer (no 3D support), carry on anyway so celebrations never get stuck
    safety = setTimeout(onDone, 9000);
    setTimeout(() => {
      sfx.riser(5.2);
      window.dispatchEvent(new Event("mfs:celebrate"));
    }, 900);
  }

  function toggleAndCheck(key, id) {
    const wasDone = !!state.checks[key]?.[id];
    actions.toggle(key, id);
    if (!wasDone && key === dateKey(new Date())) {
      const s = dayStats(state, key);
      if (s.total > 0 && s.done + 1 === s.total) celebrate("h");
    }
  }
  const gridActions = { ...actions, toggle: toggleAndCheck };

  // Same celebration when the last of today's five main prayers gets ticked.
  function toggleSalahAndCheck(key, id) {
    const wasDone = !!state.salah?.[key]?.[id];
    actions.toggleSalah(key, id);
    if (!wasDone && MAIN.includes(id) && key === dateKey(new Date())) {
      const prayed = MAIN.filter((p) => p === id || state.salah?.[key]?.[p]).length;
      if (prayed === MAIN.length) celebrate("s");
    }
  }
  const balance = useMemo(() => totalBalance(state), [state]);

  function shiftMonth(delta) {
    const d = new Date(year, month0 + delta, 1);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
    setSelectedKey(dateKey(d));
  }
  function goToDay(key, scroll = false) {
    const d = parseKey(key);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
    setSelectedKey(key);
    if (scroll) {
      requestAnimationFrame(() =>
        document.getElementById("habits")?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    }
  }
  const goToday = () => goToDay(dateKey(new Date()));

  // Keep the selected day inside the viewed month.
  const inMonth = selectedKey.startsWith(`${year}-${String(month0 + 1).padStart(2, "0")}-`);
  const dayKey = inMonth ? selectedKey : dateKey(new Date(year, month0, 1));
  const week = useMemo(() => weekData(state, dayKey), [state, dayKey, todayKey]); // todayKey: future days change at midnight
  const weekLabel = `${week[0].date} ${parseKey(week[0].key).toLocaleDateString("en-GB", { month: "short" })} to ${week[6].date} ${parseKey(week[6].key).toLocaleDateString("en-GB", { month: "short" })}`;

  return (
    <>
      {flash && (
        <Flash
          onDone={() => {
            setFlash(false);
            setHeldStreak(null);
            setPulse((p) => ({ ...p, [celebrateKind.current]: p[celebrateKind.current] + 1 }));
            sfx.pop();
            celebrating.current = false;
          }}
        />
      )}
      {ready && <GearButton onClick={() => setSettingsOpen(true)} />}
      <SoundToggle />
      <ScreenHit />
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={changeSettings}
          onClose={() => setSettingsOpen(false)}
          onChangePin={() => {
            setSettingsOpen(false);
            setChangingPin(true);
          }}
          onTestAlarm={() => {
            setSettingsOpen(false);
            setAlarmTest(Date.now());
          }}
        />
      )}
      {ready && (
        <PrayerAlarm
          state={state}
          prayer={prayer}
          enabled={settings.alarm}
          test={alarmTest}
          onTestEnd={() => setAlarmTest(0)}
          onPrayed={(key, id) => {
            if (!state.salah?.[key]?.[id]) {
              sfx.done();
              toggleSalahAndCheck(key, id);
            }
          }}
        />
      )}
      {locked && <Lock mode={lockMode} onDone={() => setLocked(false)} />}
      {changingPin && <Lock mode="change" onDone={() => setChangingPin(false)} onCancel={() => setChangingPin(false)} />}
      {!locked && loading && <Loader onLift={() => setReady(true)} onDone={() => setLoading(false)} />}
      {ready && (
      <main className="app">
        <Hero streak={heldStreak?.h ?? streakDays} salahStreak={heldStreak?.s ?? salahDays} pulse={pulse.h} salahPulse={pulse.s} showVerse={settings.verse} showQuote={settings.quote} />

        <TodayPanel state={state} balance={balance} onOpenToday={() => goToDay(dateKey(new Date()), true)} />

        <Header
          year={year}
          month0={month0}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
          onToday={goToday}
          balance={balance}
          startBalance={state.startBalance}
          onStartBalance={actions.setStartBalance}
        />

        <Card id="habits" title="Habits" note="Click a box: black means done, white means not done. Past days can be edited too." className="card-grid">
          <HabitGrid
            state={state}
            year={year}
            month0={month0}
            selectedKey={dayKey}
            ready={ready}
            actions={gridActions}
            onSelect={setSelectedKey}
          />
        </Card>

        <Card title="Daily actions" note="Pick a day in the grid above to log it">
          <DailyActions
            dayKey={dayKey}
            log={state.logs[dayKey] || {}}
            onChange={(patch) => actions.setLog(dayKey, patch)}
          />
        </Card>

        {settings.prayerTimes && <PrayerTimesCard state={state} prayer={prayer} alarmOn={settings.alarm} />}

        {settings.salahTable && <SalahCard
          state={state}
          prayer={prayer}
          year={year}
          month0={month0}
          selectedKey={dayKey}
          ready={ready}
          onSelect={setSelectedKey}
          onToggle={toggleSalahAndCheck}
        />}

        <div className="wk-head">
          <h2>This week</h2>
          <div className="wk-nav">
            <button onClick={() => goToDay(shiftKey(dayKey, -7))} aria-label="Previous week">‹</button>
            <span>{weekLabel}</span>
            <button onClick={() => goToDay(shiftKey(dayKey, 7))} aria-label="Next week">›</button>
          </div>
        </div>
        <div className="charts">
          <Card title="Habits done each day" note="% of habits, Monday to Sunday" className="c-half">
            <WeekDotLine data={week} />
          </Card>
          <Card title="Rising progress" note="% done per day" className="c-half">
            <WeekRisingBars data={week} />
          </Card>
          <Card title="Day stats" note="productivity, feel and money this week" className="c-full">
            <WeekStatLine data={week} wide />
          </Card>
        </div>

        <div className="wk-head">
          <h2>This month</h2>
        </div>
        <div className="charts">
          <Card title="Overall" className="c-donut">
            <DonutStat overall={stats.overall} />
          </Card>
          <Card title="Daily progress" note="% of habits done each day" className="c-daily">
            <DailyProgressBars data={stats.days} />
          </Card>
          <Card title="Weekly progress" className="c-weekly">
            <WeeklyProgressBars data={stats.weeks} />
          </Card>
          <Card title="Habit performance" note="% of the month done per habit" className="c-habits">
            <HabitPerformanceBars data={stats.habits} />
          </Card>
          <Card title="Feel and productivity" note="0 to 10" className="c-mood">
            <MoodLines data={stats.mood} />
          </Card>
          <Card title="Money" note="£ made per day and running total" className="c-money">
            <MoneyChart data={stats.money.daily} balance={balance} monthIncome={stats.money.monthIncome} />
          </Card>
        </div>

        <div className="wk-head">
          <h2>Salah this month</h2>
        </div>
        <div className="charts">
          <Card title="Salah overall" note="5 daily prayers" className="c-donut">
            <DonutStat overall={salahMain.overall} />
          </Card>
          <Card title="Salah each day" note="% of the 5 daily prayers prayed" className="c-daily">
            <DailyProgressBars data={salahMain.days} />
          </Card>
          <Card title="Salah each week" note="% of the 5 daily prayers" className="c-weekly">
            <WeeklyProgressBars data={salahMain.weeks} />
          </Card>
          <Card title="Prayer by prayer" note="% of the month each prayer was prayed" className="c-habits">
            <HabitPerformanceBars data={salahAll.habits} />
          </Card>
        </div>

        <AllDays state={state} onEdit={(key) => goToDay(key, true)} />
      </main>
      )}
    </>
  );
}
