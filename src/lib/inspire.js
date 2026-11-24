import { dateKey } from "./dates.js";

/* ------------------------------------------------------------------
   Daily Quran verse
   - Source: api.alquran.cloud (Arabic Uthmani text + Sahih International English).
   - Each day maps to one verse through a seeded shuffle of all 6236 verses, so the
     order is random and no verse repeats for 6236 days (about 17 years). After that
     a new shuffle (new seed) starts, so the order never repeats either.
------------------------------------------------------------------- */
export const TOTAL_AYAHS = 6236;
const EPOCH = new Date(2026, 10, 24); // day 0 = 24 Nov 2026

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const permCache = new Map();
function permutation(cycle) {
  if (permCache.has(cycle)) return permCache.get(cycle);
  const rand = mulberry32(0x9e3779b1 ^ (cycle * 0x85ebca6b));
  const arr = Array.from({ length: TOTAL_AYAHS }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  permCache.set(cycle, arr);
  return arr;
}

export function ayahNumberFor(date) {
  const day = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()) - EPOCH) / 86400000
  );
  const d = Math.max(0, day);
  return permutation(Math.floor(d / TOTAL_AYAHS))[d % TOTAL_AYAHS];
}

const VERSE_KEY = "mfs-verse-v1";

export async function loadDailyVerse(date = new Date()) {
  const key = dateKey(date);
  try {
    const cached = JSON.parse(localStorage.getItem(VERSE_KEY) || "null");
    if (cached && cached.date === key && wordCount(cached.english) <= MAX_VERSE_WORDS) return cached;
  } catch {
    /* ignore */
  }
  // the day's verse, unless it was already shown (e.g. through "New verse"), then a random unseen one
  let n = ayahNumberFor(date);
  if (seenVerses().has(n) || longVerses().has(n)) n = randomUnseen();
  const verse = await pickShort(n, key);
  markSeen(verse.number);
  saveCurrent(verse);
  return verse;
}

// "New verse" button: a random verse never shown before; it stays for the rest of the day.
export async function newVerse(date = new Date()) {
  const verse = await pickShort(randomUnseen(), dateKey(date));
  markSeen(verse.number);
  saveCurrent(verse);
  return verse;
}

// Only verses of 40 words or fewer (English translation). Longer ones are remembered and skipped.
const MAX_VERSE_WORDS = 40;
const LONG_VERSES = "mfs-verse-long-v1";
function longVerses() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LONG_VERSES) || "[]"));
  } catch {
    return new Set();
  }
}
function markLong(n) {
  const long = longVerses();
  long.add(n);
  try {
    localStorage.setItem(LONG_VERSES, JSON.stringify([...long]));
  } catch {
    /* ignore */
  }
}
async function pickShort(first, key) {
  let n = first;
  for (let i = 0; i < 12; i++) {
    const v = await fetchVerse(n, key);
    if (wordCount(v.english) <= MAX_VERSE_WORDS) return v;
    markLong(n);
    n = randomUnseen();
  }
  throw new Error("Could not find a short verse, try again");
}

const SEEN_VERSES = "mfs-verse-seen-v1";
function seenVerses() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_VERSES) || "[]"));
  } catch {
    return new Set();
  }
}
function markSeen(n) {
  const seen = seenVerses();
  seen.add(n);
  try {
    localStorage.setItem(SEEN_VERSES, JSON.stringify([...seen]));
  } catch {
    /* ignore */
  }
}
function randomUnseen() {
  let seen = seenVerses();
  if (seen.size + longVerses().size >= TOTAL_AYAHS) {
    // every verse has been shown (after thousands of days): start a new round
    seen = new Set();
    try {
      localStorage.setItem(SEEN_VERSES, "[]");
    } catch {
      /* ignore */
    }
  }
  const long = longVerses();
  let n;
  let guard = 0;
  do n = 1 + Math.floor(Math.random() * TOTAL_AYAHS);
  while ((seen.has(n) || long.has(n)) && ++guard < 100000);
  return n;
}
function saveCurrent(verse) {
  try {
    localStorage.setItem(VERSE_KEY, JSON.stringify(verse));
  } catch {
    /* ignore */
  }
}

