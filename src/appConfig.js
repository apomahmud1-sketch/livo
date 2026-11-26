// ─────────────────────────────────────────────────────────────────
// Livo — app_config (Mother Panel → app).
//
// The Mother Panel writes rows into the public.app_config table
// (key TEXT primary key, value JSONB). The app fetches them on
// startup with the anon key, caches them in AsyncStorage
// ('livo-app-config-v1') so the app works offline with the last
// known values, and refreshes on each app start.
//
// Fallback order: live fetch → cached values → the built-in
// defaults below (identical to the panel's seed values). A missing
// table, a failed fetch, or a missing/unknown key never breaks the
// app — that key simply keeps its default. Nothing here is demo
// data: the defaults are the same values the panel seeds.
// ─────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { supabase } from './supabase/client';
import { THEME } from './config';

export const APP_CONFIG_CACHE_KEY = 'livo-app-config-v1';

export const LOGIN_STYLES = ['neon', 'white', 'pink', 'blue'];

export const DEFAULT_APP_CONFIG = {
  theme: { primary: '#7c3aed', gold: '#f5b93f', background: '#1e0a3c', card: '#2a1152' },
  features: { moments: true, lucky_spin: true, my_tasks: true, chat_price: true, vip: true, host_dashboard: true },
  home_hero: { title: '1v1 Video Call', subtitle: 'Find your best match!' },
  login_style: { style: 'neon' },
  notice: { text: '' },
  // Rewards settings (Lucky Spin + Daily Reward). Same defaults as
  // rewardsConfig.js / store.js — the panel's `rewards` key wins
  // when it is set.
  rewards: { free_spins_per_day: 1, checkin_rewards: [10, 15, 20, 30, 40, 60, 100] },
  // Gender-based views (Mother Panel App Control → `gender_views`):
  // which side of the app each gender sees. 'host' shows the Host
  // Dashboard tab + Go Live button; 'caller' hides them. Home stays
  // the same for both views (live hosts to call). Same defaults as
  // the panel seeds.
  gender_views: { female: 'host', male: 'caller' },
  // App Builder (Mother Panel → `app_pages`): the whole app layout
  // — which pages and rows show, their order, names and badges.
  // Default is the full catalog: nothing hidden, renamed or
  // reordered. Stored shape: { pages: { [pageId]: { hidden?,
  // title?, order?, items?, custom?, removed? } }, customPages: [] }.
  app_pages: { pages: {}, customPages: [] },
};

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

