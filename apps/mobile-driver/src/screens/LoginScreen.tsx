import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiFetch, setSessionToken } from '../lib/api';
import { registerForPushNotificationsAsync } from '../lib/push';

export default function LoginScreen() {
  const router = useRouter();
  const [driverId, setDriverId] = useState('12345');
  const [password, setPassword] = useState('Kalahe');

  type LoginResponse = {
    message?: string;
    data?: {
      token: string;
    };
  };

  const parseLoginResponse = async (response: Response): Promise<LoginResponse | null> => {
    const rawBody = await response.text();

    if (!rawBody.trim()) {
      return null;
    }

    try {
      return JSON.parse(rawBody) as LoginResponse;
    } catch {
      return {
        message: rawBody,
      };
    }
  };

  const isDemoCredentials = (id: string, pass: string) => id === '12345' && pass === 'Kalahe';

  const handleSignIn = async () => {
    if (!driverId.trim() || !password.trim()) {
      Alert.alert('Missing details', 'Enter your driver ID and password to continue.');
      return;
    }

    if (isDemoCredentials(driverId.trim(), password)) {
      await setSessionToken('demo-driver-session');
      router.replace('/home?demo=1');
      return;
    }

    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? ''}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: driverId.trim(),
          password,
        }),
      });

      const body = await parseLoginResponse(response);

      if (!response.ok) {
        Alert.alert('Sign in failed', body?.message || 'Check your credentials and try again.');
        return;
      }

      if (!body?.data?.token) {
        Alert.alert('Sign in failed', 'The server did not return a session token.');
        return;
      }

      await setSessionToken(body.data.token);

      const pushToken = await registerForPushNotificationsAsync();
      if (pushToken) {
        await apiFetch('/api/users/settings', {
          method: 'PATCH',
          body: JSON.stringify({ fcm_token: pushToken }),
        });
      }

      router.replace('/home');
    } catch (error) {
      console.error(error);
      Alert.alert('Network error', 'Could not reach the backend.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.backgroundGlow} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.backLink}>Back</Text>
            </Pressable>
            <Text style={styles.title}>Driver Login</Text>
            <Text style={styles.subtitle}>
              Sign in with your staff credentials to access routes and transport requests.
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>Driver ID</Text>
            <TextInput
              value={driverId}
              onChangeText={setDriverId}
              placeholder="Enter your driver ID"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              style={styles.input}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor="#94A3B8"
              secureTextEntry
              style={styles.input}
            />

            <Text style={styles.demoHint}>Test credentials are prefilled for local app testing.</Text>

            <View style={styles.rowBetween}>
              <Pressable onPress={() => Alert.alert('Recovery', 'Add password recovery when ready.')}>
                <Text style={styles.secondaryAction}>Forgot password?</Text>
              </Pressable>
              <Text style={styles.helperText}>Secure access only</Text>
            </View>

            <Pressable style={styles.primaryButton} onPress={handleSignIn}>
              <Text style={styles.primaryButtonText}>Sign In</Text>
            </Pressable>

            <Pressable style={styles.ghostButton} onPress={() => router.push('/')}>
              <Text style={styles.ghostButtonText}>Return to landing page</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#06141D',
  },
  flex: {
    flex: 1,
  },
  backgroundGlow: {
    position: 'absolute',
    top: -80,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(45, 212, 191, 0.16)',
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
  },
  header: {
    paddingTop: 12,
  },
  backLink: {
    color: '#99F6E4',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 22,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    maxWidth: 260,
  },
  subtitle: {
    color: 'rgba(226, 232, 240, 0.76)',
    marginTop: 12,
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 320,
  },
  formCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 32,
    padding: 22,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  label: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 6,
  },
  input: {
    backgroundColor: '#E2E8F0',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: '#0F172A',
    fontSize: 16,
    marginBottom: 12,
  },
  demoHint: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 14,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 18,
  },
  secondaryAction: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '700',
  },
  helperText: {
    color: '#64748B',
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: '#0F766E',
    borderRadius: 18,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  ghostButton: {
    marginTop: 14,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
});