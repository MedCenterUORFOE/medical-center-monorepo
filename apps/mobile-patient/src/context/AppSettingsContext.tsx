import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useColorScheme, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';

export type ThemeType = 'light' | 'dark' | 'system';

interface AppSettingsContextType {
  theme: ThemeType;
  isDark: boolean;
  setTheme: (theme: ThemeType) => Promise<void>;
  biometricsEnabled: boolean;
  setBiometricsEnabled: (enabled: boolean) => Promise<void>;
  pinEnabled: boolean;
  isAppLocked: boolean;
  setIsAppLocked: (locked: boolean) => void;
  setPinCode: (pin: string) => Promise<void>;
  disablePinCode: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  authenticateWithBiometrics: () => Promise<boolean>;
}

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(undefined);

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const systemColorScheme = useColorScheme();

  const [theme, setThemeState] = useState<ThemeType>('system');
  const [biometricsEnabled, setBiometricsEnabledState] = useState<boolean>(false);
  const [pinEnabled, setPinEnabledState] = useState<boolean>(false);
  const [isAppLocked, setIsAppLocked] = useState<boolean>(false);

  // Compute active dark mode state
  const isDark = theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark');

  // Load initial settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const savedTheme = await AsyncStorage.getItem('appTheme') as ThemeType | null;
        if (savedTheme) setThemeState(savedTheme);

        const savedBio = await AsyncStorage.getItem('biometricsEnabled');
        setBiometricsEnabledState(savedBio === 'true');

        const savedPinEnabled = await AsyncStorage.getItem('pinEnabled');
        setPinEnabledState(savedPinEnabled === 'true');

        // Check if there is a pin code saved in secure store
        const pinCode = await SecureStore.getItemAsync('app_pin_code');
        if (savedPinEnabled === 'true' && pinCode) {
          setIsAppLocked(true);
        }
      } catch (e) {
        console.error('Failed to load app settings:', e);
      }
    }
    loadSettings();
  }, []);

  const setTheme = async (newTheme: ThemeType) => {
    try {
      await AsyncStorage.setItem('appTheme', newTheme);
      setThemeState(newTheme);
    } catch (e) {
      console.error('Failed to save theme setting:', e);
    }
  };

  const setBiometricsEnabled = async (enabled: boolean) => {
    try {
      await AsyncStorage.setItem('biometricsEnabled', String(enabled));
      setBiometricsEnabledState(enabled);
    } catch (e) {
      console.error('Failed to save biometrics setting:', e);
    }
  };

  const setPinCode = async (pin: string) => {
    try {
      await SecureStore.setItemAsync('app_pin_code', pin);
      await AsyncStorage.setItem('pinEnabled', 'true');
      setPinEnabledState(true);
      setIsAppLocked(false);
    } catch (e) {
      console.error('Failed to save PIN code:', e);
    }
  };

  const disablePinCode = async () => {
    try {
      await SecureStore.deleteItemAsync('app_pin_code');
      await AsyncStorage.setItem('pinEnabled', 'false');
      setPinEnabledState(false);
      setIsAppLocked(false);
    } catch (e) {
      console.error('Failed to disable PIN code:', e);
    }
  };

  const verifyPin = async (inputPin: string): Promise<boolean> => {
    try {
      const storedPin = await SecureStore.getItemAsync('app_pin_code');
      if (storedPin === inputPin) {
        setIsAppLocked(false);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Failed to verify PIN:', e);
      return false;
    }
  };

  const logout = async () => {
    try {
      await SecureStore.deleteItemAsync('userToken');
      await SecureStore.deleteItemAsync('userId');
      await AsyncStorage.removeItem('userToken');
      await AsyncStorage.removeItem('userId');
      setIsAppLocked(false);
      // Wait for navigation stack to be ready and clear history
      setTimeout(() => {
        router.replace('/login');
      }, 100);
    } catch (e) {
      console.error('Failed to logout cleanly:', e);
    }
  };

  const authenticateWithBiometrics = async (): Promise<boolean> => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) return false;

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to access UniMed',
        fallbackLabel: 'Enter PIN',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsAppLocked(false);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Biometric authentication failed:', e);
      return false;
    }
  };

  // Monitor AppState changes for Session Timeout & App Lock
  const lastBackgroundTime = useRef<number | null>(null);

  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        const now = Date.now();
        lastBackgroundTime.current = now;
        await AsyncStorage.setItem('lastBackgroundTime', String(now));
      } else if (nextAppState === 'active') {
        const storedTimeStr = await AsyncStorage.getItem('lastBackgroundTime');
        const bgTime = storedTimeStr ? parseInt(storedTimeStr, 10) : lastBackgroundTime.current;

        if (bgTime) {
          const elapsed = Date.now() - bgTime;
          // Session timeout: 15 minutes
          if (elapsed > 15 * 60 * 1000) {
            await logout();
            await AsyncStorage.removeItem('lastBackgroundTime');
            lastBackgroundTime.current = null;
            return;
          }
        }

        // Check if lock overlay is needed
        const pinActive = await AsyncStorage.getItem('pinEnabled');
        if (pinActive === 'true') {
          const pinCode = await SecureStore.getItemAsync('app_pin_code');
          if (pinCode) {
            setIsAppLocked(true);
          }
        }

        await AsyncStorage.removeItem('lastBackgroundTime');
        lastBackgroundTime.current = null;
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [pinEnabled]);

  return (
    <AppSettingsContext.Provider
      value={{
        theme,
        isDark,
        setTheme,
        biometricsEnabled,
        setBiometricsEnabled,
        pinEnabled,
        isAppLocked,
        setIsAppLocked,
        setPinCode,
        disablePinCode,
        verifyPin,
        logout,
        authenticateWithBiometrics,
      }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error('useAppSettings must be used within an AppSettingsProvider');
  }
  return context;
}
