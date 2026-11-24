import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { PIN_LENGTH, setPin, checkPin, recordTry, waitLeftMs, resetEverything } from "../lib/lock.js";
import { sfx } from "../lib/sound.js";

const STEPS = {
  setup: ["new", "confirm"],
  unlock: ["enter"],
  change: ["current", "new", "confirm"],
};
const PROMPT = {
  new: "Choose a 10-digit PIN",
  confirm: "Type the same PIN again",
  enter: "Enter your PIN",
  current: "Enter your current PIN",
};

/* Full-screen PIN screen: first-time setup, unlock, or change PIN. */
export default function Lock({ mode, onDone, onCancel }) {
  const root = useRef(null);
  const input = useRef(null);
  const [step, setStep] = useState(STEPS[mode][0]);
  const [pin, setPinText] = useState("");
  const [first, setFirst] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(waitLeftMs());
  const [forgot, setForgot] = useState(false);

  const { contextSafe } = useGSAP(
    () => {
      gsap.from(".lk-box", { y: 18, opacity: 0, duration: 0.5, ease: "power3.out" });
    },
    { scope: root }
  );
  const shake = contextSafe(() => {
    gsap.fromTo(".lk-dots", { x: 0 }, { keyframes: [{ x: -12 }, { x: 10 }, { x: -8 }, { x: 6 }, { x: 0 }], duration: 0.4 });
  });

  useEffect(() => {
    if (!wait) return undefined;
    const id = setInterval(() => setWait(waitLeftMs()), 500);
    return () => clearInterval(id);
  }, [wait]);

  // keep the cursor in the hidden PIN box: a disabled box loses focus while a PIN is being checked
  useEffect(() => {
    if (!busy && !wait) input.current?.focus();
  }, [step, forgot, busy, wait]);

  async function submit(value) {
    if (busy || wait) return;
    setBusy(true);
    try {
      if (step === "enter" || step === "current") {
        const ok = await checkPin(value);
        recordTry(ok);
        if (!ok) {
          sfx.undone();
          shake();
          setMsg("Wrong PIN");
          setPinText("");
          setWait(waitLeftMs());
          return;
        }
        sfx.done();
        if (step === "enter") return onDone();
        setStep("new");
        setMsg("");
      } else if (step === "new") {
        setFirst(value);
        setStep("confirm");
        setMsg("");
      } else if (step === "confirm") {
        if (value !== first) {
          sfx.undone();
          shake();
          setMsg("The two PINs did not match. Choose a new one.");
          setFirst("");
          setStep("new");
        } else {
          await setPin(value);
          sfx.done();
          return onDone();
        }
      }
      setPinText("");
    } finally {
      setBusy(false);
    }
  }

  function type(d) {
    if (busy || wait) return;
    setMsg("");
    const next = (pin + d).slice(0, PIN_LENGTH);
    setPinText(next);
    if (next.length === PIN_LENGTH) submit(next);
  }
  const back = () => setPinText((p) => p.slice(0, -1));

  if (forgot) {
    return (
      <div className="lk" ref={root}>
        <div className="lk-box">
          <h1>Forgot your PIN?</h1>
          <p className="lk-sub">
            The PIN cannot be recovered. The only way back in is to delete all of this app's data on this device: habits, salah,
            daily actions and settings. This cannot be undone.
          </p>
          <div className="lk-row">
            <button
              className="lk-danger"
              onClick={() => {
                resetEverything();
                window.location.reload();
              }}
            >
              Delete everything
            </button>
            <button className="lk-link" onClick={() => setForgot(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lk" ref={root} onClick={() => !busy && !wait && input.current?.focus()}>
      <div className="lk-box">
        <h1>My Future Self</h1>
        <p className="lk-sub">{PROMPT[step]}</p>
        {mode === "setup" && step === "new" && (
          <p className="lk-note">It is saved only as a scrambled code on this device. Nobody, including you, can read it back, so remember it.</p>
        )}

        <div className="lk-dots" aria-hidden="true">
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <i key={i} className={i < pin.length ? "on" : ""} />
          ))}
        </div>
        <input
          ref={input}
          className="lk-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-label={PROMPT[step]}
          value={pin}
          disabled={busy || !!wait}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH);
            setMsg("");
            setPinText(v);
            if (v.length === PIN_LENGTH) submit(v);
          }}
        />
        <p className="lk-msg" role="status">
          {wait ? `Too many wrong tries. Wait ${Math.ceil(wait / 1000)} s.` : msg}
        </p>

        <div className="lk-pad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} onClick={() => type(d)} disabled={busy || !!wait}>
              {d}
            </button>
          ))}
          <span />
          <button onClick={() => type("0")} disabled={busy || !!wait}>
            0
          </button>
          <button onClick={back} aria-label="Delete last digit" disabled={busy || !!wait}>
            ⌫
          </button>
        </div>

        <div className="lk-row">
          {mode === "unlock" && (
            <button className="lk-link" onClick={() => setForgot(true)}>
              Forgot PIN?
            </button>
          )}
          {onCancel && (
            <button className="lk-link" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
