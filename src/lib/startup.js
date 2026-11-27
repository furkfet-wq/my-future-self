// The browser's copy of the saved data, and the choice of which copy to start from after sign-in.
// No React here, so it can be tested with plain `node --test`.
import { cleanDoc, DOC_VERSION } from "../../shared/doc.js";

export const STORAGE_KEY = "habit-tracker-v1";
export const SETTINGS_KEY = "mfs-settings-v1";
export const OWNER_KEY = "mfs-owner-v1"; // Google account id the browser copy belongs to
export const DIRTY_KEY = "mfs-dirty-v1"; // "1" while a change is not saved online yet
export const VERSION_KEY = "mfs-version-v1"; // online version the browser copy was last saved as / loaded from

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
export function decideStart({ userId, localOwner, localState, localDirty, localVersion = 0, remote }) {
  if (localOwner && localOwner !== userId) return remote ? "remote" : "fresh"; // someone else's copy: never used
  if (localOwner === userId) {
    if (!remote && localVersion > 0) return "fresh"; // it was online once and is gone: the account was deleted elsewhere
    if (localState && (localDirty || !remote)) return "upload"; // sent with localVersion, so newer online data is never overwritten
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
  const state = read(STORAGE_KEY);
  return state ? cleanDoc({ v: DOC_VERSION, state, settings: read(SETTINGS_KEY) || {} }) : null;
}

export function localVersion() {
  const v = Number(localStorage.getItem(VERSION_KEY));
  return Number.isInteger(v) && v > 0 ? v : 0;
}

export function writeLocalDoc(doc, owner, version = 0) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doc.state));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(doc.settings || {}));
  if (owner) localStorage.setItem(OWNER_KEY, owner);
  else localStorage.removeItem(OWNER_KEY);
  localStorage.removeItem(DIRTY_KEY);
  localStorage.setItem(VERSION_KEY, String(version));
}

export function clearLocal() {
  for (const k of [STORAGE_KEY, SETTINGS_KEY, OWNER_KEY, DIRTY_KEY, VERSION_KEY]) localStorage.removeItem(k);
}
