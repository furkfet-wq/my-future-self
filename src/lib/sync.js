// Saves the signed-in person's data online: 2 s after the last change, again on leaving the page,
// and picks up newer copies saved from another device when the tab comes back.
import { useCallback, useEffect, useRef } from "react";
import { getDoc, putDoc } from "./cloud.js";
import { DIRTY_KEY } from "./startup.js";
import { DOC_VERSION } from "../../shared/doc.js";

const SAVE_AFTER_MS = 2000;
const RETRY_MS = 30000;
const KEEPALIVE_MAX = 60000; // browsers cap keepalive bodies at 64 KB

const isDirty = () => localStorage.getItem(DIRTY_KEY) === "1";

export function useCloudSave({ state, settings, startVersion, onRemote, offline = false }) {
  const version = useRef(startVersion);
  const latest = useRef(null);
  const timer = useRef(null);
  const busy = useRef(false);
  const first = useRef(true);
  const skipNext = useRef(false);
  const onRemoteRef = useRef(onRemote);
  onRemoteRef.current = onRemote;
  latest.current = { v: DOC_VERSION, state, settings };

  const takeRemote = useCallback((data, v) => {
    version.current = v;
    localStorage.removeItem(DIRTY_KEY);
    skipNext.current = true;
    onRemoteRef.current(data);
  }, []);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    if (busy.current) {
      timer.current = setTimeout(save, SAVE_AFTER_MS);
      return;
    }
    if (!isDirty()) return;
    busy.current = true;
    const sent = latest.current;
    try {
      // started offline: learn the online version first (this device's changes then win)
      if (version.current == null) version.current = (await getDoc()).version;
      const r = await putDoc(sent, version.current);
      if (r.conflict) takeRemote(r.conflict.data, r.conflict.version);
      else {
        version.current = r.version;
        if (latest.current === sent) localStorage.removeItem(DIRTY_KEY);
      }
    } catch {
      timer.current = setTimeout(save, RETRY_MS); // offline or server trouble: try again later, the change stays in this browser
    } finally {
      busy.current = false;
    }
  }, [takeRemote]);

  // every change: mark it unsaved and save shortly
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!isDirty()) return;
    } else if (skipNext.current) {
      skipNext.current = false;
      return;
    } else {
      localStorage.setItem(DIRTY_KEY, "1");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(save, offline ? RETRY_MS : SAVE_AFTER_MS);
  }, [state, settings, save, offline]);

  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      if (isDirty()) return save();
      try {
        const r = await getDoc();
        if (r.data && r.version > version.current && !isDirty()) takeRemote(r.data, r.version);
      } catch {
        /* offline: keep what we have */
      }
    };
    const onHide = () => {
      if (!isDirty() || busy.current) return;
      const body = latest.current;
      if (version.current != null && JSON.stringify(body).length < KEEPALIVE_MAX) putDoc(body, version.current, true).catch(() => {});
      // the dirty flag stays: if this last save did not make it, it is sent on the next start
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
      clearTimeout(timer.current);
    };
  }, [save, takeRemote]);

  // used before signing out, so the last change is not lost
  return useCallback(async () => {
    while (busy.current) await new Promise((r) => setTimeout(r, 100));
    await save();
  }, [save]);
}
