import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, Modal, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppSettings } from '../src/context/AppSettingsContext';

export default function PinLockOverlay() {
  const { isAppLocked, verifyPin, biometricsEnabled, authenticateWithBiometrics, logout, isDark } = useAppSettings();
  const [pinInput, setPinInput] = useState<string>('');

  useEffect(() => {
    if (isAppLocked && biometricsEnabled) {
      // Trigger biometrics automatically if enrolled
      handleBiometrics();
    }
  }, [isAppLocked]);

  const handleBiometrics = async () => {
    const success = await authenticateWithBiometrics();
    if (success) {
      setPinInput('');
    }
  };

  if (!isAppLocked) return null;

  const handleNumberPress = async (num: number) => {
    if (pinInput.length >= 4) return;
    const newPin = pinInput + num;
    setPinInput(newPin);

    if (newPin.length === 4) {
      // Small timeout so user sees the 4th dot fill
      setTimeout(async () => {
        const correct = await verifyPin(newPin);
        if (!correct) {
          Alert.alert('Incorrect PIN', 'The 4-digit PIN code you entered is incorrect. Please try again.');
          setPinInput('');
        }
      }, 100);
    }
  };

  const handleDeletePress = () => {
    if (pinInput.length > 0) {
      setPinInput(pinInput.slice(0, -1));
    }
  };

  const themeStyles = isDark ? darkStyles : lightStyles;

  return (
    <Modal visible={isAppLocked} animationType="fade" transparent={false}>
      <SafeAreaView style={[styles.container, themeStyles.container]}>
        <View style={styles.header}>
          <Ionicons name="shield-checkmark" size={60} color={isDark ? '#38BDF8' : '#0284C7'} />
          <Text style={[styles.title, themeStyles.text]}>UniMed Access Lock</Text>
          <Text style={[styles.subtitle, themeStyles.subtext]}>Please enter your 4-digit lock PIN</Text>
        </View>

        {/* Indicators */}
        <View style={styles.indicatorContainer}>
          {[0, 1, 2, 3].map((index) => (
            <View
              key={index}
              style={[
                styles.indicatorDot,
                themeStyles.dot,
                pinInput.length > index && [styles.indicatorActive, themeStyles.activeDot],
              ]}
            />
          ))}
        </View>

        {/* Keyboard */}
        <View style={styles.keyboardContainer}>
          <View style={styles.row}>
            {[1, 2, 3].map((num) => (
              <TouchableOpacity
                key={num}
                style={[styles.keyButton, themeStyles.key]}
                onPress={() => handleNumberPress(num)}
                activeOpacity={0.7}
              >
                <Text style={[styles.keyText, themeStyles.text]}>{num}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            {[4, 5, 6].map((num) => (
              <TouchableOpacity
                key={num}
                style={[styles.keyButton, themeStyles.key]}
                onPress={() => handleNumberPress(num)}
                activeOpacity={0.7}
              >
                <Text style={[styles.keyText, themeStyles.text]}>{num}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            {[7, 8, 9].map((num) => (
              <TouchableOpacity
                key={num}
                style={[styles.keyButton, themeStyles.key]}
                onPress={() => handleNumberPress(num)}
                activeOpacity={0.7}
              >
                <Text style={[styles.keyText, themeStyles.text]}>{num}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            {/* Biometrics */}
            {biometricsEnabled ? (
              <TouchableOpacity
                style={[styles.keyButton, styles.utilKey]}
                onPress={handleBiometrics}
                activeOpacity={0.7}
              >
                <Ionicons name="finger-print" size={32} color={isDark ? '#38BDF8' : '#0284C7'} />
              </TouchableOpacity>
            ) : (
              <View style={styles.keyButton} />
            )}

            <TouchableOpacity
              style={[styles.keyButton, themeStyles.key]}
              onPress={() => handleNumberPress(0)}
              activeOpacity={0.7}
            >
              <Text style={[styles.keyText, themeStyles.text]}>0</Text>
            </TouchableOpacity>

            {/* Backspace */}
            <TouchableOpacity
              style={[styles.keyButton, styles.utilKey]}
              onPress={handleDeletePress}
              activeOpacity={0.7}
            >
              <Ionicons name="backspace-outline" size={26} color={isDark ? '#A1A1AA' : '#71717A'} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={logout} activeOpacity={0.8}>
          <Text style={[styles.logoutButtonText, themeStyles.logoutText]}>Forgot PIN? Sign Out</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 16,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    marginVertical: 40,
  },
  indicatorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  indicatorActive: {
    borderWidth: 0,
  },
  keyboardContainer: {
    width: '100%',
    maxWidth: 320,
    gap: 15,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
  },
  keyButton: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  utilKey: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: {
    fontSize: 28,
    fontWeight: '600',
  },
  logoutButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

const lightStyles = StyleSheet.create({
  container: {
    backgroundColor: '#F8FAFC',
  },
  text: {
    color: '#0F172A',
  },
  subtext: {
    color: '#64748B',
  },
  dot: {
    borderColor: '#CBD5E1',
    backgroundColor: 'transparent',
  },
  activeDot: {
    backgroundColor: '#0284C7',
  },
  key: {
    backgroundColor: '#E2E8F0',
  },
  logoutText: {
    color: '#0284C7',
  },
});

const darkStyles = StyleSheet.create({
  container: {
    backgroundColor: '#0F172A',
  },
  text: {
    color: '#F8FAFC',
  },
  subtext: {
    color: '#94A3B8',
  },
  dot: {
    borderColor: '#334155',
    backgroundColor: 'transparent',
  },
  activeDot: {
    backgroundColor: '#38BDF8',
  },
  key: {
    backgroundColor: '#1E293B',
  },
  logoutText: {
    color: '#38BDF8',
  },
});
