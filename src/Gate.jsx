import { Component, useCallback, useEffect, useState } from "react";
import App from "./App.jsx";
import SignIn, { googleSignOut } from "./components/SignIn.jsx";
import { getMe, getDoc, putDoc, logout, logoutAll, deleteAccount } from "./lib/cloud.js";
import { decideStart, readLocalDoc, writeLocalDoc, clearLocal, localVersion, OWNER_KEY, DIRTY_KEY } from "./lib/startup.js";
import { cleanDoc, sameDoc } from "../shared/doc.js";

const IMPORT_KEY = "mfs-import-v1"; // sessionStorage: data brought from the old address, until the person decides

// Data carried over from the old address in the link's #move=... part (never sent to any server).
function importFromLink() {
  const h = location.hash;
  if (!h.startsWith("#move=")) return !!sessionStorage.getItem(IMPORT_KEY);
  history.replaceState(null, "", location.pathname + location.search);
  try {
    const b64 = h.slice(6).replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const doc = cleanDoc(JSON.parse(new TextDecoder().decode(bytes)));
    if (!doc) return false;
    sessionStorage.setItem(IMPORT_KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}
function pendingImport() {
  try {
    return cleanDoc(JSON.parse(sessionStorage.getItem(IMPORT_KEY) || "null"));
  } catch {
    return null;
  }
}

const OFFLINE_MSG = "Can't reach My Future Self right now. Check your internet and try again.";
const countDays = (s) => new Set([...Object.keys(s.checks), ...Object.keys(s.logs), ...Object.keys(s.salah)]).size;

/* If the app crashes, still offer a way out instead of a blank page. */
class Crash extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e) {
    console.error(e);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const { onSignOut, onDeleteAccount } = this.props;
    return (
      <div className="lk">
        <div className="lk-box">
          <h1>Something went wrong</h1>
          <p className="lk-sub">The app could not show your data.</p>
          <div className="ask-row">
            <button className="ask-btn" onClick={() => location.reload()}>Reload</button>
            <button className="ask-btn" onClick={onSignOut}>Sign out</button>
            <button
              className="lk-link"
              onClick={() => window.confirm("Delete your account and all your saved data? This cannot be undone.") && onDeleteAccount()}
            >
              Delete my account
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/* In front of the app: sign-in, then picks which copy of the data to start from. */
export default function Gate() {
  const [phase, setPhase] = useState("checking"); // checking | signin | import | ask | ready
  const [user, setUser] = useState(null);
  const [version, setVersion] = useState(0);
  const [ask, setAsk] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [imported] = useState(importFromLink);

  function keepCopy(doc, me, v) {
    writeLocalDoc(doc, me.id, v);
    setVersion(v);
  }

  // Sends `doc` as this account's data, based on online version `v`. A newer online copy is never overwritten:
  // identical -> just use it; different -> ask which one to keep.
  async function upload(doc, me, v) {
    const r = await putDoc(doc, v, me.id);
    if (!r.conflict) return keepCopy(doc, me, r.version);
    const online = cleanDoc(r.conflict.data);
    if (!online || sameDoc(online, doc)) return keepCopy(online || doc, me, r.conflict.version);
    setAsk({ local: doc, remote: online, version: r.conflict.version });
    setPhase("ask");
    return "asked";
  }

  async function finish(step) {
    setBusy(true);
    try {
      if ((await step()) !== "asked") setPhase("ready");
    } catch {
      setError(OFFLINE_MSG);
    } finally {
      setBusy(false);
    }
  }

  const decide = useCallback(async (me, data, v) => {
    const local = readLocalDoc();
    const owner = localStorage.getItem(OWNER_KEY);
    const choice = decideStart({
      userId: me.id,
      localOwner: owner,
      localState: local?.state ?? null,
      localDirty: localStorage.getItem(DIRTY_KEY) === "1",
      localVersion: localVersion(),
      remote: data,
    });
    if (choice === "ask") {
      setAsk({ local, remote: data, version: v });
      setPhase("ask");
    } else if (choice === "remote") {
      keepCopy(data, me, v);
      setPhase("ready");
    } else if (choice === "upload") {
      // our own unsaved copy goes up with the version it was based on; a first upload with the online version
      await finish(() => upload(local, me, owner === me.id ? localVersion() : v));
    } else {
      clearLocal();
      localStorage.setItem(OWNER_KEY, me.id);
      setVersion(v);
      setPhase("ready");
    }
  }, []);

  const afterSignIn = useCallback(
    async (me) => {
      setPhase("checking");
      setUser(me);
      try {
        const { data: raw, version: v } = await getDoc();
        const data = raw ? cleanDoc(raw) : null;
        const incoming = pendingImport();
        if (incoming) {
          setAsk({ local: incoming, remote: data, version: v, imported: true });
          setPhase("import");
        } else await decide(me, data, v);
      } catch {
        setError(OFFLINE_MSG);
        setPhase("signin");
      }
    },
    [decide]
  );

  const start = useCallback(async () => {
    setPhase("checking");
    setError("");
    let me;
    try {
      me = await getMe();
    } catch {
      // offline: someone who already signed in on this browser keeps using their copy; it saves when back online
      const owner = localStorage.getItem(OWNER_KEY);
      if (owner && readLocalDoc() && !pendingImport()) {
        setUser({ id: owner, offline: true });
        setVersion(localVersion());
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

  // another tab signed in to a different account (or out): this tab's data is no longer the right one
  useEffect(() => {
    if (phase !== "ready" || !user) return undefined;
    const onStorage = (e) => e.key === OWNER_KEY && e.newValue !== user.id && location.reload();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [phase, user]);

  // Throws when the server could not be reached, so the menu can say so (the session would otherwise stay valid).
  async function signOut(everywhere = false) {
    await (everywhere ? logoutAll() : logout());
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

  if (phase === "import") {
    const s = ask.local.state;
    const done = () => sessionStorage.removeItem(IMPORT_KEY);
    return (
      <div className="lk">
        <div className="lk-box">
          <h1>Import data from the old address?</h1>
          <p className="lk-sub">
            {s.habits.length} habits, {countDays(s)} days with entries.
          </p>
          {ask.remote && <p className="lk-note">Your account already has saved data. Importing replaces it.</p>}
          <div className="ask-row">
            <button
              className="ask-btn"
              disabled={busy}
              onClick={() => finish(async () => (await upload(ask.local, user, ask.version), done()))}
            >
              {ask.remote ? "Replace my online data with it" : "Import it"}
            </button>
            <button
              className="ask-btn"
              disabled={busy}
              onClick={() => {
                done();
                decide(user, ask.remote, ask.version);
              }}
            >
              {ask.remote ? "Keep my online data" : "Don't import"}
            </button>
          </div>
          <p className="lk-msg" role="alert">{error}</p>
        </div>
      </div>
    );
  }

  if (phase === "ask")
    return (
      <div className="lk">
        <div className="lk-box">
          <h1>Which data do you want?</h1>
          <p className="lk-sub">This device has entries that are different from your saved online data.</p>
          <p className="lk-note">The one you don't pick is deleted.</p>
          <div className="ask-row">
            <button
              className="ask-btn"
              disabled={busy}
              onClick={() => {
                keepCopy(ask.remote, user, ask.version);
                setPhase("ready");
              }}
            >
              Keep my online data
            </button>
            <button className="ask-btn" disabled={busy} onClick={() => finish(() => upload(ask.local, user, ask.version))}>
              Replace it with this device's data
            </button>
          </div>
          <p className="lk-msg" role="alert">{error}</p>
        </div>
      </div>
    );

  return (
    <Crash onSignOut={() => signOut(false).catch(() => alert("Could not sign out. Check your internet and try again."))} onDeleteAccount={removeAccount}>
      <App
        key={user.id}
        user={user}
        startVersion={version}
        onSignOut={() => signOut(false)}
        onSignOutEverywhere={() => signOut(true)}
        onDeleteAccount={removeAccount}
      />
    </Crash>
  );
}
