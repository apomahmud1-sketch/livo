import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { House, MessageCircle, Play, UserRound, Video } from 'lucide-react-native';
import { THEME } from './src/config';
import { AppConfigProvider, useAppConfig, genderViewFor } from './src/appConfig';
import { AppProvider, useApp } from './src/store';
import { supabase } from './src/supabase/client';
import { withTimeout } from './src/supabase/timeout';
import { checkAccess, ensureProfile, fetchMyProfile, signOut } from './src/supabase/auth';
import { getOrCreateDeviceId, registerDevice } from './src/supabase/device';
import { requestNotificationPermission } from './src/permissions';
import { useIncomingCallListener } from './src/calls/signalling';
import LoginScreen from './src/screens/LoginScreen';
import LegalScreen from './src/screens/LegalScreen';
import SignupFlow from './src/screens/SignupFlow';
import HomeScreen from './src/screens/HomeScreen';
import VideoCallScreen from './src/screens/VideoCallScreen';
import MatchingScreen from './src/screens/MatchingScreen'; // [New UI] Match flow
import LiveRoomScreen from './src/screens/LiveRoomScreen'; // [New UI] Public live room
import MessagesScreen from './src/screens/MessagesScreen';
import ChatDetailScreen from './src/screens/ChatDetailScreen';
import WalletScreen from './src/screens/WalletScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import HostDashboardScreen from './src/screens/HostDashboardScreen';
import RankingScreen from './src/screens/RankingScreen';
import VIPScreen from './src/screens/VIPScreen';
import RewardsScreen from './src/screens/RewardsScreen'; // [F1] Lucky Spin + Daily Reward
import MomentsScreen from './src/screens/MomentsScreen'; // [Vero] Moments feed
import TasksScreen from './src/screens/TasksScreen'; // [Vero] Daily Tasks
import AgentPortalScreen from './src/screens/AgentPortalScreen'; // [Agent] Coin agent portal
import MyIncomeScreen from './src/screens/MyIncomeScreen'; // [Wallet] Host Diamond earnings + withdraw
import AgentDetailScreen from './src/screens/AgentDetailScreen'; // [Wallet] Agent detail inside the app

// AuthContext (2026-11-23): the gate in Root() holds the session in
// MEMORY (from the SIGNED_IN / INITIAL_SESSION event). Screens must
// NOT re-read identity from AsyncStorage: on the user's phone the
// storage read returns nothing seconds after a successful Google
// sign-in (nearly-full storage), so every screen that called
// getSession() saw "no session" while the gate correctly showed
// Main. The context carries the gate's live session/user instead.
export const AuthContext = React.createContext({ session: null, user: null, profile: null });

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <View style={styles.toast}>
      <Text style={styles.toastText}>{toast}</Text>
    </View>
  );
}

