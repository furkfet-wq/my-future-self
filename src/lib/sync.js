// Saves the signed-in person's data online: 2 s after the last change, again when the tab is hidden or closed,
// and picks up newer copies saved from another device when the tab comes back.
// Every save carries the version this copy was based on, so it can never overwrite a newer online copy.
import { useCallback, useEffect, useRef } from "react";
import { getDoc, putDoc } from "./cloud.js";
import { DIRTY_KEY, VERSION_KEY } from "./startup.js";
import { DOC_VERSION, cleanDoc, sameDoc } from "../../shared/doc.js";

const SAVE_AFTER_MS = 2000;
const RETRY_MS = 30000;
const KEEPALIVE_MAX = 60000; // browsers cap keepalive bodies at 64 KB

const isDirty = () => localStorage.getItem(DIRTY_KEY) === "1";

export function useCloudSave({ userId, state, settings, startVersion, onRemote, offline = false }) {
  const version = useRef(startVersion);
  const latest = useRef(null);
  const pending = useRef(false); // this tab has a change that is not saved yet
  const timer = useRef(null);
  const busy = useRef(false);
  const first = useRef(true);
  const skipNext = useRef(false);
  const blockedUntil = useRef(0); // daily limit reached: no save tries before this time
  const onRemoteRef = useRef(onRemote);
  onRemoteRef.current = onRemote;
  latest.current = { v: DOC_VERSION, state, settings };

  const setVersion = (v) => {
    version.current = v;
    localStorage.setItem(VERSION_KEY, String(v));
  };

  const takeRemote = useCallback((data, v) => {
    setVersion(v);
    pending.current = false;
    localStorage.removeItem(DIRTY_KEY);
    const doc = cleanDoc(data);
    if (!doc || sameDoc(doc, latest.current)) return; // nothing new (e.g. our own last save already arrived)
    skipNext.current = true;
    onRemoteRef.current(doc);
  }, []);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    if (busy.current) {
      timer.current = setTimeout(save, SAVE_AFTER_MS);
      return;
    }
    if (!pending.current && !isDirty()) return;
    if (Date.now() < blockedUntil.current) {
      timer.current = setTimeout(save, blockedUntil.current - Date.now());
      return;
    }
    busy.current = true;
    const sent = latest.current;
    try {
      const r = await putDoc(sent, version.current, userId);
      if (r.conflict) takeRemote(r.conflict.data, r.conflict.version);
      else {
        setVersion(r.version);
        if (latest.current.state === sent.state && latest.current.settings === sent.settings) {
          pending.current = false;
          localStorage.removeItem(DIRTY_KEY);
        }
      }
    } catch (e) {
      // 403: another account signed in on this browser meanwhile; 401: signed out (e.g. "Sign out everywhere")
      if (e.status === 403 || e.status === 401) return location.reload();
      // 429: daily limit reached. Each refused try still costs a Cloudflare request, so wait until it resets
      // (plus a random minute so every tab doesn't come back at once); the change stays in this browser meanwhile.
      const wait = e.status === 429 ? Math.max(RETRY_MS, (e.retryAfterS || 1800) * 1000 + Math.random() * 60000) : RETRY_MS;
      if (e.status === 429) blockedUntil.current = Date.now() + wait;
      timer.current = setTimeout(save, wait); // offline or server trouble: try again later, the change stays in this browser
    } finally {
      busy.current = false;
    }
  }, [takeRemote, userId]);

  // every change: mark it unsaved and save shortly
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!isDirty()) return;
      pending.current = true;
    } else if (skipNext.current) {
      skipNext.current = false;
      return;
    } else {
      pending.current = true;
      localStorage.setItem(DIRTY_KEY, "1");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(save, offline ? RETRY_MS : SAVE_AFTER_MS);
  }, [state, settings, save, offline]);

  useEffect(() => {
    const onVisibility = async () => {
      if (document.visibilityState === "hidden") {
        if (pending.current) save(); // phones often close hidden tabs without warning
        return;
      }
      if (pending.current || isDirty()) return save();
      try {
        const r = await getDoc();
        if (r.data && r.version > version.current && !pending.current) takeRemote(r.data, r.version);
      } catch (e) {
        // signed out from another device ("Sign out everywhere") or another account here: back to sign-in
        if (e.status === 401 || e.status === 403) location.reload();
        /* otherwise offline: keep what we have */
      }
    };
    const onHide = () => {
      if (!pending.current || busy.current || Date.now() < blockedUntil.current) return;
      const body = latest.current;
      if (JSON.stringify(body).length < KEEPALIVE_MAX) putDoc(body, version.current, userId, true).catch(() => {});
      // the dirty flag stays: on the next start the copy is sent again with its old version;
      // if this save did arrive, that gives a conflict with identical data, which is taken silently
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      clearTimeout(timer.current);
    };
  }, [save, takeRemote, userId]);

  // used before signing out, so the last change is not lost
  return useCallback(async () => {
    while (busy.current) await new Promise((r) => setTimeout(r, 100));
    await save();
  }, [save]);
}
