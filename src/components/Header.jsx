import { useState } from "react";
import { MONTH_NAMES } from "../lib/dates.js";
import { StatCount } from "./Charts.jsx";

export default function Header({ year, month0, onPrev, onNext, onToday, balance, startBalance, onStartBalance }) {
  const [text, setText] = useState(String(startBalance));
  return (
    <header className="hd">
      <div className="hd-month">
        <button onClick={onPrev} aria-label="Previous month">‹</button>
        <h1>
          {MONTH_NAMES[month0]} <span>{year}</span>
        </h1>
        <button onClick={onNext} aria-label="Next month">›</button>
        <button className="hd-today" onClick={onToday}>Today</button>
      </div>
      <div className="hd-money">
        <div className="hd-balance">
          <span>Total money</span>
          <b>
            <StatCount value={balance} prefix="£" decimals={Number.isInteger(balance) ? 0 : 2} />
          </b>
        </div>
        <label className="hd-start">
          <span>Started with £</span>
          <input
            type="number"
            step="0.01"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n)) onStartBalance(n);
            }}
            onBlur={() => setText(String(startBalance))}
            aria-label="Starting balance in pounds"
          />
        </label>
      </div>
    </header>
  );
}
