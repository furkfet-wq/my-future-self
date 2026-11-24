import { useEffect, useId, useRef, useState } from "react";
import gsap from "gsap";
import { fmtMoney, fmtMins } from "../lib/week.js";

// Three charts that work for a week or for many days. Pure SVG, black and white.
// Values tween smoothly (rising from the baseline) on mount and on every change.
// Days with `future: true` are not drawn.

const H = 300, L = 54, R = 26, T = 30, B = 46;
const PH = H - T - B;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function geo(n, wide) {
  const W = wide ? 1100 : 560;
  const PW = W - L - R;
  const xAt = (i) => (n <= 1 ? L + PW / 2 : L + (PW * i) / (n - 1));
  const every = n <= 10 ? 1 : Math.ceil(n / (wide ? 14 : 8));
  const col = n <= 1 ? PW : PW / (n - 1);
  return { W, PW, xAt, every, col };
}

function useTweened(values, { duration = 1.3, ease = "power3.out", stagger = 0.55 } = {}) {
  const [cur, setCur] = useState(() => values.map(() => 0));
  const ref = useRef(values.map(() => 0));
  const key = values.map((v) => (v == null ? "n" : v)).join(",");

  useEffect(() => {
    const target = values.map((v) => v ?? 0);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      ref.current = target;
      setCur(target);
      return;
    }
    const from = target.map((_, i) => ref.current[i] ?? 0);
    const ez = gsap.parseEase(ease);
    const n = Math.max(1, target.length - 1);
    const proxy = { t: 0 };
    const tw = gsap.to(proxy, {
      t: 1,
      duration: duration * (1 + stagger),
      ease: "none",
      onUpdate: () => {
        const next = target.map((tv, i) => {
          const p = clamp(proxy.t * (1 + stagger) - (stagger * i) / n, 0, 1);
          return from[i] + (tv - from[i]) * ez(p);
        });
        ref.current = next;
        setCur(next);
      },
    });
    return () => tw.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return cur;
}

function niceTicks(lo, hi, count = 5) {
  if (hi <= lo) hi = lo + 1;
  const raw = (hi - lo) / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 1e6; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

function Frame({ g, ticks, yOf, fmt, data }) {
  const n = data.length;
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={g.W - R} y1={yOf(t)} y2={yOf(t)} className="xc-grid" />
          <text x={L - 10} y={yOf(t) + 4} textAnchor="end" className="xc-tick">
            {fmt(t)}
          </text>
        </g>
      ))}
      {data.map((d, i) =>
        i % g.every === 0 || i === n - 1 ? (
          <g key={d.key}>
            <line x1={g.xAt(i)} x2={g.xAt(i)} y1={T} y2={T + PH} className="xc-grid" />
            <text x={g.xAt(i)} y={H - 16} textAnchor="middle" className={`xc-xl${d.future ? " xc-future" : ""}`}>
              {d.short}
            </text>
          </g>
        ) : null
      )}
      <line x1={L} x2={L} y1={T} y2={T + PH} className="xc-axis" />
      <line x1={L} x2={g.W - R} y1={T + PH} y2={T + PH} className="xc-axis" />
    </g>
  );
}

function Tip({ g, x, y, title, value }) {
  const w = 128;
  const tx = clamp(x - w / 2, 4, g.W - w - 4);
  const ty = Math.max(2, y - 48);
  return (
    <g className="xc-tip xc-tip-on" transform={`translate(${tx} ${ty})`} pointerEvents="none">
      <rect width={w} height={36} rx={7} fill="#fff" />
      <text x={w / 2} y={15} textAnchor="middle" className="xc-tip-t">{title}</text>
      <text x={w / 2} y={29} textAnchor="middle" className="xc-tip-v">{value}</text>
    </g>
  );
}

function HitCols({ g, data, onHover, children }) {
  return data.map((d, i) => (
    <g className="xc-hit" key={d.key} onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}>
      <rect x={Math.max(0, g.xAt(i) - g.col / 2)} y={T} width={Math.min(g.W, g.xAt(i) + g.col / 2) - Math.max(0, g.xAt(i) - g.col / 2)} height={PH} fill="transparent" />
      {children(d, i)}
    </g>
  ));
}

// path made of straight segments between neighbours that both exist
function segPath(pts) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i] && pts[i + 1]) {
      out.push(`M${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} L${pts[i + 1][0].toFixed(1)} ${pts[i + 1][1].toFixed(1)}`);
    }
  }
  return out.join(" ");
}

const pctValue = (d) => (d.future ? null : d.pct);
const doneText = (d) => (d.future ? "still to come" : `${d.pct}% · ${d.done}/${d.total}`);

