// Black & white SVG charts animated with GSAP (useGSAP).
//
// Ownership rule used everywhere in this file: React renders static geometry (x, width, labels),
// GSAP owns every value-driven attribute (bar y/height, line d, dot cy/r, ring dashoffset,
// row y). React never renders those attributes, so a re-render can never fight a running tween.
//
// Motion model (per element):
//   - before the chart scrolls into view: element held at its "from" state (hidden)
//   - first time it is live: intro tween (staggered)          -> e.g. bar grows from baseline
//   - later data changes: tween from current value to new one -> no intro replay on clicks
//   - prefers-reduced-motion: values are set instantly
//   - unmount: useGSAP context reverts everything
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import "./charts.css";

gsap.registerPlugin(useGSAP);

/* ------------------------------------------------------------------ helpers */

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad2 = (n) => String(n).padStart(2, "0");
const fin = (v, d = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};
const numOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (n) => Math.round(n * 10) / 10;
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const prefersReduced = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const moneyDecimals = (v) => (Math.abs(Math.round(fin(v) * 100)) % 100 === 0 ? 0 : 2);

function absText(n, dec) {
  return Math.abs(n).toLocaleString("en-GB", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function formatCount(n, prefix, suffix, dec, signed) {
  const rounded = Number(fin(n).toFixed(dec)); // -0.004 -> -0, never shows "-£0"
  const sign = rounded < 0 ? "-" : signed && rounded > 0 ? "+" : "";
  return `${sign}${prefix}${absText(rounded, dec)}${suffix}`;
}

/** "£1,234", "-£5", "£12.50"; signed adds "+" to positives. */
export function formatGBP(value, { signed = false, decimals } = {}) {
  const dec = decimals ?? moneyDecimals(value);
  return formatCount(fin(value), "£", "", dec, signed);
}

/** Width of an element in CSS px (layout width, unaffected by transforms). */
function useWidth(ref, fallback) {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const cw = Math.round(el.clientWidth);
      if (cw > 0) setW((p) => (Math.abs(p - cw) >= 2 ? cw : p));
    };
    read();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", read);
      return () => window.removeEventListener("resize", read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/**
 * Height for a chart so its card ends level with the tallest card in the same grid row.
 * Cards in .charts are not stretched (align-items: start); each "fill" chart adds the missing
 * height to itself. Everything is worked out from each card's natural height (the extra height a
 * chart added is stored on its card), so resizing never feeds back into itself.
 */
function useFillHeight(ref, base) {
  const [h, setH] = useState(base);
  useLayoutEffect(() => {
    const el = ref.current;
    const card = el?.closest(".card");
    const grid = card?.parentElement;
    if (!card || !grid || typeof ResizeObserver === "undefined") return undefined;
    const natural = (c) => c.getBoundingClientRect().height - (Number(c.dataset.fillExtra) || 0);
    const read = () => {
      const top = card.offsetTop;
      const row = [...grid.children].filter((c) => c.classList.contains("card") && Math.abs(c.offsetTop - top) < 2);
      const mine = natural(card);
      const tallest = Math.max(mine, ...row.map(natural));
      const extra = row.length > 1 ? Math.max(0, Math.round(tallest - mine)) : 0;
      card.dataset.fillExtra = String(extra);
      setH((p) => (Math.abs(p - (base + extra)) >= 2 ? base + extra : p));
    };
    const ro = new ResizeObserver(read);
    [...grid.children].forEach((c) => ro.observe(c));
    read();
    return () => {
      ro.disconnect();
      delete card.dataset.fillExtra;
    };
  }, [ref, base]);
  return h;
}

/** true once the element has entered the viewport (one-shot). */
function useInView(ref) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (inView) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -40px 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, inView]);
  return inView;
}

/** Hover index with a "last shown" index so the tooltip can fade out with its content. */
function useHover(n) {
  const [hover, setHover] = useState(-1);
  const last = useRef(-1);
  const h = hover >= 0 && hover < n ? hover : -1;
  if (h >= 0) last.current = h;
  if (last.current >= n) last.current = -1;
  return [h, setHover, last.current];
}

const hitHandlers = (i, setHover) => ({
  onPointerEnter: (e) => {
    if (e.pointerType !== "touch") setHover(i);
  },
  onPointerDown: (e) => {
    if (e.pointerType === "touch") setHover((h) => (h === i ? -1 : i));
  },
});
const leaveHandler = (setHover) => (e) => {
  if (e.pointerType !== "touch") setHover(-1);
};

/* ------------------------------------------------------------------ motion core */

const INTRO = { duration: 0.9, ease: "power3.out" };
const UPDATE = { duration: 0.6, ease: "power2.out" };
const WIPE = { duration: 1.3, ease: "power2.inOut" };
const freshMem = () => ({ seen: new WeakSet(), last: new WeakMap(), hooked: false });

/**
 * Drive one element to `to`.
 * Not live yet -> hold at `from`. Reduced motion -> set. First time live -> intro fromTo.
 * Later -> tween only if the target actually changed (so unrelated updates never cut an intro).
 */