// Bottom nav rebuilt 2026-11-21 to match the v0 preview
// (https://livo-puce.vercel.app): 5 equal columns, 50px items,
// 9px labels, 20px lucide icons (stroke 1.9 inactive / 2.5 active),
// centre raised 49px circle with Video icon,
// Messages badge shows the real unread count from the store.
// [New UI 2026-11-25] Purple-gold theme: dark purple bar,
// active #c99aff, inactive #9d8bc4, centre FAB purple gradient.
// Tab order: Home / Moments / Live / Messages / Me.
function MainTabs() {
  // Real unread badge: unreadTotal comes from the store (another
  // pass adds it); undefined until then means "no badge".
  const { unreadTotal } = useApp();
  // Panel-driven config (app_config): theme colours + the Moments
  // feature toggle. When moments is OFF the tab is hidden entirely.
  const appCfg = useAppConfig();
  const { theme: T, features } = appCfg;
  // Gender-based view (panel app_config → gender_views): the Live
  // (Host Dashboard) tab only shows when this user's view is
  // 'host'. The profile comes from the gate's signup check in Root
  // (AuthContext) — no extra fetch. Fail open: no live config, no
  // profile, or an unknown gender keeps the tab (current behaviour).
  const { profile } = React.useContext(AuthContext);
  const showLiveTab = !appCfg.configLive
    || genderViewFor(appCfg, profile && profile.gender) === 'host';
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: T.tabActive,
        tabBarInactiveTintColor: T.tabInactive,
        tabBarStyle: [styles.tabBar, { backgroundColor: T.page, borderTopColor: T.line }],
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: ({ focused }) => <Text style={[styles.tabLabel, { color: focused ? T.tabActive : T.tabInactive }, focused && styles.tabLabelActive]}>Home</Text>,
          tabBarIcon: ({ focused }) => <House size={20} strokeWidth={focused ? 2.5 : 1.9} color={focused ? T.tabActive : T.tabInactive} />,
        }}
      />
      {features.moments ? (
        <Tab.Screen
          name="MomentsTab"
          component={MomentsScreen}
          options={{
            tabBarLabel: ({ focused }) => <Text style={[styles.tabLabel, { color: focused ? T.tabActive : T.tabInactive }, focused && styles.tabLabelActive]}>Moments</Text>,
            tabBarIcon: ({ focused }) => <Play size={20} strokeWidth={focused ? 2.5 : 1.9} color={focused ? T.tabActive : T.tabInactive} />,
          }}
        />
      ) : null}
      {showLiveTab ? (
        <Tab.Screen
          name="LiveTab"
          component={HostDashboardScreen}
          listeners={({ navigation: tabNav }) => ({
            // Centre Live button goes live straight away: open the
            // Host Dashboard with autoGoLive so its camera starts
            // at once — the dashboard itself is only the fallback
            // (not approved / no host row yet / not female).
            // preventDefault stops the plain tab switch so the
            // param-carrying navigation is the only one that runs.
            tabPress: (e) => {
              e.preventDefault();
              tabNav.navigate('LiveTab', { autoGoLive: true });
            },
          })}
          options={{
            tabBarLabel: () => null,
            tabBarIcon: () => (
              <LinearGradient colors={[T.violet, T.violetDark]} style={styles.liveBtn}>
                <Video size={23} color="#fff" strokeWidth={2.2} />
              </LinearGradient>
            ),
          }}
        />
      ) : null}
      <Tab.Screen
        name="MessagesTab"
        component={MessagesScreen}
        options={{
          tabBarLabel: ({ focused }) => <Text style={[styles.tabLabel, { color: focused ? T.tabActive : T.tabInactive }, focused && styles.tabLabelActive]}>Messages</Text>,
          tabBarIcon: ({ focused }) => <MessageCircle size={20} strokeWidth={focused ? 2.5 : 1.9} color={focused ? T.tabActive : T.tabInactive} />,
          tabBarBadge: unreadTotal > 0 ? unreadTotal : undefined,
          tabBarBadgeStyle: styles.msgBadge,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: ({ focused }) => <Text style={[styles.tabLabel, { color: focused ? T.tabActive : T.tabInactive }, focused && styles.tabLabelActive]}>Me</Text>,
          tabBarIcon: ({ focused }) => <UserRound size={20} strokeWidth={focused ? 2.5 : 1.9} color={focused ? T.tabActive : T.tabInactive} />,
        }}
      />
    </Tab.Navigator>
  );
}

const navigationRef = createNavigationContainerRef();

// ── Android hardware back button (2026-11-21) ────────────────────
// The native stack already pops inner pages (ChatDetail, VideoCall,
// WalletTab, …) — this handler only adds the two behaviours the
// native stack does NOT do:
//  • On a root tab screen other than Home, back goes to the Home tab
//    first instead of closing the app.
//  • On the Home tab, back needs a double-press within 2s to exit.
// It returns false for stack screens, so the native pop runs exactly
// once (no double-pop). It is registered after the navigator mounts,
// so it runs before the navigator's own back listener.
function useHardwareBack() {
  const { showToast } = useApp();
  const lastPressRef = useRef(0);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const nav = navigationRef.current;
      if (!nav || !nav.isReady()) return false;
      const rootState = nav.getRootState();
      if (!rootState || !rootState.routes || !rootState.routes.length) return false;
      const top = rootState.routes[rootState.index];
      // A stack screen above Main (ChatDetail, VideoCall, …):
      // let the native stack pop it — do nothing here.
      if (!top || top.name !== 'Main') return false;
      // On a tab: which tab is focused?
      const tabState = top.state;
      const focusedTab = tabState && tabState.routes
        ? tabState.routes[tabState.index].name
        : 'HomeTab';
      if (focusedTab !== 'HomeTab') {
        nav.navigate('Main', { screen: 'HomeTab' });
        return true;
      }
      // Home tab: double-press within 2s exits the app.
      const now = Date.now();
      if (now - lastPressRef.current < 2000) return false;
      lastPressRef.current = now;
      showToast('Press again to close the app');
      return true;
    });
    return () => sub.remove();
  }, [showToast]);
}

