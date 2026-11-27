import { useEffect, useRef, useState } from "react";

const GEO = "https://geocoding-api.open-meteo.com/v1/search";

// Asks the app's Worker for the namazvakitleri city nearest to a place.
async function nearest(lat, lon) {
  const res = await fetch(`/api/prayer-city?lat=${lat}&lon=${lon}`);
  if (!res.ok) throw new Error("no city");
  return res.json(); // { id, km }
}

/* Choose where prayer times are for: search a place, use this device's location, or go back to Coventry. */
export default function PlacePicker({ place, onPick, onClose }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // search 0.4 s after typing stops
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setResults([]);
      setMsg("");
      return undefined;
    }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`${GEO}?name=${encodeURIComponent(text)}&count=8&language=en&format=json`, { signal: ctrl.signal });
        if (!res.ok) throw new Error("search failed");
        const list = ((await res.json()).results || []).filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
        setResults(list);
        setMsg(list.length ? "" : "No places found. Try another spelling.");
      } catch (e) {
        if (e.name !== "AbortError") {
          setResults([]);
          setMsg("Could not search right now. Check your internet and try again.");
        }
      }
    }, 400);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);

  async function choose(name, region, country, lat, lon) {
    setBusy(true);
    setMsg("");
    try {
      const { id, km } = await nearest(lat, lon);
      onPick({ name, region: region || "", country: country || "", lat, lon, cityId: id, km });
    } catch {
      setMsg("Could not find prayer times for that place right now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setMsg("This browser cannot share your location.");
    setBusy(true);
    setMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => choose("My location", "", "", Math.round(pos.coords.latitude * 1000) / 1000, Math.round(pos.coords.longitude * 1000) / 1000),
      () => {
        setBusy(false);
        setMsg("Location was not shared. Search for your town instead.");
      },
      { timeout: 15000, maximumAge: 600000 }
    );
  }

  return (
    <div className="st pp">
      <div className="st-back" onClick={onClose} />
      <div className="st-panel" role="dialog" aria-modal="true" aria-label="Prayer times location">
        <div className="st-head">
          <h2>Prayer times location</h2>
          <button className="st-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="pp-now">Now: {place ? [place.name, place.country].filter(Boolean).join(", ") : "Coventry, United Kingdom"}</p>
        <input
          ref={input}
          className="pp-input"
          type="search"
          placeholder="Search a town or city"
          value={q}
          maxLength={80}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search a town or city"
        />
        <div className="pp-list" aria-busy={busy}>
          {results.map((r) => (
            <button
              key={r.id ?? `${r.latitude},${r.longitude}`}
              className="pp-item"
              disabled={busy}
              onClick={() => choose(r.name, r.admin1, r.country, r.latitude, r.longitude)}
            >
              {[r.name, r.admin1, r.country].filter(Boolean).join(", ")}
            </button>
          ))}
        </div>
        {msg && (
          <p className="pp-msg" role="alert">
            {msg}
          </p>
        )}
        <div className="pp-row">
          <button className="pp-btn" disabled={busy} onClick={useMyLocation}>
            Use my location
          </button>
          {place && (
            <button className="pp-btn" disabled={busy} onClick={() => onPick(null)}>
              Back to Coventry
            </button>
          )}
        </div>
        <p className="pp-note">Times come from namazvakitleri.com.tr, for their city nearest to the place you pick. Place search by Open-Meteo.</p>
      </div>
    </div>
  );
}
