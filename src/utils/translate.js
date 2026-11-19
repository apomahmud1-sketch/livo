// Livo — chat auto-translation helper (F4, 2026-11-19)
//
// Translates chat text with the free MyMemory API — no API key, no new
// dependencies (plain fetch). Used by ChatDetailScreen for incoming
// messages when the auto-translate toggle is ON.
//
// ── GRACEFUL FALLBACK ──────────────────────────────────────────────
// translateText() NEVER throws and NEVER returns a blank string for a
// real message: on any failure (network error, timeout, non-200,
// empty/bad payload, API error text) it resolves to null and the
// caller keeps showing the original text unchanged.
// ── CACHING ────────────────────────────────────────────────────────
// Successful translations are cached in memory keyed by
// "<target-lang>::<source text>", and concurrent duplicate requests
// share one in-flight fetch — scrolling or re-rendering never
// re-requests the same text. Failed lookups are NOT cached, so a
// retry after the network recovers can still succeed.

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const DEFAULT_TARGET = 'en';
const REQUEST_TIMEOUT_MS = 8000;

// Display names used in the app (PROFILE.language, LANGUAGES in
// profile/levelData.js) -> MyMemory language codes.
export const LANGUAGE_CODES = {
  English: 'en',
  Bengali: 'bn',
  'Chinese Simplified': 'zh-CN',
  'Chinese Traditional': 'zh-TW',
  Hindi: 'hi',
  Urdu: 'ur',
  Arabic: 'ar',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Portuguese: 'pt',
  Russian: 'ru',
  Japanese: 'ja',
  Korean: 'ko',
  Thai: 'th',
  Vietnamese: 'vi',
  Indonesian: 'id',
  Malay: 'ms',
  Filipino: 'tl',
  Turkish: 'tr',
  Tamil: 'ta',
  Telugu: 'te',
  Punjabi: 'pa',
  Nepali: 'ne',
  Sinhala: 'si',
  Burmese: 'my',
  Khmer: 'km',
  Dutch: 'nl',
  Polish: 'pl',
};

// Codes MyMemory accepts for the languages above. Anything else
// falls back to 'en' instead of wasting a request on a bad code.
const KNOWN_CODES = new Set(Object.values(LANGUAGE_CODES));

// Accepts a display name ('Bengali'), a code ('bn', 'zh-CN') or
// anything else; always returns a usable MyMemory target code,
// defaulting to 'en' for unknown / empty input.
export function resolveTargetLanguage(nameOrCode) {
  if (!nameOrCode || typeof nameOrCode !== 'string') return DEFAULT_TARGET;
  const value = nameOrCode.trim();
  if (!value) return DEFAULT_TARGET;
  if (LANGUAGE_CODES[value]) return LANGUAGE_CODES[value];
  // Already a known code (e.g. 'bn', 'zh-CN'): normalise the case of
  // the primary subtag, keep any region subtag upper-case.
  if (/^[a-z]{2,3}(-[a-z]{2})?$/i.test(value)) {
    const [main, region] = value.split('-');
    const code = region ? `${main.toLowerCase()}-${region.toUpperCase()}` : main.toLowerCase();
    if (KNOWN_CODES.has(code)) return code;
  }
  return DEFAULT_TARGET;
}

// In-memory cache: "<target>::<source text>" -> translated text.
const cache = new Map();
// In-flight dedup: same key -> the one shared promise.
const inFlight = new Map();

// Clears the translation cache (e.g. on logout). Not used by the
// chat screen today — the cache is small and session-scoped.
export function clearTranslationCache() {
  cache.clear();
}

// Translates `text` into `targetLang` (display name or code).
// Resolves to the translated string, or null when there is no usable
// translation (failure, timeout, empty result, API error text).
// Never throws; never resolves to '' for non-empty input.
export async function translateText(text, targetLang = DEFAULT_TARGET) {
  if (!text || typeof text !== 'string' || !text.trim()) return null;
  const source = text;
  const target = resolveTargetLanguage(targetLang);
  const key = `${target}::${source}`;

  if (cache.has(key)) return cache.get(key);
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const url =
          `${MYMEMORY_URL}?q=${encodeURIComponent(source)}` +
          `&langpair=auto|${encodeURIComponent(target)}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res || !res.ok) return null;
        const data = await res.json();
        if (!data || (data.responseStatus && data.responseStatus !== 200)) return null;
        const out =
          data.responseData && typeof data.responseData.translatedText === 'string'
            ? data.responseData.translatedText.trim()
            : '';
        if (!out) return null;
        // MyMemory reports quota / bad-language problems as text.
        if (/^MYMEMORY WARNING/i.test(out)) return null;
        if (/^QUERY LENGTH LIMIT EXCEEDED/i.test(out)) return null;
        if (/^INVALID (TARGET|SOURCE) LANGUAGE/i.test(out)) return null;
        return out;
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      // Network error, timeout (abort), bad JSON — fall back to original.
      return null;
    }
  })();

  inFlight.set(key, promise);
  try {
    const result = await promise;
    if (result !== null) cache.set(key, result);
    return result;
  } finally {
    inFlight.delete(key);
  }
}
