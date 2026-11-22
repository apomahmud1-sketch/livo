// ─────────────────────────────────────────────────────────────────
// Livo — Google Play billing via react-native-iap v12 (classic API).
//
// Play product IDs are derived from the Supabase catalog ids, so the
// admin panel stays the source of truth for WHAT is sold; Play
// Console only needs a product with the matching ID:
//   coin pack   pack100  -> livo.coins.pack100
//   VIP pack    vip1     -> livo.vip.vip1
//   diamond pack d4000   -> livo.diamonds.d4000
// All three are one-time consumables (coins/diamonds/VIP days).
//
// Flow: initIap() connects + fetches the products that exist in
// Play. buySku() opens the Play purchase sheet. The result arrives
// on purchaseUpdatedListener — the registered purchase handler
// credits the wallet (store.js) and only then is the transaction
// finished as consumable, so a failed credit is never consumed and
// is recovered on the next start via getAvailablePurchases().
// Until the products are created in Play Console, getProducts
// returns [] and every buy shows the "not set up yet" message —
// nothing crashes, nothing is charged.
//
// NOTE 2026-11-22: v17 (OpenIAP/Nitro) was tried first and REVERTED —
// it needs a Kotlin 2.2 compiler, which needs Gradle 8.12+, which
// needs AGP 8.9+, a chain Expo SDK 52 cannot follow. v12 is the
// classic API (getProducts/requestPurchase with productId) and the
// store's purchase handler already uses purchase.productId, which
// is the v12 shape. Do not upgrade to v13+ without checking the
// Kotlin/Gradle chain first.
// ─────────────────────────────────────────────────────────────────
import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  getProducts,
  requestPurchase,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  getAvailablePurchases,
  ErrorCode,
} from 'react-native-iap';

const SKU_PREFIX = 'livo';

export function skuForCoinPack(packId) {
  return `${SKU_PREFIX}.coins.${packId}`;
}
export function skuForVipPack(packId) {
  return `${SKU_PREFIX}.vip.${packId}`;
}
export function skuForDiamondPack(packId) {
  return `${SKU_PREFIX}.diamonds.${packId}`;
}

// Reverse: Play SKU -> { type: 'coins' | 'vip' | 'diamonds', id }.
// Diamond amounts come from the pack id itself (d4000 -> 4000), so
// the store never needs the WalletScreen pack list to credit.
export function parseSku(sku) {
  if (typeof sku !== 'string') return null;
  const m = sku.match(/^livo\.(coins|vip|diamonds)\.(.+)$/);
  if (!m) return null;
  return { type: m[1], id: m[2] };
}

