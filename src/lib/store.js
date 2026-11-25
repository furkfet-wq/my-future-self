import { useEffect, useReducer } from "react";

const STORAGE_KEY = "habit-tracker-v1";

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

function seed() {
  return {
    habits: [
      "Wake up before 7:00 AM",
      "Drink 3L of water",
      "Workout",
      "2h deep work",
      "Read 20 pages",
    ].map((name) => ({ id: uid(), name })),
    checks: {},
    logs: {},
    salah: {},
    startBalance: 0,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.habits)) return seed();
    return {
      habits: s.habits,
      checks: s.checks || {},
      logs: s.logs || {},
      salah: s.salah || {},
      startBalance: Number.isFinite(s.startBalance) ? s.startBalance : 0,
    };
  } catch {
    return seed();
  }
}

function reducer(state, action) {
  switch (action.type) {
    case "toggle": {
      const { key, id } = action;
      const day = { ...(state.checks[key] || {}) };
      if (day[id]) delete day[id];
      else day[id] = true;
      const checks = { ...state.checks };
      if (Object.keys(day).length) checks[key] = day;
      else delete checks[key];
      return { ...state, checks };
    }
    case "addHabit": {
      const name = action.name.trim();
      if (!name) return state;
      return { ...state, habits: [...state.habits, { id: uid(), name }] };
    }
    case "deleteHabit": {
      const checks = {};
      for (const [k, day] of Object.entries(state.checks)) {
        const { [action.id]: _drop, ...rest } = day;
        if (Object.keys(rest).length) checks[k] = rest;
      }
      return { ...state, habits: state.habits.filter((h) => h.id !== action.id), checks };
    }
    case "renameHabit": {
      const name = action.name.trim().slice(0, 60);
      if (!name) return state;
      return { ...state, habits: state.habits.map((h) => (h.id === action.id ? { ...h, name } : h)) };
    }
    case "moveHabit": {
      const { from, to } = action;
      const n = state.habits.length;
      if (from === to || from < 0 || to < 0 || from >= n || to >= n) return state;
      const habits = [...state.habits];
      const [h] = habits.splice(from, 1);
      habits.splice(to, 0, h);
      return { ...state, habits };
    }
    case "setLog": {
      const merged = { ...(state.logs[action.key] || {}), ...action.patch };
      const empty = ["feel", "productive", "energy", "money", "spent", "distracted"].every((f) => merged[f] == null);
      const logs = { ...state.logs };
      if (empty) delete logs[action.key];
      else logs[action.key] = merged;
      return { ...state, logs };
    }
    case "toggleSalah": {
      const { key, id } = action;
      const day = { ...(state.salah?.[key] || {}) };
      if (day[id]) delete day[id];
      else day[id] = true;
      const salah = { ...(state.salah || {}) };
      if (Object.keys(day).length) salah[key] = day;
      else delete salah[key];
      return { ...state, salah };
    }
    case "setStartBalance":
      return { ...state, startBalance: Number.isFinite(action.value) ? action.value : 0 };
    default:
      return state;
  }
}

export function useStore() {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked: keep working in memory */
    }
  }, [state]);

  const actions = {
    toggle: (key, id) => dispatch({ type: "toggle", key, id }),
    addHabit: (name) => dispatch({ type: "addHabit", name }),
    deleteHabit: (id) => dispatch({ type: "deleteHabit", id }),
    renameHabit: (id, name) => dispatch({ type: "renameHabit", id, name }),
    moveHabit: (from, to) => dispatch({ type: "moveHabit", from, to }),
    setLog: (key, patch) => dispatch({ type: "setLog", key, patch }),
    setStartBalance: (value) => dispatch({ type: "setStartBalance", value }),
    toggleSalah: (key, id) => dispatch({ type: "toggleSalah", key, id }),
  };
  return [state, actions];
}
