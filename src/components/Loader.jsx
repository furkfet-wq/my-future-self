import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

const COLS = 7;
const ROWS = 4;
const TOTAL = COLS * ROWS;

// White curtain with an empty habit grid. Boxes tick black one by one while a counter runs to 100,
// then the curtain lifts to reveal the app.
export default function Loader({ onLift, onDone }) {
  const root = useRef(null);
  const pct = useRef(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: reduce)", () => {
        onLift();
        gsap.to(root.current, { opacity: 0, duration: 0.25, delay: 0.15, onComplete: onDone });
      });

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const counter = { v: 0 };
        const order = gsap.utils.shuffle(gsap.utils.toArray(".ld-box"));
        const tl = gsap.timeline({ onComplete: onDone });

        tl.from(".ld-title span", { yPercent: 110, duration: 0.7, ease: "power4.out", stagger: 0.08 })
          .from(".ld-box", { scale: 0, duration: 0.4, ease: "back.out(2)", stagger: { amount: 0.5, from: "start" } }, 0.15)
          .to(
            order,
            { backgroundColor: "#000", scale: 1, duration: 0.18, stagger: { amount: 1.15 }, ease: "power2.out" },
            0.9
          )
          .to(
            counter,
            {
              v: 100,
              duration: 1.35,
              ease: "power1.inOut",
              onUpdate: () => {
                if (pct.current) pct.current.textContent = Math.round(counter.v);
              },
            },
            0.9
          )
          .to(".ld-meta", { opacity: 0, duration: 0.25 }, 2.4)
          .to(".ld-grid", { scale: 1.15, opacity: 0, duration: 0.45, ease: "power2.in" }, 2.4)
          .call(onLift, null, 2.6)
          .to(root.current, { yPercent: -100, duration: 0.85, ease: "power4.inOut" }, 2.65);
      });
    },
    { scope: root }
  );

  return (
    <div className="loader" ref={root} aria-hidden="true">
      <div className="ld-inner">
        <h1 className="ld-title">
          <span>My</span> <span>Future</span> <span>Self</span>
        </h1>
        <div className="ld-grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
          {Array.from({ length: TOTAL }, (_, i) => (
            <div className="ld-box" key={i} />
          ))}
        </div>
        <div className="ld-meta">
          <span className="ld-pct">
            <b ref={pct}>0</b>%
          </span>
          <span>done</span>
        </div>
      </div>
    </div>
  );
}
