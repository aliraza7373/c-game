/**
 * Captain Identity & Persistence Engine
 * Generates unique, memorable nautical Captain callsigns and persists them in memory & localStorage.
 */

const RANKS = [
  "Captain",
  "Admiral",
  "Commander",
  "Commodore",
  "Corsair",
  "Skipper",
  "Navigator",
  "Gunner",
  "Vanguard",
  "Dreadnought",
];

const CALLSIGNS = [
  "Blackbeard",
  "Kraken",
  "Triton",
  "Storm",
  "Tempest",
  "Poseidon",
  "Viper",
  "Phantom",
  "Falcon",
  "Barracuda",
  "Manta",
  "Thunder",
  "Ironclad",
  "Leviathan",
  "Ghost",
  "Nautilus",
  "Reef",
  "Abyss",
  "Horizon",
  "Vortex",
];

let inMemoryCaptainName = null;

export function generateRandomCaptainName() {
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  const callsign = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)];
  const number = Math.floor(100 + Math.random() * 900); // 3-digit fleet identifier
  return `${rank} ${callsign} #${number}`;
}

export function getPersistedCaptainName() {
  // 1. Check in-memory variable
  if (inMemoryCaptainName) {
    return inMemoryCaptainName;
  }

  // 2. Check localStorage
  try {
    const saved = localStorage.getItem("tide_captain_name");
    if (saved && saved.trim() && saved !== "Captain Alex") {
      inMemoryCaptainName = saved.trim();
      return inMemoryCaptainName;
    }
  } catch (e) {
    console.warn("localStorage unavailable:", e);
  }

  // 3. Check sessionStorage
  try {
    const sessionSaved = sessionStorage.getItem("tide_captain_name");
    if (sessionSaved && sessionSaved.trim() && sessionSaved !== "Captain Alex") {
      inMemoryCaptainName = sessionSaved.trim();
      return inMemoryCaptainName;
    }
  } catch (e) {}

  // 4. Generate fresh unique random nautical name
  const newName = generateRandomCaptainName();
  persistCaptainName(newName);
  return newName;
}

export function persistCaptainName(name) {
  if (!name || !name.trim()) return;
  const cleanName = name.trim();
  inMemoryCaptainName = cleanName;

  try {
    localStorage.setItem("tide_captain_name", cleanName);
  } catch (e) {}

  try {
    sessionStorage.setItem("tide_captain_name", cleanName);
  } catch (e) {}

  return cleanName;
}
