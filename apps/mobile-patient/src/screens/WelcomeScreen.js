import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  TouchableOpacity, 
  SafeAreaView, 
  Platform,
  StatusBar
} from 'react-native';
// 1. Import useRouter for navigation between screens
import { useRouter } from 'expo-router';

export default function WelcomeScreen() {
  // 2. Initialize the router
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        
        <View style={styles.spacerDouble} />

        {/* 1. The White Logo Box */}
        <View style={styles.logoContainer}>
          <Image
            // Using the exact image path you provided
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
            // Navigate to the Create Account screen using expo-router
            router.push('/create-account');
          }}
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
        </TouchableOpacity>

        <View style={{ height: 15 }} />

        {/* 4. "I have already an account" Secondary Button */}
        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={() => {
            // Navigate to the Login screen using expo-router
            router.push('/login');
          }}
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

// Design Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1D666A', // Dark teal background
    // Ensure content stays below the status bar on Android
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden', // Prevents the image from spilling over the rounded corners
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    letterSpacing: 1.2,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  university: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)', 
  },
  primaryButton: {
    width: 300,
    height: 55,
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
  },
  secondaryButton: {
    width: 300,
    height: 55,
    backgroundColor: 'transparent',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  footer: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.54)', 
  },
});