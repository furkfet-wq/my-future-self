import { useEffect, useRef, useState } from "react";
import { hsvToHex, hexToHsv, parseHex, pushRecent } from "../lib/color.js";

const RECENT_KEY = "mfs-recent-colours-v1"; // this browser only: never saved online, never sent anywhere
const BASIC = [
  "#f28b82", "#e53935", "#8d4b45", "#7b2d26", "#40140f", "#80ffff", "#6ef2e8", "#2e86de", "#0033ff", "#001a99", "#1e3a6e", "#000066",
  "#fff59d", "#ffeb3b", "#f2a65a", "#f0883e", "#7a4a1a", "#7a7a1f", "#8080ff", "#7c3aed", "#3a7ca5", "#000033", "#5b1a66", "#3d0a33",
  "#a5f28b", "#9be33c", "#6ef03c", "#7ff06e", "#7ff0a0", "#7f7f4a", "#f28bc4", "#f08bf0", "#e040fb", "#e91e63", "#8080c0", "#7a1a3a",
  "#2e7d32", "#3a7d4a", "#3a7d80", "#4a8080", "#1a3d0a", "#1a3d40", "#6a1a80", "#2e0a66", "#000000", "#808080", "#c0c0c0", "#ffffff",
];

const loadRecent = () => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((c) => parseHex(c) === c).slice(0, 12) : [];
  } catch {
    return [];
  }
};
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// Drag inside an element: calls onMove(x 0-1, y 0-1) on press and while moving. Pointer capture keeps it smooth
// even when the pointer leaves the box; nothing else listens, so dragging costs only this small menu's redraws.
function useDrag(onMove) {
  const ref = useRef(null);
  const handlers = {
    onPointerDown(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      handlers.onPointerMove(e, true);
    },
    onPointerMove(e, force) {
      if (!force && !e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const r = ref.current.getBoundingClientRect();
      onMove(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height));
    },
  };
  return [ref, handlers];
}

/* Colour menu: shade square, rainbow slider, hex box, basic and recent colours. Picks only on OK. */
export function ColourMenu({ title, start, pos, onPick, onClose }) {
  const [hsv, setHsv] = useState(() => hexToHsv(parseHex(start) || "#ff0000"));
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const [typed, setTyped] = useState(null); // text in the hex box while it is being edited
  const [recent] = useState(loadRecent);
  const root = useRef(null);
  const [svRef, svDrag] = useDrag((x, y) => setHsv((c) => ({ ...c, s: x, v: 1 - y })));
  const [hueRef, hueDrag] = useDrag((x) => setHsv((c) => ({ ...c, h: x * 360 })));

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && (e.stopPropagation(), onClose());
    const onDown = (e) => !root.current?.contains(e.target) && !e.target.closest?.(".np-sw-rainbow") && onClose();
    addEventListener("keydown", onKey, true);
    addEventListener("pointerdown", onDown, true);
    return () => {
      removeEventListener("keydown", onKey, true);
      removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  const choose = (c) => {
    setHsv(hexToHsv(c));
    setTyped(null);
  };
  const ok = () => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(pushRecent(recent, hex)));
    } catch {
      /* ignore */
    }
    onPick(hex);
  };

  return (
    <div className="colm" ref={root} style={{ left: pos.x, top: pos.y }} role="dialog" aria-label={title}>
      <b className="colm-title">{title}</b>
      <div className="colm-top">
        <div
          className="colm-sv"
          ref={svRef}
          {...svDrag}
          style={{ "--hue": `hsl(${hsv.h} 100% 50%)` }}
          role="slider"
          aria-label="Shade"
          aria-valuetext={hex}
          tabIndex={0}
          onKeyDown={(e) => {
            const step = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, 0.02], ArrowDown: [0, -0.02] }[e.key];
            if (step) (e.preventDefault(), setHsv((c) => ({ ...c, s: clamp01(c.s + step[0]), v: clamp01(c.v + step[1]) })));
          }}
        >
          <i style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
        </div>
        <div className="colm-side">
          <div className="colm-preview" style={{ background: hex }} aria-hidden="true" />
          <label className="colm-hex">
            <span>Hex</span>
            <input
              value={typed ?? hex}
              maxLength={7}
              spellCheck="false"
              onChange={(e) => {
                setTyped(e.target.value);
                const c = parseHex(e.target.value);
                if (c) setHsv(hexToHsv(c));
              }}
              onBlur={() => setTyped(null)}
              onKeyDown={(e) => e.key === "Enter" && ok()}
            />
          </label>
        </div>
      </div>
      <div
        className="colm-hue"
        ref={hueRef}
        {...hueDrag}
        role="slider"
        aria-label="Colour"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        tabIndex={0}
        onKeyDown={(e) => {
          const d = { ArrowLeft: -4, ArrowRight: 4 }[e.key];
          if (d) (e.preventDefault(), setHsv((c) => ({ ...c, h: (c.h + d + 360) % 360 })));
        }}
      >
        <i style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }} />
      </div>

      <span className="colm-lbl">Basic colours</span>
      <div className="colm-dots">
        {BASIC.map((c) => (
          <button key={c} className={`colm-dot${c === hex ? " on" : ""}`} style={{ background: c }} onClick={() => choose(c)} aria-label={c} title={c} />
        ))}
      </div>
      <span className="colm-lbl">Your colours</span>
      <div className="colm-dots">
        {Array.from({ length: 12 }, (_, i) =>
          recent[i] ? (
            <button key={recent[i]} className={`colm-dot${recent[i] === hex ? " on" : ""}`} style={{ background: recent[i] }} onClick={() => choose(recent[i])} aria-label={recent[i]} title={recent[i]} />
          ) : (
            <span key={`e${i}`} className="colm-dot colm-empty" aria-hidden="true" />
          )
        )}
      </div>
      <div className="colm-foot">
        <button className="colm-btn" onClick={onClose}>
          Cancel
        </button>
        <button className="colm-btn colm-ok" onClick={ok}>
          OK
        </button>
      </div>
    </div>
  );
}
