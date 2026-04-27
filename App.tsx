// App.tsx - Main application with navigation

import './src/i18n';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NotesListScreen } from './src/screens/NotesListScreen';

import { SettingsScreen } from './src/screens/SettingsScreen';
import PureNotesService from './src/services/PureNotesService';
import BackgroundSyncService from './src/services/BackgroundSyncService';
import { AppState, Platform } from 'react-native';

const Stack = createNativeStackNavigator();

import { useNotesStore } from './src/stores/notesStore';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  const loadNotes = useNotesStore(state => state.loadNotes);

  useEffect(() => {
    // Initialize app
    const initializeApp = async () => {
      try {
        // Web Support Check
        if (Platform.OS === 'web') {
          const WebFileService = require('./src/services/WebFileService').default;
          if (!WebFileService.isSupported()) {
            // Delay slightly to ensure UI is ready
            setTimeout(() => {
              alert(
                'Unsupported Browser\n\n' +
                'This application requires a browser that supports the File System Access API (such as Chrome, Edge, or Opera) to access files on your computer.\n\n' +
                'Some features may not work in this browser.'
              );
            }, 1000);
          }
        }

        // Set up deep linking for PureNotes callbacks
        PureNotesService.setupDeepLinking((_url) => { });
      } catch (error) {
        console.error('App initialization error:', error);
      }
    };

    initializeApp();

    // Smart Sync: Refresh notes when app comes to foreground
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        loadNotes();
      }
    });

    // Background sync: poll the active storage provider for external changes
    BackgroundSyncService.start();

    return () => {
      subscription.remove();
      BackgroundSyncService.stop();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <NavigationContainer>
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
    </GestureHandlerRootView>
  );
}