// Merge raw panel values over the defaults, key by key. Unknown
// keys are ignored; a bad value for a known key keeps the default
// for that field (never a crash, never a blank screen).
export function mergeAppConfig(raw) {
  const out = clone(DEFAULT_APP_CONFIG);
  if (!isObj(raw)) return out;
  if (isObj(raw.theme)) {
    ['primary', 'gold', 'background', 'card'].forEach((k) => {
      if (typeof raw.theme[k] === 'string' && raw.theme[k].trim()) out.theme[k] = raw.theme[k].trim();
    });
  }
  if (isObj(raw.features)) {
    Object.keys(out.features).forEach((k) => {
      if (typeof raw.features[k] === 'boolean') out.features[k] = raw.features[k];
    });
  }
  if (isObj(raw.home_hero)) {
    if (typeof raw.home_hero.title === 'string' && raw.home_hero.title.trim()) out.home_hero.title = raw.home_hero.title;
    if (typeof raw.home_hero.subtitle === 'string') out.home_hero.subtitle = raw.home_hero.subtitle;
  }
  if (isObj(raw.login_style) && typeof raw.login_style.style === 'string') {
    const s = raw.login_style.style.trim().toLowerCase();
    if (LOGIN_STYLES.indexOf(s) !== -1) out.login_style.style = s;
  }
  if (isObj(raw.notice) && typeof raw.notice.text === 'string') {
    out.notice.text = raw.notice.text;
  }
  if (isObj(raw.rewards)) {
    if (Number.isInteger(raw.rewards.free_spins_per_day) && raw.rewards.free_spins_per_day > 0) {
      out.rewards.free_spins_per_day = raw.rewards.free_spins_per_day;
    }
    if (Array.isArray(raw.rewards.checkin_rewards) && raw.rewards.checkin_rewards.length === 7
      && raw.rewards.checkin_rewards.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) {
      out.rewards.checkin_rewards = raw.rewards.checkin_rewards;
    }
  }
  if (isObj(raw.gender_views)) {
    ['female', 'male'].forEach((k) => {
      const v = String(raw.gender_views[k] || '').trim().toLowerCase();
      if (v === 'host' || v === 'caller') out.gender_views[k] = v;
    });
  }
  // App Builder layout (Mother Panel → `app_pages`). Only the known
  // fields are kept, with the right types — a bad value is dropped,
  // never a crash. An absent key keeps the full-catalog default.
  if (isObj(raw.app_pages)) {
    const pages = {};
    if (isObj(raw.app_pages.pages)) {
      Object.keys(raw.app_pages.pages).forEach((pid) => {
        const p = raw.app_pages.pages[pid];
        if (!isObj(p)) return;
        const pg = {};
        if (p.hidden === true) pg.hidden = true;
        if (typeof p.title === 'string' && p.title.trim()) pg.title = p.title.trim();
        if (Array.isArray(p.order)) pg.order = p.order.filter((x) => typeof x === 'string');
        if (Array.isArray(p.removed)) pg.removed = p.removed.filter((x) => typeof x === 'string');
        if (isObj(p.items)) {
          const items = {};
          Object.keys(p.items).forEach((iid) => {
            const it = p.items[iid];
            if (!isObj(it)) return;
            const o = {};
            if (it.hidden === true) o.hidden = true;
            if (typeof it.label === 'string' && it.label.trim()) o.label = it.label.trim();
            if (typeof it.badge === 'string') o.badge = it.badge;
            items[iid] = o;
          });
          pg.items = items;
        }
        if (Array.isArray(p.custom)) {
          pg.custom = p.custom
            .filter((c) => isObj(c) && typeof c.id === 'string' && typeof c.label === 'string')
            .map((c) => ({
              id: c.id,
              icon: typeof c.icon === 'string' && c.icon ? c.icon : '✨',
              label: c.label,
              badge: typeof c.badge === 'string' ? c.badge : '',
            }));
        }
        pages[pid] = pg;
      });
    }
    const customPages = Array.isArray(raw.app_pages.customPages)
      ? raw.app_pages.customPages
          .filter((c) => isObj(c) && typeof c.id === 'string' && typeof c.name === 'string')
          .map((c) => ({
            id: c.id,
            name: c.name,
            icon: typeof c.icon === 'string' && c.icon ? c.icon : '🧩',
          }))
      : [];
    out.app_pages = { pages, customPages };
  }
  return out;
}

// ── App Builder catalog + resolver ───────────────────────────────
// The panel's page catalog (Mother Panel client/src/pages10.tsx)
// uses these item ids and default labels/badges. The resolver below
// mirrors the panel's resolvePages exactly, so the app and the panel
// always agree on what a stored `app_pages` value means:
//   order = [...(stored order), ...catalog order, ...custom rows]
//   (deduped, unknown + removed ids skipped);
//   label = stored label || catalog label; badge likewise;
//   hidden = stored hidden flag; removed ids never appear.
// A page with no stored config resolves to the full catalog.
export const APP_PAGE_CATALOG = {
  home: {
    title: 'Home',
    items: [
      { id: 'notice', label: 'Notice banner' },
      { id: 'hero', label: 'Hero — 1v1 Video Call' },
      { id: 'quickmatch', label: 'Quick Match' },
      { id: 'rewards', label: 'Rewards banner' },
      { id: 'livehosts', label: 'Live Hosts grid' },
      { id: 'tabbar', label: 'Bottom tab bar' },
    ],
  },
  moments: {
    title: 'Moments',
    items: [
      { id: 'feed', label: 'Moments feed' },
      { id: 'newmoment', label: 'New Moment button' },
      { id: 'tabbar', label: 'Bottom tab bar' },
    ],
  },
  messages: {
    title: 'Messages',
    items: [
      { id: 'service', label: 'Customer service row' },
      { id: 'chatlist', label: 'Chat list' },
      { id: 'tabbar', label: 'Bottom tab bar' },
    ],
  },
  me: {
    title: 'Me',
    items: [
      { id: 'header', label: 'Photo, name, ID & badges' },
      { id: 'stats', label: 'Friend · Follow · Fans' },
      { id: 'walletcard', label: 'My Wallet card' },
      { id: 'levelvip', label: 'My Level & VIP row' },
      { id: 'm_messages', label: 'Messages' },
      { id: 'm_hostdash', label: 'Host Dashboard', badge: 'Approved' },
      { id: 'm_tasks', label: 'My Tasks', badge: 'New Reward' },
      { id: 'm_spin', label: 'Lucky Spin', badge: 'Free spin' },
      { id: 'm_chatprice', label: 'Chat Price', badge: 'Not set' },
      { id: 'm_profile', label: 'My Profile' },
      { id: 'm_settings', label: 'Settings' },
      { id: 'tabbar', label: 'Bottom tab bar' },
    ],
  },
};

