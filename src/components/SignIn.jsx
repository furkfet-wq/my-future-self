import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { GOOGLE_CLIENT_ID } from "../lib/config.js";
import { login } from "../lib/cloud.js";

const GIS_SRC = "https://accounts.google.com/gsi/client";
let gisLoading = null;
function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = GIS_SRC;
      s.async = true;
      s.onload = ok;
      s.onerror = () => {
        gisLoading = null;
        fail(new Error("Google sign-in could not load"));
      };
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}
export const googleSignOut = () => window.google?.accounts?.id?.disableAutoSelect?.();

/* Full-screen sign-in: nothing else of the app loads until the person signs in with Google. */
export default function SignIn({ onSignedIn, error, imported, onRetry }) {
  const root = useRef(null);
  const btn = useRef(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useGSAP(() => gsap.from(".lk-box", { y: 18, opacity: 0, duration: 0.5, ease: "power3.out" }), { scope: root });

  useEffect(() => {
    let live = true;
    loadGis()
      .then(() => {
        if (!live || !btn.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: "popup",
          auto_select: false,
          callback: async ({ credential }) => {
            setBusy(true);
            setMsg("");
            try {
              onSignedIn(await login(credential));
            } catch {
              setMsg("Sign-in did not work. Please try again.");
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(btn.current, { theme: "filled_black", shape: "pill", size: "large", text: "signin_with" });
      })
      .catch(() => live && setMsg("Google sign-in could not load. Check your internet and reload the page."));
    return () => {
      live = false;
    };
  }, [onSignedIn]);

  return (
    <div className="lk" ref={root}>
      <div className="lk-box">
        <h1>My Future Self</h1>
        <p className="lk-sub">Sign in with Google to keep your habits saved on every device.</p>
        {imported && <p className="lk-note">Your data from the old address is ready. Sign in to save it to your account.</p>}
        <div className="si-btn" ref={btn} aria-busy={busy} />
        {busy && <p className="lk-note">Signing in...</p>}
        <p className="lk-msg" role="alert">{msg || error}</p>
        {error && onRetry && (
          <button className="lk-link" onClick={onRetry}>
            Try again
          </button>
        )}
        <a className="lk-link" href="/privacy.html">
          Privacy
        </a>
      </div>
    </div>
  );
}