/* 1. Line with big dots: % of habits done each day */
export function WeekDotLine({ data, wide = false }) {
  const raw = data.map(pctValue);
  const cur = useTweened(raw);
  const n = data.length;
  const g = geo(n, wide);
  const r = n > 40 ? 3 : n > 14 ? 5 : 8;
  const yOf = (v) => T + PH * (1 - v / 100);
  const pts = cur.map((v, i) => (raw[i] == null ? null : [g.xAt(i), yOf(v)]));
  const [hover, setHover] = useState(null);
  const hd = hover == null ? null : data[hover];
  return (
    <svg className="xc-svg" viewBox={`0 0 ${g.W} ${H}`} role="img" aria-label="Percent of habits done each day">
      <Frame g={g} ticks={[0, 20, 40, 60, 80, 100]} yOf={yOf} fmt={(t) => `${t}%`} data={data} />
      <path d={segPath(pts)} className="xc-line" />
      <HitCols g={g} data={data} onHover={setHover}>
        {(d, i) =>
          pts[i] && (
            <g className="xc-rise">
              <circle cx={pts[i][0]} cy={pts[i][1]} r={r} className="xc-dot" />
            </g>
          )
        }
      </HitCols>
      {hd && <Tip key={hover} g={g} x={g.xAt(hover)} y={pts[hover] ? pts[hover][1] - 10 : T + PH} title={hd.title} value={doneText(hd)} />}
    </svg>
  );
}

/* 2. Rising 3D bars with an arrow through their tops */
function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function WeekRisingBars({ data, wide = false }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const raw = data.map(pctValue);
  const cur = useTweened(raw, { duration: 1.5, stagger: 0.8 });
  const n = data.length;
  const g = geo(n, wide);
  const slot = n <= 1 ? g.PW / 2 : g.PW / (n - 1);
  const bw = Math.min(slot * 0.5, 48);
  const dx = Math.min(14, bw * 0.35);
  const dy = dx * 0.58;
  const base = T + PH;
  const maxH = PH * 0.78;
  const bars = cur.map((v, i) => {
    if (raw[i] == null) return null;
    const h = Math.max(2, (maxH * v) / 100);
    const x = g.xAt(i) - bw / 2 - dx / 2;
    return { x, h, top: base - h };
  });

  // arrow: through bar tops, smoothed when there are many days
  const tops = bars
    .map((b, i) => (b ? [g.xAt(i), b.top - dy - 20] : null))
    .filter(Boolean);
  const win = tops.length > 10 ? 3 : 0;
  const arrowPts = tops.map((p, i) => {
    if (!win) return p;
    const s = tops.slice(Math.max(0, i - win), i + win + 1);
    return [p[0], s.reduce((a, q) => a + q[1], 0) / s.length];
  });
  const last = arrowPts[arrowPts.length - 1];
  const prev = arrowPts[arrowPts.length - 2] || (last && [last[0] - 10, last[1]]);
  let head = null;
  if (last && prev) {
    const ang = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
    const hx = last[0] + Math.cos(ang) * 24;
    const hy = last[1] + Math.sin(ang) * 24;
    const nx = -Math.sin(ang) * 11;
    const ny = Math.cos(ang) * 11;
    head = `${hx},${hy} ${last[0] + nx},${last[1] + ny} ${last[0] - nx},${last[1] - ny}`;
  }

  const [hover, setHover] = useState(null);
  const hd = hover == null ? null : data[hover];
  const hb = hover == null ? null : bars[hover];
  return (
    <svg className="xc-svg" viewBox={`0 0 ${g.W} ${H}`} role="img" aria-label="Rising bars of percent done">
      <defs>
        <linearGradient id={`xcFront${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#8c8c8c" />
        </linearGradient>
        <linearGradient id={`xcArrow${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff6a00" />
          <stop offset="0.55" stopColor="#ffb300" />
          <stop offset="1" stopColor="#ffe600" />
        </linearGradient>
        <linearGradient id={`xcRefl${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={L - 10} x2={g.W - R + 6} y1={base} y2={base} className="xc-axis" />
      <HitCols g={g} data={data} onHover={setHover}>
        {(d, i) => {
          const b = bars[i];
          return (
            <>
              {b && (
                <>
                  <rect x={b.x} y={base + 3} width={bw} height={Math.min(b.h, 34)} fill={`url(#xcRefl${uid})`} />
                  <g className="xc-rise">
                    <rect x={b.x} y={b.top} width={bw} height={b.h} fill={`url(#xcFront${uid})`} />
                    <polygon
                      points={`${b.x + bw},${b.top} ${b.x + bw + dx},${b.top - dy} ${b.x + bw + dx},${base - dy} ${b.x + bw},${base}`}
                      fill="#5a5a5a"
                    />
                    <polygon
                      points={`${b.x},${b.top} ${b.x + dx},${b.top - dy} ${b.x + bw + dx},${b.top - dy} ${b.x + bw},${b.top}`}
                      fill="#f4f4f4"
                    />
                  </g>
                </>
              )}
              {(i % g.every === 0 || i === n - 1) && (
                <text x={g.xAt(i)} y={H - 16} textAnchor="middle" className={`xc-xl${d.future ? " xc-future" : ""}`}>
                  {d.short}
                </text>
              )}
            </>
          );
        }}
      </HitCols>
      {arrowPts.length > 1 && <path d={smoothPath(arrowPts)} className="xc-arrow-outline" pointerEvents="none" />}
      {arrowPts.length > 1 && <path d={smoothPath(arrowPts)} className="xc-arrow" stroke={`url(#xcArrow${uid})`} pointerEvents="none" />}
      {head && arrowPts.length > 1 && <polygon points={head} className="xc-arrow-head" pointerEvents="none" />}
      {hd && <Tip key={hover} g={g} x={g.xAt(hover)} y={hb ? hb.top - dy - 10 : base} title={hd.title} value={doneText(hd)} />}
    </svg>
  );
}

