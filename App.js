import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { House, MessageCircle, Play, UserRound, Video } from 'lucide-react-native';
import { AppProvider, useApp } from './src/store';
import { supabase } from './src/supabase/client';
import { ensureProfile } from './src/supabase/auth';
import { useIncomingCallListener } from './src/calls/signalling';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import VideoCallScreen from './src/screens/VideoCallScreen';
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
// active #20a64b, centre raised 49px #84e34d circle with Video icon,
// Messages badge 2. Tab order: Home / Moments / Live / Messages / Me.
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#20a64b',
        tabBarInactiveTintColor: '#9aa39c',
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: ({ focused }) => <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>Home</Text>,
          tabBarIcon: ({ focused }) => <House size={20} strokeWidth={focused ? 2.5 : 1.9} color={focused ? '#20a64b' : '#9aa39c'} />,
        }}
      />
      <Tab.Screen
        name="MomentsTab"
        component={MomentsScreen}
        options={{
          tabBarLabel: ({ focused }) => <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>Moments</Text>,
          tabBarIcon: ({ focused }) => <Play size={20} strokeWidth={focused ? 2.5 : 1.9} color={focused ? '#20a64b' : '#9aa39c'} />,
        }}
      />
      <Tab.Screen
        name="LiveTab"
        component={HostDashboardScreen}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <View style={styles.liveBtn}>
              <Video size={23} color="#fff" strokeWidth={2.2} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="MessagesTab"
        component={MessagesScreen}
        options={{
          tabBarLabel: ({ focused }) => <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>Messages</Text>,
          tabBarIcon: ({ focused }) => <MessageCircle size={20} strokeWidth={focused ? 2.5 : 1.9} color={focused ? '#20a64b' : '#9aa39c'} />,
          tabBarBadge: 2,
          tabBarBadgeStyle: styles.msgBadge,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: ({ focused }) => <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>Me</Text>,
          tabBarIcon: ({ focused }) => <UserRound size={20} strokeWidth={focused ? 2.5 : 1.9} color={focused ? '#20a64b' : '#9aa39c'} />,
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
      showToast('আরেকবার চাপলে অ্যাপ বন্ধ হবে');
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
  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return undefined;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data && data.session ? data.session : null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;
      setSession(newSession || null);
      if (event === 'SIGNED_IN' && newSession && newSession.user) {
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
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // ── Incoming-call listener (real Realtime signalling, 2026-11-22) ──
  // Subscribes to ringing calls rows for the signed-in user and
  // navigates to the incoming-call screen. Re-runs when the session
  // changes so a fresh sign-in starts listening; with no session the
  // helper returns early and does nothing.
  useEffect(() => useIncomingCallListener(navigationRef), [session]);

  if (session === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="VideoCall" component={VideoCallScreen} />
            <Stack.Screen name="ChatDetail" component={ChatDetailScreen} />
            <Stack.Screen name="WalletTab" component={WalletScreen} />
            <Stack.Screen name="HostDashboard" component={HostDashboardScreen} />
            <Stack.Screen name="Ranking" component={RankingScreen} />
            <Stack.Screen name="VIP" component={VIPScreen} />
            <Stack.Screen name="Rewards" component={RewardsScreen} />
            <Stack.Screen name="Tasks" component={TasksScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
      <Toast />
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  // Auth gate loading screen (while the saved session is restored).
  loading: { alignItems: 'center', backgroundColor: '#7c3aed', flex: 1, justifyContent: 'center' },
  // Bottom nav — v0 design: mint-white bar, 70px total (8 + 50 + 12).
  tabBar: {
    backgroundColor: '#f9fffaf7',
    borderTopColor: 'rgba(47,74,51,0.06)',
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
  tabLabel: { color: '#9aa39c', fontSize: 9, fontWeight: '500' },
  tabLabelActive: { color: '#20a64b', fontWeight: '700' },
  // Centre "Live" button — raised lime-green circle, like the v0 preview.
  liveBtn: {
    alignItems: 'center',
    backgroundColor: '#84e34d',
    borderColor: '#f9fffa',
    borderRadius: 25,
    borderWidth: 4,
    elevation: 6,
    height: 49,
    justifyContent: 'center',
    marginTop: -19,
    shadowColor: '#51af31',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.27,
    shadowRadius: 12,
    width: 49,
  },
  // Messages badge — 14px red circle with white "2".
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