function Root() {
  useHardwareBack();

  // ── Auth gate (real Google login, 2026-11-22) ───────────────────
  // session === undefined → still restoring the saved session from
  // AsyncStorage. null → no session, show Login only. A session →
  // Main + the rest of the app. Sign-out flips it back to Login.
  const [session, setSession] = React.useState(undefined);
  // Access-blocked state (Hapa Mother "User" set): 'banned' or
  // 'deleted', set when checkAccess rejects the signed-in account.
  // The auth gate shows the blocked screen instead of Main/Login
  // until the user goes back to sign-in (the next sign-in re-runs
  // the check, so a restored account gets in again).
  const [blocked, setBlocked] = React.useState(null);
  // First-time signup flow (Waki Star flow, Livo theme): true
  // while the signed-in profile is incomplete — no country or no
  // gender saved — and the SignupFlow shows instead of Main.
  // The fetched profile is kept so the flow can prefill the
  // nickname / Google photo. Complete profiles never see it.
  const [needsSignup, setNeedsSignup] = React.useState(false);
  const [signupProfile, setSignupProfile] = React.useState(null);
  // One signup check per user id per app run (same dedupe as the
  // access check above); cleared on sign-out.
  const signupCheckedFor = React.useRef(null);
  // One access check per user id per app run: the initial
  // getSession() restore and the INITIAL_SESSION event describe the
  // same session, so the second one must not re-run the checks
  // (and a SIGNED_OUT clears it so the next sign-in checks again).
  const accessCheckedFor = React.useRef(null);

  // Runs once per sign-in: registers this device (best-effort,
  // never blocks sign-in) and checks whether the account may use
  // the app (ban / deleted). Returns the checkAccess status.
  const runAccessChecks = React.useCallback(async (user) => {
    if (!user) return { status: 'unknown' };
    try {
      const deviceId = await getOrCreateDeviceId();
      try {
        await registerDevice(user.id, deviceId);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('[Livo] registerDevice failed:', e && e.message);
      }
      return await checkAccess(user, deviceId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[Livo] access checks failed:', e && e.message);
      return { status: 'unknown' };
    }
  }, []);

  // Lets a resolved session into Main, or blocks it: on 'banned' /
  // 'deleted' the session is signed out (which flips the gate to
  // Login) and the blocked screen is shown instead. Returns true
  // when the session may proceed.
  const admitSession = React.useCallback(async (newSession) => {
    const user = newSession && newSession.user;
    if (!user) return false;
    if (accessCheckedFor.current === user.id) return true;
    const access = await runAccessChecks(user);
    if (access.status === 'banned' || access.status === 'deleted') {
      accessCheckedFor.current = null;
      setBlocked({ kind: access.status });
      try {
        await signOut();
      } catch (e) { /* already signed out / no session */ }
      return false;
    }
    accessCheckedFor.current = user.id;
    return true;
  }, [runAccessChecks]);

  // First-time signup check: a profile with no country or no
  // gender (null/empty) must go through the signup flow before
  // entering Main. Fail-open on a failed lookup (no network /
  // timeout) — the flow re-appears on the next launch instead of
  // locking the user out. The old standalone GenderScreen is
  // gone — gender is now collected inside this one flow.
  const resolveNeedsSignup = React.useCallback(async (user) => {
    if (!user || signupCheckedFor.current === user.id) return false;
    signupCheckedFor.current = user.id;
    try {
      const { profile, error } = await fetchMyProfile(user.id);
      if (error || !profile) return false;
      setSignupProfile(profile);
      return !String(profile.country || '').trim() || !String(profile.gender || '').trim();
    } catch (e) {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return undefined;
    }
    let mounted = true;
    // Startup watchdog (2026-11-24): the purple loader must NEVER
    // spin forever. If the session is still unresolved after 10s
    // (stalled token refresh, stalled device/access check, …), fail
    // open to the Login screen. A late-arriving session (listener
    // / restore) still flips the gate to Main afterwards, so nobody
    // gets locked out.
    const watchdog = setTimeout(() => {
      if (mounted) setSession((s) => (s === undefined ? null : s));
    }, 10000);
    // Restore the saved session, but run the access checks BEFORE
    // showing Main — a banned/deleted account must never flash the
    // app for a moment on launch. The restore is raced against a
    // timeout: getSession() can stall on a phone when the stored
    // token needs a network refresh, and the gate must not hang.
    (async () => {
      const restore = await withTimeout(supabase.auth.getSession());
      if (!mounted) return;
      const restored = restore && restore.data && restore.data.session
        ? restore.data.session
        : null;
      if (!restored) { setSession(null); return; }
      const admitted = (await withTimeout(admitSession(restored))) === true;
      if (!mounted) return;
      if (admitted && (await resolveNeedsSignup(restored.user))) {
        setNeedsSignup(true);
      }
      setSession(admitted ? restored : null);
    })();
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        accessCheckedFor.current = null;
        signupCheckedFor.current = null;
        setNeedsSignup(false);
        setSignupProfile(null);
        setSession(null);
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && newSession && newSession.user) {
        if (event === 'SIGNED_IN') {
          // First sign-in: create the profiles row if it does not exist.
          // Best-effort — login must not fail if the row can't be written
          // (e.g. a missing RLS policy); see src/supabase/auth.js.
          try {
            await ensureProfile(newSession.user);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log('[Livo] ensureProfile on SIGNED_IN failed:', e && e.message);
          }
        }
        // Device registration + ban/delete gate (best-effort: a
        // failed check lets the user in — see checkAccess).
        // Timeout-raced: a stalled access check must not hang the
        // startup gate — the watchdog below fails open to Login.
        const admitted = (await withTimeout(admitSession(newSession))) === true;
        if (!mounted) return;
        if (admitted && (await resolveNeedsSignup(newSession.user))) {
          setNeedsSignup(true);
        }
        setSession(admitted ? newSession : null);
        if (event === 'SIGNED_IN' && admitted && newSession.user) {
          // First-login notification prompt (Hapa-style: asked
          // once, right after sign-in — never at launch).
          // Fire-and-forget: the dialog must never block the gate.
          requestNotificationPermission(newSession.user.id).catch(() => {});
        }
        return;
      }
      setSession(newSession || null);
    });
    return () => {
      mounted = false;
      clearTimeout(watchdog);
      listener.subscription.unsubscribe();
    };
  }, [admitSession, resolveNeedsSignup]);

  // ── Incoming-call listener (real Realtime signalling, 2026-11-22) ──
  // Subscribes to ringing calls rows for the signed-in user and
  // navigates to the incoming-call screen. Re-runs when the session
  // changes so a fresh sign-in starts listening; with no session the
  // helper returns early and does nothing.
  useEffect(() => useIncomingCallListener(navigationRef), [session]);

  // Live auth value for screens (see AuthContext above): memoised on
  // the session object so consumers only re-render on real auth
  // changes, not on every Root render. profile is the gate's
  // signup-check profiles row (Root fetches it once per user) —
  // MainTabs reads the gender from it for the gender-based view.
  const authValue = React.useMemo(
    () => ({ session: session || null, user: (session && session.user) || null, profile: signupProfile || null }),
    [session, signupProfile],
  );

  if (session === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  // Access blocked by the admin panel (ban / deleted account):
  // the session was already signed out above, so this screen is
  // shown instead of Login until the user taps back.
  if (blocked && !session) {
    return (
      <View style={styles.blocked}>
        <Text style={styles.blockedTitle}>Account unavailable</Text>
        <Text style={styles.blockedText}>
          {blocked.kind === 'deleted'
            ? 'This account has been deleted. It can be restored from the admin panel within 3 months.'
            : 'Your account has been banned. Contact support.'}
        </Text>
        <TouchableOpacity style={styles.blockedBtn} onPress={() => setBlocked(null)}>
          <Text style={styles.blockedBtnTxt}>Back to sign-in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // First-time signup flow: country + photo + nickname + birthday
  // + gender, once, right after sign-in. It only appears when the
  // profile is incomplete (no country or no gender saved) — complete
  // profiles go straight to Main and never see it.
  if (session && needsSignup) {
    return (
      <AuthContext.Provider value={authValue}>
        <SignupFlow
          user={session.user}
          profile={signupProfile}
          onDone={() => setNeedsSignup(false)}
        />
        <StatusBar style="auto" />
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={authValue}>
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          // Smooth Vero-style slides (2026-11-23): the platform-default
          // animation on Android varies by OS version/theme (often a
          // fade / hard cut, and two screens cross-fading at once) —
          // pin an explicit slide-in on push, slide-back on pop, and
          // let the swipe-back gesture use the same slide animation.
          animation: 'slide_from_right',
          animationDuration: 300,
          animationTypeForReplace: 'push',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          fullScreenGestureEnabled: true,
          customAnimationOnGesture: true,
        }}
      >
        {session ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="VideoCall" component={VideoCallScreen} />
            <Stack.Screen name="Matching" component={MatchingScreen} />
            <Stack.Screen name="LiveRoom" component={LiveRoomScreen} />
            <Stack.Screen name="ChatDetail" component={ChatDetailScreen} />
            <Stack.Screen name="WalletTab" component={WalletScreen} />
            <Stack.Screen name="MyIncome" component={MyIncomeScreen} />
            <Stack.Screen name="AgentDetail" component={AgentDetailScreen} />
            <Stack.Screen name="HostDashboard" component={HostDashboardScreen} />
            <Stack.Screen name="Ranking" component={RankingScreen} />
            <Stack.Screen name="VIP" component={VIPScreen} />
            <Stack.Screen name="Rewards" component={RewardsScreen} />
            <Stack.Screen name="Tasks" component={TasksScreen} />
            <Stack.Screen name="AgentPortal" component={AgentPortalScreen} />
            <Stack.Screen name="Legal" component={LegalScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ animation: 'none' }} />
            <Stack.Screen name="Legal" component={LegalScreen} />
          </>
        )}
      </Stack.Navigator>
      <Toast />
      <StatusBar style="auto" />
    </NavigationContainer>
    </AuthContext.Provider>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppConfigProvider>
        <Root />
      </AppConfigProvider>
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  // Auth gate loading screen (while the saved session is restored).
  loading: { alignItems: 'center', backgroundColor: '#7c3aed', flex: 1, justifyContent: 'center' },
  // Access-blocked screen (ban / deleted account).
  blocked: { alignItems: 'center', backgroundColor: '#7c3aed', flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  blockedTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  blockedText: { color: '#ede9fe', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  blockedBtn: { backgroundColor: '#fff', borderRadius: 24, marginTop: 28, paddingHorizontal: 24, paddingVertical: 12 },
  blockedBtnTxt: { color: '#7c3aed', fontSize: 15, fontWeight: 'bold' },
  // Bottom nav — [New UI] dark purple bar, 70px total (8 + 50 + 12).
  tabBar: {
    backgroundColor: '#100320',
    borderTopColor: 'rgba(255,255,255,0.09)',
    borderTopWidth: 1,
    elevation: 8,
    height: 70,
    paddingBottom: 12,
    paddingHorizontal: 9,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  tabLabel: { color: THEME.tabInactive, fontSize: 9, fontWeight: '500' },
  tabLabelActive: { color: THEME.tabActive, fontWeight: '700' },
  // Centre "Live" button — raised purple gradient circle.
  liveBtn: {
    alignItems: 'center',
    borderColor: '#100320',
    borderRadius: 25,
    borderWidth: 3,
    elevation: 6,
    height: 49,
    justifyContent: 'center',
    marginTop: -19,
    shadowColor: '#7b2ff7',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.27,
    shadowRadius: 12,
    width: 49,
  },
  // Messages badge — 14px red circle with the unread count.
  msgBadge: {
    backgroundColor: '#f04f4b',
    borderColor: '#f9fffa',
    borderRadius: 7,
    borderWidth: 1.5,
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    height: 14,
    lineHeight: 13,
    minWidth: 14,
    paddingHorizontal: 3,
  },
  toast: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 20,
    bottom: 100,
    left: 40,
    paddingHorizontal: 18,
    paddingVertical: 10,
    position: 'absolute',
    right: 40,
  },
  toastText: { color: '#fff', textAlign: 'center' },
});
