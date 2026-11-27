import { useCallback, useEffect, useState } from "react";
import App from "./App.jsx";
import SignIn, { googleSignOut } from "./components/SignIn.jsx";
import { getMe, getDoc, putDoc, logout, deleteAccount } from "./lib/cloud.js";
import { decideStart, readLocalDoc, writeLocalDoc, clearLocal, OWNER_KEY, DIRTY_KEY } from "./lib/startup.js";
import { validateDoc } from "../shared/doc.js";

// Data carried over from the old address in the link's #move=... part (never sent to any server).
function importFromLink() {
  const h = location.hash;
  if (!h.startsWith("#move=")) return false;
  history.replaceState(null, "", location.pathname + location.search);
  try {
    const b64 = h.slice(6).replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const doc = JSON.parse(new TextDecoder().decode(bytes));
    if (!validateDoc(doc) || localStorage.getItem(OWNER_KEY)) return false;
    writeLocalDoc(doc, null);
    return true;
  } catch {
    return false;
  }
}

const OFFLINE_MSG = "Can't reach My Future Self right now. Check your internet and try again.";

/* In front of the app: sign-in, then picks which copy of the data to start from. */
export default function Gate() {
  const [phase, setPhase] = useState("checking"); // checking | signin | ask | ready
  const [user, setUser] = useState(null);
  const [version, setVersion] = useState(0);
  const [ask, setAsk] = useState(null);
  const [error, setError] = useState("");
  const [imported] = useState(importFromLink);

  async function apply(choice, me, local, remote, v) {
    if (choice === "remote") {
      writeLocalDoc(remote, me.id);
      setVersion(v);
    } else if (choice === "upload") {
      const r = await putDoc(local, v);
      if (r.conflict) {
        writeLocalDoc(r.conflict.data, me.id);
        setVersion(r.conflict.version);
      } else {
        writeLocalDoc(local, me.id);
        setVersion(r.version);
      }
    } else {
      clearLocal();
      localStorage.setItem(OWNER_KEY, me.id);
      setVersion(v);
    }
    setUser(me);
    setPhase("ready");
  }

  const afterSignIn = useCallback(async (me) => {
    setPhase("checking");
    try {
      const { data, version: v } = await getDoc();
      const local = readLocalDoc();
      const choice = decideStart({
        userId: me.id,
        localOwner: localStorage.getItem(OWNER_KEY),
        localState: local?.state ?? null,
        localDirty: localStorage.getItem(DIRTY_KEY) === "1",
        remote: data,
      });
      if (choice === "ask") {
        setUser(me);
        setAsk({ local, remote: data, version: v });
        setPhase("ask");
      } else await apply(choice, me, local, data, v);
    } catch {
      setError(OFFLINE_MSG);
      setPhase("signin");
    }
  }, []);

  const start = useCallback(async () => {
    setPhase("checking");
    setError("");
    let me;
    try {
      me = await getMe();
    } catch {
      // offline: someone who already signed in on this browser keeps using their copy; it saves when back online
      const owner = localStorage.getItem(OWNER_KEY);
      if (owner && readLocalDoc()) {
        setUser({ id: owner, offline: true });
        setVersion(null);
        setPhase("ready");
        return;
      }
      setError(OFFLINE_MSG);
      setPhase("signin");
      return;
    }
    if (me) afterSignIn(me);
    else setPhase("signin");
  }, [afterSignIn]);

  useEffect(() => {
    start();
  }, [start]);

  async function signOut() {
    try {
      await logout();
    } catch {
      /* the cookie ends anyway when it runs out */
    }
    clearLocal();
    googleSignOut();
    location.reload();
  }

  async function removeAccount() {
    await deleteAccount(); // throws if it did not work, so the menu can say so
    clearLocal();
    googleSignOut();
    location.reload();
  }

  if (phase === "checking") return <div className="lk" aria-busy="true" />;
  if (phase === "signin") return <SignIn onSignedIn={afterSignIn} error={error} imported={imported} onRetry={error ? start : null} />;
  if (phase === "ask")
    return (
      <div className="lk">
        <div className="lk-box">
          <h1>Which data do you want?</h1>
          <p className="lk-sub">This device has its own entries, and your account already has saved data.</p>
          <p className="lk-note">The one you don't pick is deleted.</p>
          <div className="ask-row">
            <button className="ask-btn" onClick={() => apply("remote", user, ask.local, ask.remote, ask.version)}>
              Keep my online data
            </button>
            <button className="ask-btn" onClick={() => apply("upload", user, ask.local, ask.remote, ask.version)}>
              Replace it with this device's data
            </button>
          </div>
        </div>
      </div>
    );
  return <App key={user.id} user={user} startVersion={version} onSignOut={signOut} onDeleteAccount={removeAccount} />;
}