async function fetchVerse(n, key) {
  const res = await fetch(`https://api.alquran.cloud/v1/ayah/${n}/editions/quran-uthmani,en.sahih`);
  if (!res.ok) throw new Error(`Quran service answered ${res.status}`);
  const json = await res.json();
  const [ar, en] = json.data;
  if (!ar || !en || ar.number !== n || en.number !== n) throw new Error("Unexpected verse data");

  let arabic = ar.text;
  // The first verse of each surah (except Al-Fatiha) carries the Bismillah prefix in this edition.
  if (ar.numberInSurah === 1 && ar.surah.number !== 1 && arabic.startsWith("بِسْمِ")) {
    arabic = arabic.split(" ").slice(4).join(" ");
  }
  return {
    date: key,
    number: n,
    arabic,
    english: en.text,
    surahNumber: ar.surah.number,
    surahEnglish: ar.surah.englishName,
    surahMeaning: ar.surah.englishNameTranslation,
    surahArabic: ar.surah.name,
    ayah: ar.numberInSurah,
  };
}

/* ------------------------------------------------------------------
   Motivational quote
   - Source: api.quotable.kurokeita.dev (real quotes with authors), tags:
     Motivational, Success, Inspirational, Change, Future, Character (257 quotes).
   - A new random quote every time the app opens (or on "New quote").
   - Never repeats until every quote has been shown; then a fresh random round starts
     (the last one shown is never first in the new round).
------------------------------------------------------------------- */
const POOL_KEY = "mfs-quotes-pool-v1";
const SEEN_KEY = "mfs-quotes-seen-v1";
const TAGS = "Motivational|Success|Inspirational|Change|Future|Character";
const WEEK = 7 * 86400000;

async function loadPool() {
  try {
    const cached = JSON.parse(localStorage.getItem(POOL_KEY) || "null");
    if (cached && cached.quotes?.length && Date.now() - cached.at < WEEK) return cached.quotes;
  } catch {
    /* ignore */
  }
  const quotes = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`https://api.quotable.kurokeita.dev/api/quotes?tags=${TAGS}&limit=100&page=${page}`);
    if (!res.ok) throw new Error(`Quote service answered ${res.status}`);
    const json = await res.json();
    for (const q of json.data || []) {
      if (q?.id && q.content && q.author?.name) quotes.push({ id: q.id, text: q.content, author: q.author.name, about: q.author.description || "" });
    }
    if (!json.metadata?.hasNextPage) break;
  }
  if (!quotes.length) throw new Error("No quotes came back");
  try {
    localStorage.setItem(POOL_KEY, JSON.stringify({ at: Date.now(), quotes }));
  } catch {
    /* ignore */
  }
  return quotes;
}

const MAX_WORDS = 30;
const wordCount = (t) => t.trim().split(/\s+/).filter(Boolean).length;

export async function nextQuote() {
  // only quotes of 30 words or fewer
  const pool = (await loadPool()).filter((q) => wordCount(q.text) <= MAX_WORDS);
  let seen;
  try {
    seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
  } catch {
    seen = {};
  }
  const ids = new Set(seen.ids || []);
  let fresh = pool.filter((q) => !ids.has(q.id));
  if (!fresh.length) {
    // every quote has been shown: new round, but never repeat the last one straight away
    ids.clear();
    fresh = pool.filter((q) => q.id !== seen.last);
  }
  const pick = fresh[Math.floor(Math.random() * fresh.length)];
  ids.add(pick.id);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ids: [...ids], last: pick.id }));
  } catch {
    /* ignore */
  }
  return pick;
}
