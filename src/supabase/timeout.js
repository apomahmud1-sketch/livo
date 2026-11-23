// Livo — shared timeout guard for Supabase reads.
//
// supabase-js has no default request timeout: on a stalled phone
// connection a query can hang forever, and every screen that gates
// its spinner on that query then spins forever too (Moments feed,
// Messages list, getCurrentUserId). Racing each await against a
// timer that resolves to null makes every read fail-fast instead:
// callers already treat null / [] as "no data — show the empty
// state", so a slow network degrades to an empty list, never a
// stuck spinner. Same pattern as live.js (LIVE_TIMEOUT_MS).
export function withTimeout(promise, ms = 8000) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([
    Promise.resolve(promise).catch(() => null),
    timeout,
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
