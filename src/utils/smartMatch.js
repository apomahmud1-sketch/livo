// F6 — AI Smart Match: pick a host for the user to talk to.
// Works ONLY on the real host list passed in by the caller (the
// live list from the store: useApp() -> HOSTS from src/data.js,
// live-updated by the Host Dashboard's setHostOnline /
// setHostRate). No invented hosts: if nobody is online, this
// returns null and the card shows the empty state.
// Steps: online hosts only -> preferred language -> second
// language -> any online host as fallback.
import { PROFILE } from '../screens/profile/levelData';

// Preferences come from the real user profile in
// src/screens/profile/levelData.js (PROFILE.language, e.g.
// 'English', and PROFILE.secondLanguage). There is no gender
// preference stored in PROFILE today, so prefs.gender is null
// and the gender filter below stays inactive until one is added.
export function getUserPreferences() {
  return {
    language: PROFILE.language || null,
    secondLanguage: PROFILE.secondLanguage || null,
    gender: PROFILE.preferredGender || null,
  };
}

// Gender filtering rule: a gender filter applies ONLY when BOTH
// the preference (prefs.gender) and the host's gender (host.gender)
// are defined. An unknown host gender never excludes a host.
// (The hosts in src/data.js have no gender field, so in this
// copy the filter is a no-op by design — see INTEGRATION.md F6
// caveat. Do NOT invent genders for demo hosts. Once a feature
// adds real gender fields to data.js, this filter activates.)
function genderOk(host, prefs) {
  if (!prefs.gender) return true;
  if (!host.gender) return true;
  return host.gender === prefs.gender;
}

function sameLanguage(hostLang, prefLang) {
  if (!prefLang || !hostLang) return false;
  return String(hostLang).toLowerCase() === String(prefLang).toLowerCase();
}

// Pick one host at random from the best available pool.
// `excludeIds` (optional) keeps hosts out of the pick — used by
// "Find another" so a re-roll never returns the host just shown.
// Returns the host object, or null when nobody is online (or
// nobody is left after exclusions).
export function pickSmartMatch(hosts, prefs = {}, excludeIds = []) {
  const list = Array.isArray(hosts) ? hosts : [];
  const excluded = new Set((excludeIds || []).map((id) => String(id)));
  const online = list.filter(
    (h) => h && h.online && genderOk(h, prefs) && !excluded.has(String(h.id))
  );
  if (online.length === 0) return null;

  const preferred = online.filter((h) => sameLanguage(h.lang, prefs.language));
  if (preferred.length > 0) {
    return preferred[Math.floor(Math.random() * preferred.length)];
  }
  const second = prefs.secondLanguage
    ? online.filter((h) => sameLanguage(h.lang, prefs.secondLanguage))
    : [];
  if (second.length > 0) {
    return second[Math.floor(Math.random() * second.length)];
  }
  // Fallback: any online host.
  return online[Math.floor(Math.random() * online.length)];
}