export function resolveAppPage(appPages, pageId) {
  const catalog = APP_PAGE_CATALOG[pageId];
  if (!catalog) return { id: pageId, hidden: false, title: pageId, items: [] };
  const pc = (appPages && appPages.pages && appPages.pages[pageId]) || {};
  const catById = new Map(catalog.items.map((i) => [i.id, i]));
  const customItems = Array.isArray(pc.custom) ? pc.custom : [];
  const customById = new Map(customItems.map((i) => [i.id, i]));
  const removed = new Set(Array.isArray(pc.removed) ? pc.removed : []);
  const baseOrder = [
    ...catalog.items.filter((i) => !removed.has(i.id)).map((i) => i.id),
    ...customItems.map((i) => i.id),
  ];
  const seen = new Set();
  const order = [];
  const storedOrder = Array.isArray(pc.order) ? pc.order : [];
  for (const id of [...storedOrder, ...baseOrder]) {
    if (seen.has(id)) continue;
    if (!catById.has(id) && !customById.has(id)) continue;
    if (removed.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  const items = order.map((id) => {
    const ov = (pc.items && pc.items[id]) || {};
    const c = customById.get(id);
    if (c) {
      return {
        id,
        icon: c.icon || '✨',
        label: (typeof ov.label === 'string' && ov.label) || c.label,
        badge: typeof ov.badge === 'string' ? ov.badge : (c.badge || ''),
        hidden: ov.hidden === true,
        custom: true,
      };
    }
    const b = catById.get(id);
    return {
      id,
      icon: b.icon,
      label: (typeof ov.label === 'string' && ov.label) || b.label,
      badge: typeof ov.badge === 'string' ? ov.badge : (b.badge || ''),
      hidden: ov.hidden === true,
      custom: false,
    };
  });
  return {
    id: pageId,
    hidden: pc.hidden === true,
    title: (typeof pc.title === 'string' && pc.title.trim()) ? pc.title.trim() : catalog.title,
    items,
  };
}

// Is a whole page hidden by the App Builder? (No stored config
// means visible.) The Me tab never hides even when the `me` page
// is hidden — only its rows obey the config.
export function isAppPageHidden(appPages, pageId) {
  const pc = appPages && appPages.pages && appPages.pages[pageId];
  return !!(pc && pc.hidden === true);
}

// Renamed page title from the App Builder, or the fallback.
export function appPageTitle(appPages, pageId, fallback) {
  const pc = appPages && appPages.pages && appPages.pages[pageId];
  return (pc && typeof pc.title === 'string' && pc.title.trim()) ? pc.title.trim() : fallback;
}

// Resolve which side of the app a user sees from the panel's
// gender_views: 'host' or 'caller'. An unknown/missing gender fails
// open to 'host' (current behaviour) — never guessed, never hidden.
export function genderViewFor(config, gender) {
  const g = String(gender || '').trim().toLowerCase();
  const views = (config && config.gender_views) || {};
  if (g === 'female') return views.female === 'caller' ? 'caller' : 'host';
  if (g === 'male') return views.male === 'host' ? 'host' : 'caller';
  return 'host';
}

// Full THEME-shaped object (same keys as config.js THEME) driven by
// the panel theme: primary → purple/violet, gold → gold, background
// → page/deep/panel, card → panel2/sheet. Screens use this instead
// of the hardcoded THEME so the panel re-themes the app.
export function themeFromConfig(config) {
  const th = (config && config.theme) || {};
  const pick = (k) => (typeof th[k] === 'string' && th[k].trim() ? th[k].trim() : DEFAULT_APP_CONFIG.theme[k]);
  const primary = pick('primary');
  const gold = pick('gold');
  const background = pick('background');
  const card = pick('card');
  return {
    ...THEME,
    purple: primary,
    violet: primary,
    violetDark: primary,
    gold,
    gold2: gold,
    page: background,
    deep: background,
    panel: background,
    panel2: card,
    sheet: card,
  };
}

// Darken (negative pct) or lighten (positive pct) a #rrggbb colour.
// Used for gradient stops derived from the panel background.
export function shadeColor(hex, pct) {
  try {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6) return hex;
    const num = parseInt(h, 16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;
    const t = pct < 0 ? 0 : 255;
    const p = Math.abs(pct) / 100;
    r = Math.round((t - r) * p + r);
    g = Math.round((t - g) * p + g);
    b = Math.round((t - b) * p + b);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  } catch (e) {
    return hex;
  }
}

async function fetchAppConfigRows() {
  if (!supabase) return null;
  try {
    // Never hang startup on this fetch: 8s and the cached values /
    // defaults stand in.
    const query = supabase.from('app_config').select('key,value');
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 8000));
    const res = await Promise.race([query, timeout]);
    if (!res || res.timedOut || res.error || !Array.isArray(res.data)) return null;
    const raw = {};
    res.data.forEach((row) => {
      if (row && typeof row.key === 'string') raw[row.key] = row.value;
    });
    return mergeAppConfig(raw);
  } catch (e) {
    return null;
  }
}

