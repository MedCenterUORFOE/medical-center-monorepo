import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, Image 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; // Updated view context component wrapper
import { useRouter } from 'expo-router';

// Import libraries for Google Login
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

// Completes the auth session if the app was closed during login redirect flows
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const router = useRouter();

  // ✅ Decoupled hardcoded strings. Reading directly from global dynamic environment config package
  const API_URL = process.env.EXPO_PUBLIC_API_URL;

  // --- Function to handle standard Email/Password Login ---
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Validation Error', 'Please enter both email and password.');
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

      if (response.ok || response.status === 200 || response.status === 201) {
        router.push('/dashboard'); 
      } else {
        Alert.alert('Login Failed', data.message || 'Incorrect Email or Password!');
      }
    } catch (error) {
      Alert.alert('Network Error', 'Could not connect to the server. Please check your network and environment settings.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Function to handle Google Login ---
  const handleGoogleLogin = async () => {
    try {
      const redirectUrl = Linking.createURL('/dashboard');
      const authUrl = `${API_URL}/api/auth/google?redirect=${encodeURIComponent(redirectUrl)}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

      if (result.type === 'success') {
         router.push('/dashboard');
      } else if (result.type === 'cancel') {
         console.log("Google Login cancelled by user.");
      }
    } catch (error) {
      console.log("Google Login Error: ", error);
      Alert.alert("Error", "Something went wrong with Google Login.");
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

        {/* --- Bottom White Card Section --- */}
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
                {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Sign In</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.outlineButton} onPress={() => router.push('/create-account')}>
                <Text style={styles.outlineButtonText}>Register New Account</Text>
              </TouchableOpacity>

            </View>

            {/* --- OR Divider --- */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* --- Standard Guideline Google Login Button --- */}
            <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin}>
              <Image 
                source={{ uri: 'https://img.icons8.com/color/48/000000/google-logo.png' }} 
                style={styles.googleIconImage} 
              />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            {/* --- Footer Links Text --- */}
            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/create-account')}>
                <Text style={styles.footerLink}>Register</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// --- Design Layout Core Styling Configuration ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1D666A' },
  headerSection: { paddingHorizontal: 30, paddingTop: 40, paddingBottom: 20 },
  headerTitle: { color: '#FFFFFF', fontSize: 32, fontWeight: 'bold', marginBottom: 10 },
  headerSubtitle: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 16 },
  bottomCard: { flex: 1, backgroundColor: '#E8ECEC', borderTopLeftRadius: 40, borderTopRightRadius: 40 },
  scrollContent: { padding: 30 },
  innerWhiteBox: { backgroundColor: '#FFFFFF', borderRadius: 30, padding: 20 },
  label: { fontSize: 14, color: '#000000', marginBottom: 8, fontWeight: '500' },
  input: { backgroundColor: '#E0E0E0', borderRadius: 15, paddingHorizontal: 15, paddingVertical: 12, fontSize: 16, marginBottom: 20 },
  primaryButton: { backgroundColor: '#1D666A', borderRadius: 15, height: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 15, marginTop: 10 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  outlineButton: { borderWidth: 1, borderColor: '#1D666A', borderRadius: 15, height: 50, justifyContent: 'center', alignItems: 'center' },
  outlineButtonText: { color: '#1D666A', fontSize: 16, fontWeight: '600' },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 30 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(0, 0, 0, 0.54)' },
  dividerText: { marginHorizontal: 10, color: 'rgba(0, 0, 0, 0.54)', fontSize: 14 },
  googleButton: { 
    flexDirection: 'row', 
    backgroundColor: '#FFFFFF', 
    borderRadius: 15, 
    height: 55, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 30, 
    borderWidth: 1,
    borderColor: '#E0E0E0', 
    elevation: 2, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.1, 
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
  footerText: { color: 'rgba(0, 0, 0, 0.87)', fontSize: 15 },
  footerLink: { color: '#1D666A', fontWeight: 'bold', fontSize: 15 },
});