// App.tsx - Main application with navigation

import './src/i18n';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NotesListScreen } from './src/screens/NotesListScreen';

import { SettingsScreen } from './src/screens/SettingsScreen';
import PureNotesService from './src/services/PureNotesService';
import BackgroundSyncService from './src/services/BackgroundSyncService';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const Stack = createNativeStackNavigator();

import { useNotesStore } from './src/stores/notesStore';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { EditorPrewarm } from './src/components/EditorPrewarm';

// Synchronous check — runs before the app renders so we can hard-block
// unsupported browsers entirely (no NavigationContainer, no notes UI).
function isWebPlatformSupported(): boolean {
  if (Platform.OS !== 'web') return true;
  try {
    const WebFileService = require('./src/services/WebFileService').default;
    return WebFileService.isSupported();
  } catch {
    // If the check itself fails, fail open so users on Native aren't locked out.
    return true;
  }
}

export default function App() {
  const loadNotes = useNotesStore(state => state.loadNotes);
  const { t } = useTranslation();
  // Lazy initializer — only runs once on mount.
  const [platformSupported] = useState<boolean>(() => isWebPlatformSupported());

  // Set the browser tab title on web for the unsupported-browser screen.
  // Inside NavigationContainer we use its documentTitle prop instead, since
  // react-navigation otherwise overwrites document.title with the active
  // screen name (e.g. "NotesList") on every navigation event.
  if (!platformSupported && Platform.OS === 'web' && typeof document !== 'undefined') {
    document.title = 'PureNotes';
  }

  useEffect(() => {
    // Skip all init on unsupported browsers — the app won't render anyway.
    if (!platformSupported) return;

    // Initialize app
    const initializeApp = async () => {
      try {
        // Set up deep linking for PureNotes callbacks
        PureNotesService.setupDeepLinking((_url) => { });
      } catch (error) {
        console.error('App initialization error:', error);
      }
    };

    initializeApp();

    // Background sync: poll the active storage provider for external changes.
    // It also handles foreground transitions internally via AppState
    // (running an immediate sync on inactive→active), so a separate
    // AppState listener here would be redundant — we removed the previous
    // listener that called loadNotes() on every foreground because it
    // triggered a full file re-read on top of BackgroundSync's
    // incremental sync, multiplying file-system pressure during the
    // critical WebView cold-start window.
    BackgroundSyncService.start();

    return () => {
      BackgroundSyncService.stop();
    };
  }, [platformSupported, loadNotes]);

  // Hard-block: render only the unsupported-browser notice. The notes UI,
  // navigation, and storage init are intentionally skipped because the app
  // can't function without File System Access API.
  if (!platformSupported) {
    return (
      <View style={browserStyles.fullScreenContainer}>
        <View style={browserStyles.fullScreenInner}>
          <Ionicons name="warning-outline" size={56} color="#FF9800" />
          <Text style={browserStyles.title}>{t('unsupported_browser_title')}</Text>
          <Text style={browserStyles.message}>{t('unsupported_browser_message')}</Text>
        </View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <NavigationContainer
        documentTitle={{
          // Hard-pin the browser tab title — without this, react-navigation
          // would replace document.title with the active screen name (e.g.
          // "NotesList" / "Settings") on every navigation event.
          formatter: () => 'PureNotes',
        }}
      >
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: '#FFFFFF' },
            headerTitleStyle: { fontWeight: 'bold' },
            headerShadowVisible: false, // Create a cleaner look
          }}
        >
          <Stack.Screen
            name="NotesList"
            component={NotesListScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              headerShown: false,
              presentation: 'modal'
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      {/* iOS WebKit warm-up. Renders eagerly at App root with its
          WKWebView in the visible window from t=0 (positioned offscreen).
          Best-effort — iOS aggressively kills WebContent processes for
          non-browser apps without the com.apple.developer.web-browser-engine
          entitlements, so the warm-up benefit may be reclaimed by iOS
          before the user taps. The fundamental WebView cold-start on iPad
          (4-10 s) cannot be fully eliminated for this app type — see
          Apple's Press Restrictions on browser-engine entitlements. */}
      <EditorPrewarm />
    </GestureHandlerRootView>
  );
}

const browserStyles = StyleSheet.create({
  // Full-screen block for unsupported browsers.
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#F0F2F5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  fullScreenInner: {
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
    textAlign: 'center',
  },
});