function drive(ctx, el, to, from, i = 0, opt = {}) {
  if (!el) return;
  const { stagger = 0.03, delay = 0, intro = INTRO, update = UPDATE } = opt;
  const key = JSON.stringify(to);
  if (!ctx.live) {
    gsap.set(el, from);
    return;
  }
  if (ctx.reduce) {
    gsap.set(el, to);
    ctx.seen.add(el);
    ctx.last.set(el, key);
    return;
  }
  if (!ctx.seen.has(el)) {
    ctx.seen.add(el);
    ctx.last.set(el, key);
    gsap.fromTo(el, from, { ...intro, ...to, delay: delay + i * stagger, overwrite: true });
    return;
  }
  if (ctx.last.get(el) === key) return;
  ctx.last.set(el, key);
  gsap.to(el, { ...update, ...to, overwrite: true });
}

/**
 * Runs `run(ctx, rootEl)` inside a useGSAP context whenever `sig` (a value signature of the
 * data) changes or the chart first scrolls into view. The context is NOT reverted on updates
 * (marks tween from where they are); it is reverted on unmount.
 */
function useMotion(rootRef, sig, run) {
  const inView = useInView(rootRef);
  const mem = useRef(null);
  if (mem.current === null) mem.current = freshMem();
  useGSAP(
    () => {
      const m = mem.current;
      const el = rootRef.current;
      if (el) run({ live: inView, reduce: prefersReduced(), seen: m.seen, last: m.last }, el);
      if (!m.hooked) {
        m.hooked = true;
        // Runs on context revert (unmount): forget which elements were introduced.
        return () => {
          mem.current = freshMem();
        };
      }
      return undefined;
    },
    { scope: rootRef, dependencies: [inView, sig] }
  );
  return inView;
}

/** Tween arrays of pixel y values (null = gap) from their current state to `to`. */
function morphTo(m, to, fallback, paint) {
  const from = to.map((arr, s) =>
    arr.map((v, i) => {
      if (v == null) return null;
      const c = m.cur?.[s]?.[i];
      return c == null ? fallback(v) : c;
    })
  );
  gsap.killTweensOf(m.p);
  const same = from.every((arr, s) => arr.every((v, i) => v === to[s][i]));
  if (same) {
    m.cur = to;
    paint(...to);
    return;
  }
  m.p.t = 0;
  gsap.to(m.p, {
    t: 1,
    duration: 0.7,
    ease: "power2.inOut",
    onUpdate: () => {
      const k = m.p.t;
      const cur = to.map((arr, s) =>
        arr.map((v, i) => (v == null ? null : from[s][i] + (v - from[s][i]) * k))
      );
      m.cur = cur;
      paint(...cur);
    },
  });
}

