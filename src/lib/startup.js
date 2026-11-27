// The browser's copy of the saved data, and the choice of which copy to start from after sign-in.
// No React here, so it can be tested with plain `node --test`.
import { validateDoc, DOC_VERSION } from "../../shared/doc.js";

export const STORAGE_KEY = "habit-tracker-v1";
export const SETTINGS_KEY = "mfs-settings-v1";
export const OWNER_KEY = "mfs-owner-v1"; // Google account id the browser copy belongs to
export const DIRTY_KEY = "mfs-dirty-v1"; // "1" while a change is not saved online yet

const nonEmpty = (o) => !!o && typeof o === "object" && Object.keys(o).length > 0;

// Has this person actually entered anything? (The starter habits alone don't count.)
export function hasEntries(state) {
  if (!state) return false;
  return nonEmpty(state.checks) || nonEmpty(state.logs) || nonEmpty(state.salah) || (Number(state.startBalance) || 0) !== 0;
}

/**
 * "remote": use the online copy. "upload": send this browser's copy online.
 * "ask": both have data and the browser copy has no owner yet. "fresh": start empty.
 */
export function decideStart({ userId, localOwner, localState, localDirty, remote }) {
  if (localOwner && localOwner !== userId) return remote ? "remote" : "fresh"; // someone else's copy: never used
  if (localOwner === userId) {
    if (localState && (localDirty || !remote)) return "upload";
    return remote ? "remote" : "fresh";
  }
  if (hasEntries(localState)) return remote ? "ask" : "upload";
  return remote ? "remote" : "fresh";
}

const read = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || "null");
  } catch {
    return null;
  }
};

export function readLocalDoc() {
  const doc = { v: DOC_VERSION, state: read(STORAGE_KEY), settings: read(SETTINGS_KEY) || {} };
  if (doc.state && !Number.isFinite(doc.state.startBalance)) doc.state = { ...doc.state, startBalance: 0 };
  if (doc.state) doc.state = { checks: {}, logs: {}, salah: {}, ...doc.state };
  return validateDoc(doc) ? doc : null;
}

export function writeLocalDoc(doc, owner) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doc.state));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(doc.settings || {}));
  if (owner) localStorage.setItem(OWNER_KEY, owner);
  else localStorage.removeItem(OWNER_KEY);
  localStorage.removeItem(DIRTY_KEY);
}

export function clearLocal() {
  for (const k of [STORAGE_KEY, SETTINGS_KEY, OWNER_KEY, DIRTY_KEY]) localStorage.removeItem(k);
}
