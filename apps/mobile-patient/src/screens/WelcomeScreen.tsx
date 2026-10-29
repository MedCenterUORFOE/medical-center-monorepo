import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  TouchableOpacity, 
  Platform,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; // ✅ Swapped to modern context view wrapper
import { useRouter } from 'expo-router';
import { colors } from '../theme/colors';

export default function WelcomeScreen() {
  // Initialize the routing context module hooks
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={styles.content}>
        
        <View style={styles.spacerDouble} />

        {/* 1. The White Logo Box */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/images/appimage.png')} 
            style={styles.logoImage}
            resizeMode="cover"
          />
        </View>

        <View style={{ height: 20 }} />

        {/* 2. The Text Section */}
        <Text style={styles.title}>UniMed</Text>
        <Text style={styles.subtitle}>UNIVERSITY MEDICAL CENTER</Text>
        <Text style={styles.university}>University of Ruhuna</Text>

        <View style={styles.spacerDouble} />

        {/* 3. "Get Started" Primary Button */}
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={() => {
            router.push('/create-account');
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
        </TouchableOpacity>

        <View style={{ height: 15 }} />

        {/* 4. "I have already an account" Secondary Button */}
        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={() => {
            router.push('/login');
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>I have already an account</Text>
        </TouchableOpacity>

        <View style={styles.spacerSingle} />

        {/* 5. Bottom Footer Text */}
        <Text style={styles.footer}>Faculty of Engineering University of Ruhuna</Text>
        <View style={{ height: 20 }} />

      </View>
    </SafeAreaView>
  );
}

// Design Layout Core Styling Configuration
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    width: '100%',
  },
  spacerSingle: {
    flex: 1,
  },
  spacerDouble: {
    flex: 2,
  },
  logoContainer: {
    width: 150,
    height: 110,
    backgroundColor: colors.primary,
    borderRadius: 20,
    overflow: 'hidden', // Forces image assets to bend exactly around boundary clips
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    letterSpacing: 1.2,
    color: colors.primaryText,
    marginBottom: 8,
  },
  university: {
    fontSize: 16,
    color: colors.textSecondary, 
  },
  primaryButton: {
    width: 300,
    height: 55,
    backgroundColor: colors.primary,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textOnPrimary,
  },
  secondaryButton: {
    width: 300,
    height: 55,
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  footer: {
    fontSize: 10,
    color: colors.textSecondary, 
  },
});