function linePath(xs, ys) {
  let d = "";
  let pen = false;
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i];
    if (y == null || xs[i] == null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${xs[i]} ${r1(y)}`;
    pen = true;
  }
  return d;
}

function stepPath(x0, band, ys) {
  if (!ys.length) return "";
  let d = `M${r1(x0)} ${r1(ys[0])}`;
  ys.forEach((y, i) => {
    if (i) d += `V${r1(y)}`;
    d += `H${r1(x0 + band * (i + 1))}`;
  });
  return d;
}

/* ------------------------------------------------------------------ small pieces */

function Empty({ text = "Nothing logged yet" }) {
  return <div className="ch-empty">{text}</div>;
}

function YGrid({ ticks, x1, x2, yOf, fmt }) {
  return (
    <g className="ch-grid">
      {ticks.map((t, i) => {
        const y = r1(yOf(t));
        return (
          <g key={`${i}-${t}`}>
            <line x1={x1} x2={x2} y1={y} y2={y} />
            <text x={x1 - 8} y={y} dy="0.32em" textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Tip({ on, x, y, W, H, children }) {
  const fx = W > 0 ? clamp(x / W, 0, 1) : 0.5;
  const side = fx < 0.16 ? " is-left" : fx > 0.84 ? " is-right" : "";
  return (
    <div
      className={`ch-tip${on ? " is-on" : ""}${side}`}
      style={{ left: `${fx * 100}%`, top: `${H > 0 ? clamp(y / H, 0, 1) * 100 : 0}%` }}
      aria-hidden={!on}
    >
      {children}
    </div>
  );
}

/** Day-number labels under a month axis; thins out when bars get narrow. */
function DayLabels({ rows, L, band, y, todayK }) {
  const step = band >= 18 ? 1 : band >= 11 ? 2 : 5;
  return (
    <g className="ch-xlabels">
      {rows.map((d, i) => {
        const dn = Number(d.label) || i + 1;
        const show = step === 1 || dn === 1 || (step === 2 ? dn % 2 === 1 : dn % 5 === 0);
        const isToday = d.key === todayK;
        const cx = r1(L + (i + 0.5) * band);
        return (
          <g key={`x-${d.key ?? i}`}>
            {show && (
              <text
                className={`ch-xl${isToday ? " is-today" : ""}${d.key > todayK ? " is-future" : ""}`}
                x={cx}
                y={y}
                textAnchor="middle"
              >
                {d.label}
              </text>
            )}
            {isToday && <rect className="ch-today" x={cx - 2} y={y + 5} width={4} height={4} />}
          </g>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------------ StatCount */

/** Number that counts to `value` with GSAP. Negative money renders "-£5". */
export function StatCount({ value, prefix = "", suffix = "", decimals = 0, signed = false, className = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  const target = fin(value);
  const dec = clamp(Math.round(fin(decimals)), 0, 4);
  const state = useRef({ n: 0 });

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const s = state.current;
      const paint = () => {
        el.textContent = formatCount(s.n, prefix, suffix, dec, signed);
      };
      if (!inView) {
        paint();
        return;
      }
      if (prefersReduced() || s.n === target) {
        gsap.killTweensOf(s);
        s.n = target;
        paint();
        return;
      }
      gsap.to(s, {
        n: target,
        duration: 1.2,
        ease: "power3.out",
        overwrite: true,
        onUpdate: paint,
        onComplete: paint,
      });
    },
    { scope: ref, dependencies: [inView, target, dec, prefix, suffix, signed] }
  );

  // No React children: GSAP owns textContent.
  return <span ref={ref} className={`ch-count${className ? ` ${className}` : ""}`} />;
}

/* ------------------------------------------------------------------ 1. Daily bars */

export function DailyProgressBars({ data }) {
  const rows = Array.isArray(data) ? data.filter(Boolean) : [];
  const root = useRef(null);
  const W = Math.max(260, useWidth(root, 640));
  const H = useFillHeight(root, 220);
  const L = 40;
  const R = 6;
  const T = 14;
  const B = 30;
  const pw = W - L - R;
  const ph = H - T - B;
  const base = T + ph;
  const n = rows.length;
  const band = n ? pw / n : pw;
  const bw = Math.max(2, Math.min(band * 0.62, 28));
  const pcts = rows.map((d) => clamp(fin(d.pct), 0, 100));
  const noHabits = n > 0 && rows.every((d) => !fin(d.total));
  const [hover, setHover, shown] = useHover(n);
  const tk = todayKey();
  const sig = rows.map((d, i) => `${d.key}:${pcts[i]}`).join("|");

  useMotion(root, sig, (ctx, el) => {
    el.querySelectorAll(".ch-bar").forEach((bar) => {
      const i = Number(bar.dataset.i);
      const h = r1((pcts[i] / 100) * ph);
      drive(ctx, bar, { attr: { y: base - h, height: h } }, { attr: { y: base, height: 0 } }, i, {
        stagger: 0.022,
      });
    });
  });

  const avg = n ? Math.round(pcts.reduce((a, b) => a + b, 0) / n) : 0;
  const sd = shown >= 0 ? rows[shown] : null;

  return (
    <div ref={root} className={`chart ch-daily${hover >= 0 ? " ch-has-hover" : ""}`}>
      {!n ? (
        <Empty />
      ) : (
        <div className="ch-plot">
          <svg
            className="ch-svg"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Daily habit completion this month, average ${avg}%`}
            onPointerLeave={leaveHandler(setHover)}
          >
            <YGrid
              ticks={[0, 25, 50, 75, 100]}
              x1={L}
              x2={L + pw}
              yOf={(t) => base - (t / 100) * ph}
              fmt={(t) => (t % 50 === 0 ? `${t}%` : "")}
            />
            {rows.map((d, i) =>
              i > 0 && d.dow === 0 ? (
                <line key={`sep-${d.key}`} className="ch-sep" x1={r1(L + i * band)} x2={r1(L + i * band)} y1={T} y2={base} />
              ) : null
            )}
            {rows.map((d, i) => {
              const x = r1(L + i * band + (band - bw) / 2);
              return (
                <g key={d.key ?? i}>
                  <rect className="ch-track" x={x} y={T} width={r1(bw)} height={ph} />
                  <rect className={`ch-bar${hover === i ? " is-hover" : ""}`} data-i={i} x={x} y={base} width={r1(bw)} height={0} />
                </g>
              );
            })}
            <line className="ch-axis" x1={L} x2={L + pw} y1={base} y2={base} />
            <DayLabels rows={rows} L={L} band={band} y={base + 17} todayK={tk} />
            {noHabits && (
              <text className="ch-note" x={L + pw / 2} y={T + ph / 2} textAnchor="middle">
                Add a habit to start tracking
              </text>
            )}
            {rows.map((d, i) => (
              <rect
                key={`hit-${d.key ?? i}`}
                className="ch-hit"
                x={r1(L + i * band)}
                y={T}
                width={r1(band)}
                height={ph + B}
                {...hitHandlers(i, setHover)}
              />
            ))}
          </svg>
          <Tip
            on={hover >= 0}
            x={L + (Math.max(0, shown) + 0.5) * band}
            y={Math.max(52, base - ((pcts[shown] ?? 0) / 100) * ph)}
            W={W}
            H={H}
          >
            {sd && (
              <>
                <b>
                  {DOW[sd.dow] ?? ""} {sd.label}
                </b>
                <span>
                  {fin(sd.done)}/{fin(sd.total)} done · {pcts[shown]}%
                </span>
              </>
            )}
          </Tip>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 2. Weekly bars */