/* 3. Grid line graph with tabs: productivity / feel / money (/ total money) */
export const TABS = [
  { id: "productive", label: "Productivity" },
  { id: "feel", label: "Feel" },
  { id: "energy", label: "Energy" },
  { id: "money", label: "Money" },
  { id: "spent", label: "Spent" },
  { id: "distracted", label: "Distracted" },
];

export function WeekStatLine({ data, tabs = TABS, wide = false }) {
  const [tab, setTab] = useState(tabs[0].id);
  const raw = data.map((d) => (d.future ? null : d[tab] ?? null));
  const cur = useTweened(raw, { duration: 1.1, stagger: 0.4 });
  const present = raw.filter((v) => v != null);
  const n = data.length;
  const g = geo(n, wide);
  const isMoney = tab === "money" || tab === "balance" || tab === "spent";
  const isTime = tab === "distracted";

  let ticks, fmt;
  if (isMoney) {
    const lo = Math.min(0, ...present);
    const hi = Math.max(10, ...present);
    ticks = niceTicks(lo, hi);
    fmt = (t) => fmtMoney(t);
  } else if (isTime) {
    ticks = niceTicks(0, Math.max(60, ...present));
    fmt = (t) => fmtMins(t);
  } else {
    ticks = [0, 2, 4, 6, 8, 10];
    fmt = (t) => String(t);
  }
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const yOf = (v) => T + PH * (1 - (clamp(v, lo, hi) - lo) / (hi - lo));
  const pts = cur.map((v, i) => (raw[i] == null ? null : [g.xAt(i), yOf(v)]));
  const [hover, setHover] = useState(null);
  const hd = hover == null ? null : data[hover];
  const fmtVal = (d, v) => (d.future ? "still to come" : v == null ? "no data" : isMoney ? fmtMoney(v) : isTime ? fmtMins(v) : `${v}/10`);

  return (
    <div className="xc">
      <div className="xc-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <svg className="xc-svg" viewBox={`0 0 ${g.W} ${H}`} role="img" aria-label={`${tab} by day`}>
        <Frame g={g} ticks={ticks} yOf={yOf} fmt={fmt} data={data} />
        {isMoney && lo < 0 && <line x1={L} x2={g.W - R} y1={yOf(0)} y2={yOf(0)} className="xc-zero" />}
        <path d={segPath(pts)} className="xc-line xc-line-thin" />
        <HitCols g={g} data={data} onHover={setHover}>
          {(d, i) =>
            pts[i] && (
              <g className="xc-rise">
                <circle cx={pts[i][0]} cy={pts[i][1]} r={n > 40 ? 3 : 5.5} className="xc-dot xc-dot-sm" />
              </g>
            )
          }
        </HitCols>
        {present.length === 0 && (
          <text x={L + g.PW / 2} y={T + PH / 2} textAnchor="middle" className="xc-empty">
            Nothing logged here yet
          </text>
        )}
        {hd && <Tip key={hover} g={g} x={g.xAt(hover)} y={pts[hover] ? pts[hover][1] - 10 : T + PH / 2} title={hd.title} value={fmtVal(hd, raw[hover])} />}
      </svg>
    </div>
  );
}