export function diamondsForDiamondPack(packId) {
  const n = parseInt(String(packId).replace(/^d/i, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ── Module state ─────────────────────────────────────────────────
let connected = false;
let listenersAttached = false;
let purchaseHandler = null; // { onPurchase(purchase) => Promise<bool>, onError(error) }
let errorHandler = null;
let foundProducts = []; // normalised Product[]: { id, productId, price, ... }
const processedTokens = new Set();

function isUserCancelled(error) {
  if (!error) return false;
  // v12: ErrorCode.E_USER_CANCELLED ('E_USER_CANCELLED').
  if (error.code === ErrorCode.E_USER_CANCELLED) return true;
  const msg = String(error.message || error.code || '').toLowerCase();
  return msg.includes('cancel');
}

async function handlePurchase(purchase) {
  if (!purchase) return;
  const token = purchase.purchaseToken || purchase.transactionId || purchase.id;
  if (token && processedTokens.has(token)) return; // already credited
  if (!purchaseHandler || typeof purchaseHandler.onPurchase !== 'function') return;
  let credited = false;
  try {
    credited = await purchaseHandler.onPurchase(purchase);
  } catch (e) {
    credited = false;
  }
  if (!credited) return; // do NOT finish — it stays pending and is
  // recovered on the next start (getAvailablePurchases).
  if (token) processedTokens.add(token);
  try {
    await finishTransaction({ purchase, isConsumable: true });
  } catch (e) { /* finishing failed — Play will re-deliver it */ }
}

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  purchaseUpdatedListener((purchase) => {
    handlePurchase(purchase);
  });
  purchaseErrorListener((error) => {
    if (isUserCancelled(error)) return; // silent: user just backed out
    if (errorHandler) {
      try { errorHandler(error); } catch (e) { /* ignore */ }
    }
  });
}

// Register the store's purchase handler. Replacing it is safe —
// the native listener stays attached once for the app session.
export function setPurchaseHandler(handler) {
  purchaseHandler = handler || null;
}
export function setPurchaseErrorHandler(handler) {
  errorHandler = handler || null;
}

// ── Init ─────────────────────────────────────────────────────────
// Connects (once) and fetches whichever of the given SKUs exist in
// Play. Safe to call again when the catalog loads — it merges newly
// found products and never re-attaches listeners.
// Returns { ok, foundSkus, missingSkus, error? }.
export async function initIap(skus) {
  const wanted = Array.isArray(skus) ? [...new Set(skus.filter(Boolean))] : [];
  try {
    if (!connected) {
      const ok = await initConnection();
      if (!ok) return { ok: false, foundSkus: [], missingSkus: wanted, error: 'init-failed' };
      connected = true;
      attachListeners();
    }
    if (wanted.length === 0) {
      return { ok: true, foundSkus: foundProducts.map((p) => p.id), missingSkus: [] };
    }
    let products = [];
    try {
      // v12: getProducts({ skus }) — products carry productId.
      products = await getProducts({ skus: wanted });
    } catch (e) {
      products = [];
    }
    const normalised = (products || []).map((p) => ({
      ...p,
      id: p.productId,
    }));
    const foundIds = new Set(normalised.map((p) => p.id));
    foundProducts = [
      ...foundProducts.filter((p) => !foundIds.has(p.id)),
      ...normalised,
    ];
    return {
      ok: true,
      foundSkus: [...foundIds],
      missingSkus: wanted.filter((s) => !foundIds.has(s)),
    };
  } catch (e) {
    return { ok: false, foundSkus: [], missingSkus: wanted, error: 'init-failed' };
  }
}

// Recover unfinished purchases (e.g. credited=false last time, or
// the app died mid-purchase). Call once after init.
export async function recoverUnfinishedPurchases() {
  if (!connected) return;
  try {
    const purchases = await getAvailablePurchases();
    for (const p of purchases || []) {
      // eslint-disable-next-line no-await-in-loop
      await handlePurchase(p);
    }
  } catch (e) { /* recovery is best-effort */ }
}

export function getIapProducts() {
  return foundProducts;
}
export function isSkuAvailable(sku) {
  return foundProducts.some((p) => p.id === sku);
}
export function isIapConnected() {
  return connected;
}

// ── Buy ──────────────────────────────────────────────────────────
// Opens the Play purchase sheet for one SKU. Returns:
//   { ok: true }            — sheet opened; the result arrives on
//                             the purchase listener (credit happens
//                             there, not here).
//   { ok: false, cancelled: true } — user backed out of the sheet.
//   { ok: false, error }    — IAP not connected, product missing,
//                             or the sheet could not open.
export async function buySku(sku) {
  if (!connected) return { ok: false, error: 'not-connected' };
  if (!isSkuAvailable(sku)) return { ok: false, error: 'product-not-found' };
  try {
    // v12: Android takes { skus: [] }, iOS takes { sku }.
    if (Platform.OS === 'ios') {
      await requestPurchase({ sku });
    } else {
      await requestPurchase({ skus: [sku] });
    }
    return { ok: true };
  } catch (e) {
    if (isUserCancelled(e)) return { ok: false, cancelled: true };
    return { ok: false, error: 'purchase-failed' };
  }
}

export async function closeIap() {
  if (!connected) return;
  try {
    await endConnection();
  } catch (e) { /* ignore */ }
  connected = false;
}
