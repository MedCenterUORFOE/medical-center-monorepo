import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '../theme/colors';
import { useAppSettings } from '../context/AppSettingsContext';
import { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { registerDeviceToken } from '../notifications/pushNotifications';

GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });

export default function LoginScreen() {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const router = useRouter();
  const { authenticateWithBiometrics, biometricsEnabled, setBiometricsEnabled } = useAppSettings();

  // Dynamically decoupled environment config package reference
  const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

  // Trigger biometric auto-login if the user has successfully logged in once
  useEffect(() => {
    async function checkAutoLogin() {
      try {
        const hasLoggedInOnce = await AsyncStorage.getItem('hasLoggedInOnce');
        const token = await SecureStore.getItemAsync('userToken');

        if (hasLoggedInOnce === 'true' && token && biometricsEnabled) {
          const success = await authenticateWithBiometrics();
          if (success) {
            router.replace('/(tabs)' as any);
          }
        }
      } catch (e) {
        console.error("Biometric auto-login error:", e);
      }
    }
    checkAutoLogin();
  }, [biometricsEnabled]);

  // --- Function to handle standard Email/Password Login Navigation Flow ---
  const handleLogin = async () => {
    if (!API_URL) {
      Alert.alert('Configuration Error', 'API URL is not configured.');
      return;
    }

    if (!email || !password) {
      Alert.alert('Validation Error', 'Please enter both your email address and secure password.');
      return;
    }

    if (!API_URL) {
      console.error('EXPO_PUBLIC_API_URL is not set in this build');
      Alert.alert('Configuration Error', 'The server address is not configured in this build.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await response.json();
      console.log("🟢 BACKEND LOGIN RESPONSE:", JSON.stringify(data, null, 2));

      if (response.ok || response.status === 200 || response.status === 201) {

        // ✅ Fix: Extracting relevant details from inside 'data.data'
        const activeUserId = data.data?.user?.id;
        const activeToken = data.data?.token;

        if (activeUserId) {
          await SecureStore.setItemAsync('userId', String(activeUserId));
          await AsyncStorage.setItem('userId', String(activeUserId));
        } else {
          console.warn("⚠️ Warning: User ID not found in data.data.user.id");
        }

        // ✅ Fix: Saving the Token
        if (activeToken) {
          await SecureStore.setItemAsync('userToken', String(activeToken));
          await AsyncStorage.setItem('userToken', String(activeToken));
        }

        if (activeUserId && activeToken) {
          await AsyncStorage.setItem('hasLoggedInOnce', 'true');
          // Enable biometrics by default on first successful login if not configured
          const savedBio = await AsyncStorage.getItem('biometricsEnabled');
          if (savedBio === null) {
            await setBiometricsEnabled(true);
          }
        }

        await registerDeviceToken();
        router.push('/(tabs)' as any);

      } else {
        Alert.alert('Login Failed', data.message || 'Incorrect Email or Password combination!');
      }
    } catch (error) {
      console.error("Login Error:", error);
      if (error instanceof SyntaxError) {
        Alert.alert('Server Error', 'The server returned an unexpected response.');
      } else {
        Alert.alert('Network Error', 'Could not connect to the server.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // --- Function to handle Google SSO Login Cloud Handshake ---
  const handleGoogleLogin = async () => {
    if (!API_URL) {
      Alert.alert('Configuration Error', 'API URL is not configured.');
      return;
    }

    setIsLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      // Force the account picker
      try { await GoogleSignin.signOut(); } catch (e) { }
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return;

      const idToken = response.data.idToken;
      if (!idToken) {
        Alert.alert('Login Failed', 'Unable to verify Google Account.');
        return;
      }

      const res = await fetch(`${API_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      const data = await res.json();

      if (!res.ok) {
        Alert.alert('Login Failed', data.message || 'Authentication failed on server.');
        return;
      }

      const activeUserId = data.data?.user?.id;
      const activeToken = data.data?.token;

      if (activeUserId) {
        await SecureStore.setItemAsync('userId', String(activeUserId));
        await AsyncStorage.setItem('userId', String(activeUserId));
      } else {
        console.warn("⚠️ Warning: User ID not found in data.data.user.id");
      }

      if (activeToken) {
        await SecureStore.setItemAsync('userToken', String(activeToken));
        await AsyncStorage.setItem('userToken', String(activeToken));
      }

      if (activeUserId && activeToken) {
        await AsyncStorage.setItem('hasLoggedInOnce', 'true');
        const savedBio = await AsyncStorage.getItem('biometricsEnabled');
        if (savedBio === null) {
          await setBiometricsEnabled(true);
        }
      }

      await registerDeviceToken();
      router.push('/(tabs)' as any);

    } catch (error: any) {
      if (isErrorWithCode(error)) {
        if (error.code === statusCodes.IN_PROGRESS) return;
        if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          Alert.alert('Error', 'Google Play Services are not available on this device.');
          return;
        }
      }
      console.error(error.message);
      Alert.alert('Authentication Error', 'An error occurred during Google Sign-In.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

        {/* --- Top Header Section --- */}
        <View style={styles.headerSection}>
          <Text style={styles.headerTitle}>Welcome back</Text>
          <Text style={styles.headerSubtitle}>sign in to your UniMed account</Text>
        </View>

        {/* --- Bottom White Card Layout Section --- */}
        <View style={styles.bottomCard}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

            <View style={styles.innerWhiteBox}>

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={styles.primaryButtonText}>Sign In</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.outlineButton} onPress={() => router.push('/create-account' as any)}>
                <Text style={styles.outlineButtonText}>Register New Account</Text>
              </TouchableOpacity>

            </View>

            {/* --- OR Visual Separator Divider --- */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* --- Standard Guideline Google Login Button Elements --- */}
            <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin}>
              <Image
                source={{ uri: 'https://img.icons8.com/color/48/000000/google-logo.png' }}
                style={styles.googleIconImage}
              />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            {/* --- Footer Links Navigation Text --- */}
            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/create-account' as any)}>
                <Text style={styles.footerLink}>Register</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// --- Design Layout Core Styling Configuration Mapping Rules ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.softSurface },
  headerSection: { paddingHorizontal: 30, paddingTop: 40, paddingBottom: 20 },
  headerTitle: { color: colors.textPrimary, fontSize: 32, fontWeight: 'bold', marginBottom: 10 },
  headerSubtitle: { color: colors.textSecondary, fontSize: 16 },
  bottomCard: { flex: 1, backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  scrollContent: { padding: 24 },
  innerWhiteBox: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6 },
  label: { fontSize: 14, color: colors.textPrimary, marginBottom: 8, fontWeight: '500' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, fontSize: 16, marginBottom: 20 },
  primaryButton: { backgroundColor: colors.primary, borderRadius: 28, height: 52, justifyContent: 'center', alignItems: 'center', marginBottom: 15, marginTop: 10, elevation: 2, shadowColor: colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  primaryButtonText: { color: colors.textOnPrimary, fontSize: 16, fontWeight: '600' },
  outlineButton: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 28, height: 52, justifyContent: 'center', alignItems: 'center' },
  outlineButtonText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { marginHorizontal: 10, color: colors.textSecondary, fontSize: 14 },
  googleButton: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3
  },
  googleIconImage: {
    width: 24,
    height: 24,
    marginRight: 12
  },
  googleButtonText: {
    color: '#757575',
    fontSize: 16,
    fontWeight: '600'
  },
  footerContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: colors.textSecondary, fontSize: 15 },
  footerLink: { color: colors.primaryText, fontWeight: 'bold', fontSize: 15 },
});