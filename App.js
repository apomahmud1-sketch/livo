import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from './src/store';
import { COLORS } from './src/config';
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

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.green, // [Ref] green active tab, like the reference
        tabBarInactiveTintColor: COLORS.grey,
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ tabBarLabel: 'Home', tabBarIcon: () => <Text>🏠</Text> }} />
      <Tab.Screen name="MomentsTab" component={MomentsScreen} options={{ tabBarLabel: 'Moments', tabBarIcon: () => <Text>🎬</Text> }} />
      <Tab.Screen name="MessagesTab" component={MessagesScreen} options={{ tabBarLabel: 'Messages', tabBarIcon: () => <Text>💬</Text> }} />
      <Tab.Screen
        name="LiveTab"
        component={HostDashboardScreen}
        options={{
          tabBarLabel: '',
          tabBarIcon: () => (
            <View style={styles.liveBtn}>
              <Text style={styles.liveBtnText}>📹</Text>
            </View>
          ),
        }}
      />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ tabBarLabel: 'Me', tabBarIcon: () => <Text>👤</Text> }} />
    </Tab.Navigator>
  );
}

function Root() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="VideoCall" component={VideoCallScreen} />
        <Stack.Screen name="ChatDetail" component={ChatDetailScreen} />
        <Stack.Screen name="WalletTab" component={WalletScreen} />
        <Stack.Screen name="HostDashboard" component={HostDashboardScreen} />
        <Stack.Screen name="Ranking" component={RankingScreen} />
        <Stack.Screen name="VIP" component={VIPScreen} />
        <Stack.Screen name="Rewards" component={RewardsScreen} />
        <Stack.Screen name="Tasks" component={TasksScreen} />
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
  // Centre "Live" button — raised lime-green circle, like the reference.
  liveBtn: { alignItems: 'center', backgroundColor: '#a3e635', borderRadius: 28, height: 56, justifyContent: 'center', marginTop: -18, width: 56 },
  liveBtnText: { fontSize: 24 },
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
