import { useEffect, useRef, useState, lazy, Suspense } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
// the 3D cube (three.js) is the biggest part of the app, so it loads as its own file
const cubeModule = import("./RubikHero.jsx");
const RubikHero = lazy(() => cubeModule);
import { loadDailyVerse, newVerse, nextQuote } from "../lib/inspire.js";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

function DailyVerse() {
  const [verse, setVerse] = useState(null);
  const [error, setError] = useState(null);
  const [day, setDay] = useState(todayStr);
  const box = useRef(null);
  const { contextSafe } = useGSAP({ scope: box });

  const another = contextSafe(() => {
    const run = () =>
      newVerse()
        .then((v) => {
          setVerse(v);
          setError(null);
        })
        .catch((e) => setError(e.message));
    if (verse && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.to(".hx-body", { opacity: 0, y: -10, duration: 0.35, ease: "power2.in", onComplete: run });
    } else run();
  });

  useGSAP(
    () => {
      if (!verse) return;
      gsap.fromTo(".hx-body", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" });
    },
    { scope: box, dependencies: [verse?.number] }
  );

  // a new verse when the date changes, even if the app stays open past midnight
  useEffect(() => {
    const id = setInterval(() => setDay(todayStr()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let live = true;
    setError(null);
    loadDailyVerse(new Date())
      .then((v) => live && setVerse(v))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [day]);

  return (
    <aside className="hx hx-verse" ref={box} aria-label="Verse of the day">
      <p className="hx-label">Verse of the day</p>
      {!verse && !error && <p className="hx-wait">Loading today's verse…</p>}
      {error && <p className="hx-wait">Could not load today's verse. Check your internet connection and reload.</p>}
      {verse && (
        <div className="hx-body">
          <p className="hx-ar" lang="ar" dir="rtl">
            {verse.arabic}
          </p>
          <p className="hx-en">“{verse.english}”</p>
          <p className="hx-src">
            <a href={`https://quran.com/${verse.surahNumber}/${verse.ayah}`} target="_blank" rel="noreferrer">
              Surah {verse.surahEnglish} ({verse.surahMeaning}) {verse.surahNumber}:{verse.ayah}
            </a>
          </p>
        </div>
      )}
      <button className="hx-new" onClick={another}>
        New verse
      </button>
    </aside>
  );
}

function Motivation() {
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const box = useRef(null);
  const { contextSafe } = useGSAP({ scope: box });

  const load = contextSafe(() => {
    const swap = (q) => {
      setQuote(q);
      setError(null);
    };
    const run = () =>
      nextQuote()
        .then(swap)
        .catch((e) => setError(e.message));
    if (quote && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.to(".hx-body", { opacity: 0, y: -10, duration: 0.35, ease: "power2.in", onComplete: run });
    } else run();
  });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useGSAP(
    () => {
      if (!quote) return;
      gsap.fromTo(".hx-body", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" });
    },
    { scope: box, dependencies: [quote?.id] }
  );

  return (
    <aside className="hx hx-quote" ref={box} aria-label="Motivation">
      <p className="hx-label">Motivation</p>
      {!quote && !error && <p className="hx-wait">Loading a quote…</p>}
      {error && <p className="hx-wait">Could not load a quote. Check your internet connection and reload.</p>}
      {quote && (
        <div className="hx-body">
          <p className="hx-q">“{quote.text}”</p>
          <p className="hx-by">
            {quote.author}
            {quote.about && <small>{quote.about}</small>}
          </p>
        </div>
      )}
      <button className="hx-new" onClick={load}>
        New quote
      </button>
    </aside>
  );
}

// What the angry cube says when it hits the screen (random, never the same twice in a row).
const ANGRY_LINES = [
  "Go to the gym.",
  "Get a job.",
  "Pray your salah.",
  "Lock in.",
  "Give me 20 push-ups.",
];

function CubeMessage() {
  const [msg, setMsg] = useState(null);
  const last = useRef(-1);
  const box = useRef(null);

  useEffect(() => {
    const on = () => {
      let i;
      do i = Math.floor(Math.random() * ANGRY_LINES.length);
      while (i === last.current);
      last.current = i;
      setMsg({ id: Date.now(), text: ANGRY_LINES[i] });
    };
    window.addEventListener("mfs:screen-hit", on);
    return () => window.removeEventListener("mfs:screen-hit", on);
  }, []);

  useGSAP(
    () => {
      if (!msg) return;
      // drops in, shakes, the bar runs down for 10 s, then it fades away
      const id = msg.id;
      gsap
        // only clear this message: a newer one may have replaced it
        .timeline({ onComplete: () => setMsg((m) => (m && m.id === id ? null : m)) })
        .fromTo(".cm", { y: -30, opacity: 0, scale: 0.8 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2.5)" })
        .to(".cm", { keyframes: [{ x: -8 }, { x: 8 }, { x: -5 }, { x: 4 }, { x: 0 }], duration: 0.4 }, 0.45)
        .fromTo(".cm-time", { scaleX: 1 }, { scaleX: 0, duration: 10, ease: "none" }, 0)
        .to(".cm", { y: -16, opacity: 0, duration: 0.45, ease: "power2.in" }, 9.6);
    },
    // revertOnUpdate: a new hit stops the previous message's timer so it cannot hide the new one
    { scope: box, dependencies: [msg?.id], revertOnUpdate: true }
  );

  return (
    <div className="cm-wrap" ref={box} aria-live="assertive">
      {msg && (
        <div className="cm" key={msg.id} role="status">
          <b>{msg.text}</b>
          <i className="cm-time" />
        </div>
      )}
    </div>
  );
}

function Streak({ days, pulse, what, label }) {
  const ref = useRef(null);
  useGSAP(
    () => {
      if (!pulse) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(ref.current, { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.1, ease: "elastic.out(1, 0.5)" });
      });
    },
    { scope: ref, dependencies: [pulse] }
  );
  return (
    <div className="hx-streak" ref={ref} aria-label={`${label} streak: ${days} days`}>
      <b>{days}</b>
      <span>
        day{days === 1 ? "" : "s"} in a row
        <br />
        {what}
      </span>
    </div>
  );
}

export default function Hero({ streak = 0, salahStreak = 0, pulse = 0, salahPulse = 0, showVerse = true, showQuote = true }) {
  return (
    <section className="hero" id="top">
      {showVerse ? <DailyVerse /> : <div className="hx hx-empty" />}
      <div className="hero-mid">
        <div className="hx-streaks">
          <Streak days={streak} pulse={pulse} what="habits at 100%" label="Habit" />
          <Streak days={salahStreak} pulse={salahPulse} what="all 5 salah" label="Salah" />
        </div>
        <CubeMessage />
        <Suspense fallback={<div className="rk" aria-hidden="true" />}>
          <RubikHero />
        </Suspense>
      </div>
      {showQuote ? <Motivation /> : <div className="hx hx-empty" />}
    </section>
  );
}
