import { useEffect, useRef, useState } from "react";

/* Round account button next to the Settings gear: Google picture, menu with Sign out and Delete my account. */
export default function Account({ user, onSignOut, onDeleteAccount }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0); // 0 menu, 1 first "are you sure", 2 last warning
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [imgOk, setImgOk] = useState(true);
  const root = useRef(null);

  const close = () => {
    setOpen(false);
    setStep(0);
    setMsg("");
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && close();
    const onDown = (e) => !root.current?.contains(e.target) && close();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const letter = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();

  async function run(fn, failText) {
    setBusy(true);
    setMsg("");
    try {
      await fn();
    } catch {
      setMsg(failText);
      setBusy(false);
    }
  }

  return (
    <div className="acc" ref={root}>
      <button
        className="acc-btn"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your account"
        title="Your account"
      >
        {user?.picture && imgOk ? (
          <img src={user.picture} alt="" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />
        ) : (
          <span>{letter}</span>
        )}
      </button>

      {open && (
        <div className="acc-menu" role="menu">
          {step === 0 && (
            <>
              <p className="acc-who">
                {user?.name && <b>{user.name}</b>}
                <span>{user?.offline ? "Offline: changes save when you're back online" : user?.email}</span>
              </p>
              <a className="acc-item" href="/privacy.html" role="menuitem">
                Privacy
              </a>
              <button className="acc-item" role="menuitem" disabled={busy} onClick={() => run(onSignOut, "Could not sign out. Try again.")}>
                Sign out
              </button>
              <button className="acc-item acc-danger" role="menuitem" disabled={busy || user?.offline} onClick={() => setStep(1)}>
                Delete my account
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <p className="acc-q">Delete your account and all your saved data?</p>
              <div className="acc-row">
                <button className="acc-item acc-danger" onClick={() => setStep(2)}>
                  Yes
                </button>
                <button className="acc-item" onClick={close}>
                  No
                </button>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <p className="acc-q">This cannot be undone. Delete everything?</p>
              <div className="acc-row">
                <button className="acc-item acc-danger" disabled={busy} onClick={() => run(onDeleteAccount, "Could not delete. Check your internet and try again.")}>
                  Delete forever
                </button>
                <button className="acc-item" disabled={busy} onClick={close}>
                  Cancel
                </button>
              </div>
            </>
          )}
          {msg && (
            <p className="acc-msg" role="alert">
              {msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
