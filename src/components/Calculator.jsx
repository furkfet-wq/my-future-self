import { useEffect, useRef, useState } from "react";
import { evaluate, formatNumber, isOp, press } from "../lib/calc.js";
import "./calculator.css";

const WIN_KEY = "mfs-calc-win-v1";
const W = 300;

/* Calculator button: the keys light up one by one on hover. */
export function CalculatorButton({ onClick }) {
  return (
    <button className="tool-btn calc-btn" onClick={onClick} aria-label="Open calculator" title="Calculator">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
        <path d="M8 6.5h8" />
        <circle className="ck ck1" cx="9" cy="11.5" r="0.9" />
        <circle className="ck ck2" cx="12" cy="11.5" r="0.9" />
        <circle className="ck ck3" cx="15" cy="11.5" r="0.9" />
        <circle className="ck ck4" cx="9" cy="15" r="0.9" />
        <circle className="ck ck5" cx="12" cy="15" r="0.9" />
        <circle className="ck ck6" cx="15" cy="15" r="0.9" />
        <path d="M8.5 18.5h7" />
      </svg>
    </button>
  );
}

function loadPos() {
  try {
    const v = JSON.parse(localStorage.getItem(WIN_KEY) || "null");
    if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return fit(v);
  } catch {
    /* ignore */
  }
  return fit({ x: innerWidth - W - 40, y: 90 });
}
const fit = (v) => ({ x: Math.max(0, Math.min(v.x, innerWidth - W)), y: Math.max(0, Math.min(v.y, innerHeight - 120)) });

const KEYS = [
  ["C", "⌫", "%", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["±", "0", ".", "="],
];
const LABELS = { C: "Clear", "⌫": "Delete last", "%": "Percent", "÷": "Divide", "×": "Times", "−": "Minus", "+": "Plus", "±": "Plus or minus", "=": "Equals", ".": "Point" };
const FROM_KEYBOARD = { "*": "×", x: "×", X: "×", "/": "÷", "-": "−", "+": "+", Enter: "=", "=": "=", Backspace: "⌫", Delete: "C", ",": ".", ".": ".", "%": "%" };

/* The calculator window: small, black, drag the top bar to move. Works with the keyboard too. */
export function Calculator({ onClose }) {
  const [pos, setPosState] = useState(loadPos);
  const [s, setS] = useState({ expr: "", done: false, prev: "", err: "" });
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState(null);
  const root = useRef(null);
  const setPos = (v) => {
    const next = fit(v);
    setPosState(next);
    try {
      localStorage.setItem(WIN_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const hit = (key) => {
    setS((cur) => press(cur, key));
    setFlash(key);
    setCopied(false);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // typing in the notepad or any other box belongs to that box
      const t = e.target;
      const typing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (typing && !root.current?.contains(t)) return;
      if (e.key === "Escape") return onClose();
      const key = /^\d$/.test(e.key) ? e.key : FROM_KEYBOARD[e.key];
      if (!key) return;
      e.preventDefault();
      hit(key);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const onResize = () => setPosState((v) => fit(v));
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);

  function drag(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, ...pos };
    const move = (ev) => setPos({ x: start.x + ev.clientX - start.px, y: start.y + ev.clientY - start.py });
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }

  const preview = !s.done && s.expr && /[+−×÷%]/.test(s.expr.slice(1)) ? evaluate(s.expr) : null;
  const shown = s.expr || "0";

  async function copy() {
    try {
      await navigator.clipboard.writeText(shown.replace(/−/g, "-"));
      setCopied(true);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  }

  return (
    <div className="calc" style={{ left: pos.x, top: pos.y, width: W }} role="dialog" aria-modal="false" aria-label="Calculator" ref={root}>
      <div className="calc-bar" onPointerDown={(e) => !e.target.closest("button") && drag(e)}>
        <b>Calculator</b>
        <button className="np-icon calc-copy" onClick={copy} aria-label="Copy the number" title="Copy the number">
          {copied ? "✓" : (
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <rect x="8" y="8" width="12" height="12" rx="2" />
              <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
            </svg>
          )}
        </button>
        <button className="np-icon" onClick={onClose} aria-label="Close calculator" title="Close">
          ×
        </button>
      </div>
      <div className="calc-screen" aria-live="polite">
        <div className="calc-prev">{s.err || s.prev || " "}</div>
        <div className={`calc-main${shown.length > 14 ? " small" : ""}`}>{shown}</div>
        <div className="calc-preview">{preview === null ? " " : `= ${formatNumber(preview)}`}</div>
      </div>
      <div className="calc-keys">
        {KEYS.flat().map((k) => (
          <button
            key={k}
            className={`calc-key${isOp(k) ? " op" : ""}${k === "=" ? " eq" : ""}${flash === k ? " hit" : ""}`}
            onClick={() => hit(k)}
            onAnimationEnd={() => setFlash(null)}
            aria-label={LABELS[k] || k}
            title={LABELS[k]}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
