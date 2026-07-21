import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
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

type LoginResponse = {
  message?: string;
  data?: {
    token: string;
  };
};

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password.trim()) {
      Alert.alert('Missing details', 'Enter your email and password to continue.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
        }),
      });

      const rawBody = await response.text();
      let body: LoginResponse | null = null;
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = { message: rawBody };
      }

      if (!response.ok) {
        Alert.alert('Sign in failed', body?.message || 'Check your credentials and try again.');
        return;
      }

      if (!body?.data?.token) {
        Alert.alert('Sign in failed', 'The server did not return a session token.');
        return;
      }

      await setSessionToken(body.data.token);

      // Async push notification sync - completely non-blocking
      registerForPushNotificationsAsync()
        .then((pushToken) => {
          if (pushToken) {
            apiFetch('/api/users/settings', {
              method: 'PATCH',
              body: JSON.stringify({ fcm_token: pushToken }),
            }).catch((err) => console.warn('Failed to upload push token:', err));
          }
        })
        .catch((err) => console.warn('Failed to register push token:', err));

      router.replace('/home');
    } catch (error) {
      console.error(error);
      Alert.alert('Network error', 'Could not reach the backend.');
    } finally {
      setIsLoading(false);
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
            <Pressable onPress={() => router.back()} hitSlop={12} disabled={isLoading}>
              <Text style={styles.backLink}>Back</Text>
            </Pressable>
            <Text style={styles.title}>Driver Login</Text>
            <Text style={styles.subtitle}>
              Sign in with the email and password created by the admin.
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              editable={!isLoading}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor="#94A3B8"
              secureTextEntry
              style={styles.input}
              editable={!isLoading}
            />

            <View style={styles.rowEnd}>
              <Text style={styles.helperText}>Secure access only</Text>
            </View>

            <Pressable
              style={[styles.primaryButton, isLoading && styles.primaryButtonLoading]}
              onPress={handleSignIn}
              disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Sign In</Text>
              )}
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
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 18,
  },
  rowEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
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
  primaryButtonLoading: {
    backgroundColor: '#0D9488',
    opacity: 0.85,
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
  ghostButtonDisabled: {
    opacity: 0.4,
  },
  ghostButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
  ghostButtonTextDisabled: {
    color: '#64748B',
  },
});