export function WeeklyProgressBars({ data }) {
  const rows = Array.isArray(data) ? data.filter(Boolean) : [];
  const root = useRef(null);
  const W = Math.max(240, useWidth(root, 480));
  const H = useFillHeight(root, 220);
  const L = 40;
  const R = 6;
  const T = 24;
  const B = 36;
  const pw = W - L - R;
  const ph = H - T - B;
  const base = T + ph;
  const n = rows.length;
  const band = n ? pw / n : pw;
  const bw = Math.max(8, Math.min(band * 0.58, 84));
  const pcts = rows.map((w) => clamp(fin(w.pct), 0, 100));
  const noHabits = n > 0 && rows.every((w) => !fin(w.total));
  const [hover, setHover, shown] = useHover(n);
  const sig = rows.map((w, i) => `${w.label}:${pcts[i]}`).join("|");

  useMotion(root, sig, (ctx, el) => {
    el.querySelectorAll(".ch-bar").forEach((bar) => {
      const i = Number(bar.dataset.i);
      const h = r1((pcts[i] / 100) * ph);
      drive(ctx, bar, { attr: { y: base - h, height: h } }, { attr: { y: base, height: 0 } }, i, {
        stagger: 0.07,
        intro: { duration: 1, ease: "power3.out" },
      });
    });
    el.querySelectorAll(".ch-vl").forEach((lab) => {
      const i = Number(lab.dataset.i);
      const h = r1((pcts[i] / 100) * ph);
      drive(ctx, lab, { attr: { y: base - h - 8 }, autoAlpha: 1 }, { attr: { y: base - 8 }, autoAlpha: 0 }, i, {
        stagger: 0.07,
        intro: { duration: 1, ease: "power3.out" },
      });
    });
  });

  const sw = shown >= 0 ? rows[shown] : null;
  const range = (w) => (w && w.start != null && w.end != null ? (w.start === w.end ? `${w.start}` : `${w.start}–${w.end}`) : "");

  return (
    <div ref={root} className={`chart ch-weekly${hover >= 0 ? " ch-has-hover" : ""}`}>
      {!n ? (
        <Empty />
      ) : (
        <div className="ch-plot">
          <svg
            className="ch-svg"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Weekly completion: ${rows.map((w, i) => `${w.label} ${pcts[i]}%`).join(", ")}`}
            onPointerLeave={leaveHandler(setHover)}
          >
            <YGrid
              ticks={[0, 25, 50, 75, 100]}
              x1={L}
              x2={L + pw}
              yOf={(t) => base - (t / 100) * ph}
              fmt={(t) => (t % 50 === 0 ? `${t}%` : "")}
            />
            {rows.map((w, i) => {
              const x = r1(L + i * band + (band - bw) / 2);
              const cx = r1(L + (i + 0.5) * band);
              return (
                <g key={w.label ?? i}>
                  <rect className="ch-track" x={x} y={T} width={r1(bw)} height={ph} />
                  <rect className={`ch-bar${hover === i ? " is-hover" : ""}`} data-i={i} x={x} y={base} width={r1(bw)} height={0} />
                  <text className="ch-vl" data-i={i} x={cx} textAnchor="middle">
                    {pcts[i]}%
                  </text>
                  <text className="ch-xl ch-xl-strong" x={cx} y={base + 17} textAnchor="middle">
                    {w.label}
                  </text>
                  <text className="ch-xl ch-xl-sub" x={cx} y={base + 30} textAnchor="middle">
                    {range(w)}
                  </text>
                </g>
              );
            })}
            <line className="ch-axis" x1={L} x2={L + pw} y1={base} y2={base} />
            {noHabits && (
              <text className="ch-note" x={L + pw / 2} y={T + ph / 2} textAnchor="middle">
                Add a habit to start tracking
              </text>
            )}
            {rows.map((w, i) => (
              <rect
                key={`hit-${w.label ?? i}`}
                className="ch-hit"
                x={r1(L + i * band)}
                y={T}
                width={r1(band)}
                height={ph + B}
                {...hitHandlers(i, setHover)}
              />
            ))}
          </svg>
          <Tip
            on={hover >= 0}
            x={L + (Math.max(0, shown) + 0.5) * band}
            y={Math.max(56, base - ((pcts[shown] ?? 0) / 100) * ph - 22)}
            W={W}
            H={H}
          >
            {sw && (
              <>
                <b>
                  {sw.label}
                  {range(sw) ? ` · days ${range(sw)}` : ""}
                </b>
                <span>
                  {fin(sw.done)}/{fin(sw.total)} done · {pcts[shown]}%
                </span>
              </>
            )}
          </Tip>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 3. Donut */

export function DonutStat({ overall }) {
  const o = overall || {};
  const pct = clamp(fin(o.pct), 0, 100);
  const goal = Math.max(0, fin(o.goal));
  const completed = Math.max(0, fin(o.completed));
  const left = Math.max(0, fin(o.left, goal - completed));
  const root = useRef(null);
  const R = 78;
  const C = 2 * Math.PI * R;
  const ticks = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  useMotion(root, `${pct}`, (ctx, el) => {
    const ringIntro = { intro: { duration: 1.6, ease: "power3.inOut" }, update: { duration: 0.8, ease: "power2.out" } };
    drive(
      ctx,
      el.querySelector(".ch-ring"),
      { attr: { "stroke-dashoffset": r1(C * (1 - pct / 100)) } },
      { attr: { "stroke-dashoffset": r1(C) } },
      0,
      ringIntro
    );
    drive(
      ctx,
      el.querySelector(".ch-ring-knob"),
      { rotation: pct * 3.6, svgOrigin: "100 100", autoAlpha: 1 },
      { rotation: 0, svgOrigin: "100 100", autoAlpha: 0 },
      0,
      ringIntro
    );
  });

  return (
    <div ref={root} className="chart ch-donut">
      <div className="ch-donut-ring">
        <svg
          className="ch-svg ch-donut-svg"
          viewBox="0 0 200 200"
          role="img"
          aria-label={`${pct}% of this month's habit goal completed`}
        >
          <g className="ch-ticks">
            {ticks.map((i) => {
              const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
              const major = i % 15 === 0;
              const r0 = major ? 88 : 91;
              const r2 = 96;
              return (
                <line
                  key={i}
                  className={major ? "is-major" : undefined}
                  x1={r1(100 + Math.cos(a) * r0)}
                  y1={r1(100 + Math.sin(a) * r0)}
                  x2={r1(100 + Math.cos(a) * r2)}
                  y2={r1(100 + Math.sin(a) * r2)}
                />
              );
            })}
          </g>
          <circle className="ch-ring-track" cx="100" cy="100" r={R} />
          <circle
            className="ch-ring"
            cx="100"
            cy="100"
            r={R}
            strokeDasharray={`${r1(C)} ${r1(C)}`}
            transform="rotate(-90 100 100)"
          />
          <circle className="ch-ring-knob" cx="100" cy={100 - R} r="5" />
        </svg>
        <div className="ch-donut-center">
          <StatCount value={pct} suffix="%" className="ch-donut-pct" />
          <span className="ch-donut-sub">{goal > 0 ? "complete" : "no habits yet"}</span>
        </div>
      </div>
      <dl className="ch-donut-stats">
        <div>
          <dt>Goal</dt>
          <dd>
            <StatCount value={goal} />
          </dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>
            <StatCount value={completed} />
          </dd>
        </div>
        <div>
          <dt>Left</dt>
          <dd>
            <StatCount value={left} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ 4. Habit performance (HTML rows) */

const ROW_H = 36;

export function HabitPerformanceBars({ data }) {
  const root = useRef(null);
  const rows = useMemo(
    () =>
      (Array.isArray(data) ? data : [])
        .filter((h) => h && h.id != null)
        .map((h, i) => ({ ...h, _i: i, pct: clamp(fin(h.pct), 0, 100) }))
        .sort((a, b) => b.pct - a.pct || a._i - b._i),
    [data]
  );
  const rank = useMemo(() => new Map(rows.map((r, i) => [String(r.id), i])), [rows]);
  const sig = rows.map((r) => `${r.id}:${r.pct}`).join("|");
  // extra space at the bottom so the card ends level with the tallest card in its row
  const fillPad = useFillHeight(root, 0);

  useMotion(root, sig, (ctx, el) => {
    el.querySelectorAll(".ch-hrow").forEach((row) => {
      const i = rank.get(row.dataset.id);
      if (i == null) return;
      drive(ctx, row, { y: i * ROW_H, autoAlpha: 1 }, { y: i * ROW_H + 18, autoAlpha: 0 }, i, {
        stagger: 0.05,
        update: { duration: 0.7, ease: "power3.inOut" },
      });
      drive(ctx, row.querySelector(".ch-hfill"), { scaleX: rows[i].pct / 100 }, { scaleX: 0 }, i, {
        stagger: 0.05,
        delay: 0.18,
        intro: { duration: 1.1, ease: "power3.out" },
      });
    });
  });

  return (
    <div ref={root} className="chart ch-habits" style={fillPad ? { paddingBottom: fillPad } : undefined}>
      {!rows.length ? (
        <Empty text="No habits yet" />
      ) : (
        <ol className="ch-hlist" style={{ height: rows.length * ROW_H }}>
          {rows.map((h, i) => (
            <li key={h.id} className="ch-hrow" data-id={String(h.id)} style={{ height: ROW_H }}>
              <div className="ch-hin">
                <span className="ch-hrank">{pad2(i + 1)}</span>
                <span className="ch-hname" title={h.name}>
                  {h.name}
                </span>
                <span className="ch-htrack">
                  <span className="ch-hfill" />
                </span>
                <span className="ch-hnum">
                  <span className="ch-hdone">
                    {fin(h.done)}/{fin(h.goal)}
                  </span>
                  <span className="ch-hleft">{fin(h.left, fin(h.goal) - fin(h.done))} left</span>
                </span>
                <span className="ch-hpct">{h.pct}%</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 5. Mood lines */

export function MoodLines({ data }) {
  const rows = Array.isArray(data) ? data.filter(Boolean) : [];
  const root = useRef(null);
  const W = Math.max(260, useWidth(root, 640));
  const H = useFillHeight(root, 220);
  const L = 30;
  const R = 8;
  const T = 14;
  const B = 30;
  const pw = W - L - R;
  const ph = H - T - B;
  const base = T + ph;
  const n = rows.length;
  const band = n ? pw / n : pw;
  const yOf = (v) => base - (clamp(v, 0, 10) / 10) * ph;
  const feel = rows.map((d) => numOrNull(d.feel));
  const prod = rows.map((d) => numOrNull(d.productive));
  const tf = feel.map((v) => (v == null ? null : r1(yOf(v))));
  const tp = prod.map((v) => (v == null ? null : r1(yOf(v))));
  const xs = rows.map((_, i) => r1(L + band * (i + 0.5)));
  const anyLogged = feel.some((v) => v != null) || prod.some((v) => v != null);
  const [hover, setHover, shown] = useHover(n);
  const tk = todayKey();
  const clipId = `chm${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const morph = useRef(null);
  if (morph.current === null) morph.current = { p: { t: 0 }, cur: null };
  const sig = `${rows[0]?.key ?? ""}|${n}|${W}|${tf.join(",")}|${tp.join(",")}`;

  useMotion(root, sig, (ctx, el) => {
    const clip = el.querySelector(".ch-cliprect");
    const pf = el.querySelector(".ch-line-feel");
    const pp = el.querySelector(".ch-line-prod");
    if (!clip || !pf || !pp) return;
    const m = morph.current;
    const paint = (a, b) => {
      pf.setAttribute("d", linePath(xs, a));
      pp.setAttribute("d", linePath(xs, b));
    };
    const introNow = ctx.live && !ctx.reduce && !ctx.seen.has(clip);
    drive(ctx, clip, { attr: { width: pw + 16 } }, { attr: { width: 0 } }, 0, { intro: WIPE });
    if (!ctx.live || ctx.reduce || introNow || !m.cur) {
      gsap.killTweensOf(m.p);
      m.cur = [tf, tp];
      paint(tf, tp);
    } else {
      morphTo(m, [tf, tp], () => base, paint);
    }
    el.querySelectorAll(".ch-dot").forEach((dot) => {
      const i = Number(dot.dataset.i);
      const cy = (dot.dataset.s === "f" ? tf : tp)[i];
      if (cy == null) return;
      drive(
        ctx,
        dot,
        { attr: { cy, r: 3.5 }, autoAlpha: 1 },
        { attr: { cy: introNow ? cy : base, r: 0 }, autoAlpha: 0 },
        i,
        introNow
          ? { stagger: WIPE.duration / Math.max(1, n), delay: 0.1, intro: { duration: 0.45, ease: "back.out(2.5)" } }
          : { stagger: 0, update: { duration: 0.7, ease: "power2.inOut" } }
      );
    });
  });

  const avg = (arr) => {
    const v = arr.filter((x) => x != null);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "–";
  };
  const sd = shown >= 0 ? rows[shown] : null;
  const showV = (v) => (v == null ? "–" : `${Math.round(clamp(v, 0, 10) * 10) / 10}`);
  const tipY = shown >= 0 ? Math.min(...[tf[shown], tp[shown]].filter((v) => v != null), base) : base;

  return (
    <div ref={root} className={`chart ch-mood${hover >= 0 ? " ch-has-hover" : ""}`}>
      {!n ? (
        <Empty />
      ) : (
        <>
          <div className="ch-legend">
            <span className="ch-lg">
              <svg width="24" height="8" aria-hidden="true">
                <line className="ch-lg-solid" x1="0" x2="24" y1="4" y2="4" />
              </svg>
              Feel <em>avg {avg(feel)}</em>
            </span>
            <span className="ch-lg">
              <svg width="24" height="8" aria-hidden="true">
                <line className="ch-lg-dash" x1="0" x2="24" y1="4" y2="4" />
              </svg>
              Productive <em>avg {avg(prod)}</em>
            </span>
          </div>
          <div className="ch-plot">
            <svg
              className="ch-svg"
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`Mood this month: feel average ${avg(feel)}, productive average ${avg(prod)} out of 10`}
              onPointerLeave={leaveHandler(setHover)}
            >
              <defs>
                <clipPath id={clipId}>
                  <rect className="ch-cliprect" x={L - 8} y={0} height={H} />
                </clipPath>
              </defs>
              <YGrid ticks={[0, 2.5, 5, 7.5, 10]} x1={L} x2={L + pw} yOf={yOf} fmt={(t) => (Number.isInteger(t) && t % 5 === 0 ? t : "")} />
              <line className="ch-axis" x1={L} x2={L + pw} y1={base} y2={base} />
              <line
                className={`ch-guide${hover >= 0 ? " is-on" : ""}`}
                x1={xs[Math.max(0, shown)] ?? L}
                x2={xs[Math.max(0, shown)] ?? L}
                y1={T}
                y2={base}
              />
              <g clipPath={`url(#${clipId})`}>
                <path className="ch-line ch-line-feel" />
                <path className="ch-line ch-line-prod" />
                {rows.map((d, i) =>
                  feel[i] == null ? null : (
                    <circle key={`f-${d.key ?? i}`} className="ch-dot ch-dot-f" data-i={i} data-s="f" cx={xs[i]} cy={base} r={0} />
                  )
                )}
                {rows.map((d, i) =>
                  prod[i] == null ? null : (
                    <circle key={`p-${d.key ?? i}`} className="ch-dot ch-dot-p" data-i={i} data-s="p" cx={xs[i]} cy={base} r={0} />
                  )
                )}
              </g>
              <DayLabels rows={rows} L={L} band={band} y={base + 17} todayK={tk} />
              {!anyLogged && (
                <text className="ch-note" x={L + pw / 2} y={T + ph / 2} textAnchor="middle">
                  Nothing logged yet
                </text>
              )}
              {rows.map((d, i) => (
                <rect
                  key={`hit-${d.key ?? i}`}
                  className="ch-hit"
                  x={r1(L + i * band)}
                  y={T}
                  width={r1(band)}
                  height={ph + B}
                  {...hitHandlers(i, setHover)}
                />
              ))}
            </svg>
            <Tip on={hover >= 0} x={xs[Math.max(0, shown)] ?? L} y={Math.max(56, tipY)} W={W} H={H}>
              {sd && (
                <>
                  <b>
                    {DOW[sd.dow] ?? ""} {sd.label}
                  </b>
                  <span>
                    Feel {showV(feel[shown])} · Productive {showV(prod[shown])}
                  </span>
                </>
              )}
            </Tip>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 6. Money */

export function MoneyChart({ data, balance, monthIncome }) {
  const rows = Array.isArray(data) ? data.filter(Boolean) : [];
  const root = useRef(null);
  const W = Math.max(260, useWidth(root, 640));
  const n = rows.length;
  const L = 58;
  const R = 8;
  const pw = W - L - R;
  const T1 = 12;
  const h1 = 132; // balance panel
  const B1 = T1 + h1;
  const T2 = B1 + 24;
  const h2 = 64; // income panel
  const B2 = T2 + h2;
  const H = B2 + 30;
  const band = n ? pw / n : pw;
  const bw = Math.max(2, Math.min(band * 0.62, 24));

  const bals = rows.map((d) => fin(d.balance));
  const incs = rows.map((d) => fin(d.income));
  let lo = n ? Math.min(...bals) : 0;
  let hi = n ? Math.max(...bals) : 1;
  const padV = hi - lo > 0 ? (hi - lo) * 0.18 : Math.max(10, Math.abs(hi) * 0.1);
  lo -= padV;
  hi += padV;
  const yB = (v) => T1 + (1 - (v - lo) / (hi - lo)) * h1;
  const maxPos = Math.max(0, ...incs);
  const minNeg = Math.min(0, ...incs);
  const spanI = maxPos - minNeg || 1;
  const z = r1(T2 + ((maxPos || (minNeg ? 0 : spanI)) / spanI) * h2); // all-zero -> zero line at bottom
  const yI = (v) => z - (v / spanI) * h2;
  const by = bals.map((v) => r1(yB(v)));
  const anyIncome = incs.some((v) => v !== 0);
  const [hover, setHover, shown] = useHover(n);
  const tk = todayKey();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `chc${uid}`;
  const gradId = `chg${uid}`;
  const morph = useRef(null);
  if (morph.current === null) morph.current = { p: { t: 0 }, cur: null };
  const sig = `${rows[0]?.key ?? ""}|${n}|${W}|${by.join(",")}|${incs.join(",")}|${z}`;

  const bal = Number.isFinite(Number(balance)) ? Number(balance) : bals[n - 1] ?? 0;
  const mInc = Number.isFinite(Number(monthIncome)) ? Number(monthIncome) : incs.reduce((a, b) => a + b, 0);

  useMotion(root, sig, (ctx, el) => {
    const clip = el.querySelector(".ch-cliprect");
    const line = el.querySelector(".ch-bal-line");
    const area = el.querySelector(".ch-bal-area");
    if (clip && line && area) {
      const m = morph.current;
      const paint = (ys) => {
        const d = stepPath(L, band, ys);
        line.setAttribute("d", d);
        area.setAttribute("d", d ? `${d}V${B1}H${L}Z` : "");
      };
      const introNow = ctx.live && !ctx.reduce && !ctx.seen.has(clip);
      drive(ctx, clip, { attr: { width: pw + 16 } }, { attr: { width: 0 } }, 0, { intro: WIPE });
      if (!ctx.live || ctx.reduce || introNow || !m.cur) {
        gsap.killTweensOf(m.p);
        m.cur = [by];
        paint(by);
      } else {
        morphTo(m, [by], (v) => v, paint);
      }
    }
    drive(ctx, el.querySelector(".ch-zero"), { attr: { y1: z, y2: z } }, { attr: { y1: z, y2: z } });
    el.querySelectorAll(".ch-inc").forEach((bar) => {
      const i = Number(bar.dataset.i);
      const v = incs[i] ?? 0;
      const yv = r1(yI(v));
      const y = v >= 0 ? yv : z;
      const h = r1(Math.abs(yv - z));
      drive(ctx, bar, { attr: { y, height: h } }, { attr: { y: z, height: 0 } }, i, {
        stagger: 0.02,
        delay: 0.25,
      });
    });
  });

  const sd = shown >= 0 ? rows[shown] : null;
  const balTicks = [hi, (hi + lo) / 2, lo];

  return (
    <div ref={root} className={`chart ch-money${hover >= 0 ? " ch-has-hover" : ""}`}>
      <div className="ch-money-head">
        <div className="ch-big">
          <span className="ch-big-label">Balance</span>
          <StatCount className="ch-big-num" value={bal} prefix="£" decimals={moneyDecimals(bal)} />
        </div>
        <div className="ch-big">
          <span className="ch-big-label">This month</span>
          <StatCount className="ch-big-num" value={mInc} prefix="£" signed decimals={moneyDecimals(mInc)} />
        </div>
      </div>
      {!n ? (
        <Empty />
      ) : (
        <>
          <div className="ch-legend">
            <span className="ch-lg">
              <svg width="24" height="8" aria-hidden="true">
                <line className="ch-lg-solid" x1="0" x2="24" y1="4" y2="4" />
              </svg>
              Running balance
            </span>
            <span className="ch-lg">
              <svg width="12" height="10" aria-hidden="true">
                <rect className="ch-lg-box" x="1" y="1" width="10" height="8" />
              </svg>
              Daily income
            </span>
          </div>
          <div className="ch-plot">
            <svg
              className="ch-svg"
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`Money: balance ${formatGBP(bal)}, this month ${formatGBP(mInc, { signed: true })}`}
              onPointerLeave={leaveHandler(setHover)}
            >
              <defs>
                <clipPath id={clipId}>
                  <rect className="ch-cliprect" x={L - 8} y={0} height={B1 + 4} />
                </clipPath>
                <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                  <stop className="ch-stop-top" offset="0" />
                  <stop className="ch-stop-bot" offset="1" />
                </linearGradient>
              </defs>

              {/* balance panel */}
              <YGrid ticks={balTicks} x1={L} x2={L + pw} yOf={yB} fmt={(t) => formatGBP(Math.round(t), { decimals: 0 })} />
              <line
                className={`ch-guide${hover >= 0 ? " is-on" : ""}`}
                x1={r1(L + (Math.max(0, shown) + 0.5) * band)}
                x2={r1(L + (Math.max(0, shown) + 0.5) * band)}
                y1={T1}
                y2={B2}
              />
              <g clipPath={`url(#${clipId})`}>
                <path className="ch-bal-area" fill={`url(#${gradId})`} />
                <path className="ch-bal-line" />
              </g>
              {sd && (
                <circle
                  className={`ch-bal-mark${hover >= 0 ? " is-on" : ""}`}
                  cx={r1(L + (shown + 0.5) * band)}
                  cy={by[shown]}
                  r="4"
                />
              )}

              {/* income panel */}
              <g className="ch-grid">
                <text x={L - 8} y={T2} dy="0.32em" textAnchor="end">
                  {maxPos > 0 ? formatGBP(maxPos, { signed: true, decimals: 0 }) : "£0"}
                </text>
                {minNeg < 0 && (
                  <text x={L - 8} y={B2} dy="0.32em" textAnchor="end">
                    {formatGBP(minNeg, { decimals: 0 })}
                  </text>
                )}
                <line x1={L} x2={L + pw} y1={T2} y2={T2} />
                <line x1={L} x2={L + pw} y1={B2} y2={B2} />
              </g>
              {rows.map((d, i) => (
                <rect
                  key={d.key ?? i}
                  className={`ch-inc${incs[i] < 0 ? " is-neg" : ""}${hover === i ? " is-hover" : ""}`}
                  data-i={i}
                  x={r1(L + i * band + (band - bw) / 2)}
                  y={z}
                  width={r1(bw)}
                  height={0}
                />
              ))}
              <line className="ch-zero" x1={L} x2={L + pw} y1={z} y2={z} />
              {!anyIncome && (
                <text className="ch-note" x={L + pw / 2} y={T2 + h2 / 2} dy="0.32em" textAnchor="middle">
                  No money logged this month
                </text>
              )}

              <DayLabels rows={rows} L={L} band={band} y={B2 + 18} todayK={tk} />
              {rows.map((d, i) => (
                <rect
                  key={`hit-${d.key ?? i}`}
                  className="ch-hit"
                  x={r1(L + i * band)}
                  y={T1}
                  width={r1(band)}
                  height={H - T1}
                  {...hitHandlers(i, setHover)}
                />
              ))}
            </svg>
            <Tip
              on={hover >= 0}
              x={L + (Math.max(0, shown) + 0.5) * band}
              y={Math.max(58, by[Math.max(0, shown)] ?? T1)}
              W={W}
              H={H}
            >
              {sd && (
                <>
                  <b>
                    {DOW[sd.dow] ?? ""} {sd.label}
                  </b>
                  <span>Income {formatGBP(incs[shown], { signed: true })}</span>
                  <span>Balance {formatGBP(bals[shown])}</span>
                </>
              )}
            </Tip>
          </div>
        </>
      )}
    </div>
  );
}