const AppConfigContext = React.createContext({
  ...clone(DEFAULT_APP_CONFIG),
  // Camel-case alias for home_hero — HomeScreen reads `homeHero`.
  // Without this key the destructure is undefined and Home crashes
  // on `homeHero.title` at first render after login.
  homeHero: clone(DEFAULT_APP_CONFIG.home_hero),
  theme: themeFromConfig(DEFAULT_APP_CONFIG),
  loginStyle: 'neon',
  noticeText: '',
  loaded: false,
  // True once a real config has been seen — a fresh fetch that
  // succeeded, or a cached config from an earlier fetch. False when
  // the whole config load failed (no fetch, no cache): consumers
  // fall back to current behaviour (e.g. the Host Dashboard tab
  // stays visible to everyone) instead of applying the defaults.
  configLive: false,
});

// Loads cached config first (instant, offline-safe), then refreshes
// from Supabase and re-caches. Screens render the defaults until
// the first value arrives — never a blank screen.
export function AppConfigProvider({ children }) {
  const [config, setConfig] = React.useState(DEFAULT_APP_CONFIG);
  const [loaded, setLoaded] = React.useState(false);
  const [configLive, setConfigLive] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(APP_CONFIG_CACHE_KEY);
        if (cached && mounted) {
          try {
            setConfig(mergeAppConfig(JSON.parse(cached)));
            // A cache only exists because a real fetch wrote it once.
            setConfigLive(true);
          } catch (e) {
            // Corrupt cache — ignore it, defaults stand in.
          }
        }
      } catch (e) {
        // Storage read failed — defaults stand in.
      }
      const fresh = await fetchAppConfigRows();
      if (!mounted) return;
      if (fresh) {
        setConfig(fresh);
        setConfigLive(true);
        try {
          await AsyncStorage.setItem(APP_CONFIG_CACHE_KEY, JSON.stringify(fresh));
        } catch (e) {
          // Cache write failed — the live values are already in state.
        }
      }
      setLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const value = React.useMemo(
    () => ({
      ...config,
      // Camel-case alias for config.home_hero (see createContext
      // default above): HomeScreen destructures `homeHero`.
      homeHero: config.home_hero || DEFAULT_APP_CONFIG.home_hero,
      theme: themeFromConfig(config),
      loginStyle:
        (config.login_style && config.login_style.style) || 'neon',
      noticeText:
        (config.notice && typeof config.notice.text === 'string'
          ? config.notice.text
          : ''),
      loaded,
      configLive,
    }),
    [config, loaded, configLive],
  );

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return React.useContext(AppConfigContext);
}
