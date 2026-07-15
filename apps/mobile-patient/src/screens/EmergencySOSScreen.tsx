import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Linking,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';

export default function EmergencySOSScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const [isDispatched, setIsDispatched] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [pulseAnim]);

  const handleSOSPress = () => {
    Alert.alert(
      'Confirm Ambulance Request',
      'Are you sure you need an ambulance from UMC?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Dispatch', style: 'destructive', onPress: sendEmergencyRequest },
      ]
    );
  };

  const sendEmergencyRequest = async () => {
    try {
      setIsLoading(true);

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location Required', 'Location permission is required to dispatch the ambulance to your exact position.');
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = currentPosition.coords;

      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      if (!API_URL) {
        throw new Error('API URL is not configured.');
      }

      const token = await AsyncStorage.getItem('userToken');

      const response = await fetch(`${API_URL}/api/ambulance/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          pickup_lat: latitude,
          pickup_lng: longitude,
        }),
      });

      console.log("SOS Response Status:", response.status);
      const responseBody = await response.json();
      console.log("SOS Response Body:", responseBody);

      if (response.status === 201 || responseBody?.success === true) {
        const emergencyStatus = responseBody?.data?.status;
        
        if (emergencyStatus === 'ASSIGNED') {
          Alert.alert('Success', 'Driver Assigned!');
          setIsDispatched(true);
        } else if (emergencyStatus === 'PENDING') {
          Alert.alert('Success', 'Searching for nearby ambulance...');
          setIsDispatched(true);
        } else {
          Alert.alert('Success', 'SOS Sent Successfully!');
          setIsDispatched(true);
        }
      } else {
        const errorMessage = responseBody?.message || 'Unable to dispatch ambulance.';
        
        // ONLY trigger hotline if the API returns 404 No Drivers or 500 Server Error
        if (response.status === 404 || response.status === 500) {
          Alert.alert(
            'Request Failed',
            `${errorMessage}\n\nCalling emergency hotline fallback...`,
            [{ text: 'Call Hotline', onPress: () => callHotline() }, { text: 'Cancel', style: 'cancel' }]
          );
        } else {
          Alert.alert('Request Failed', errorMessage);
        }
      }
    } catch (error) {
      console.error("SOS Fetch Error:", error);
      const message = error instanceof Error ? error.message : 'Unable to dispatch ambulance right now.';
      // Trigger hotline call for network/connection errors (treated as server/500 equivalent)
      Alert.alert(
        'Request Failed',
        `${message}\n\nCalling emergency hotline fallback...`,
        [{ text: 'Call Hotline', onPress: () => callHotline() }, { text: 'Cancel', style: 'cancel' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const callHotline = async () => {
    const canOpen = await Linking.canOpenURL('tel:1990');
    if (canOpen) {
      await Linking.openURL('tel:1990');
    } else {
      Alert.alert('Unavailable', 'This device cannot place phone calls.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#7F1D1D" />

      <View style={styles.container}>
        {!isDispatched ? (
          <View style={styles.initialState}>
            <Text style={styles.warningText}>
              Emergency SOS will dispatch a University Medical Center ambulance to your current location.
            </Text>

            <View style={styles.centerStage}>
              <Animated.View style={[styles.sosGlow, { transform: [{ scale: pulseAnim }] }]} />
              <Animated.View style={[styles.sosButtonWrap, { transform: [{ scale: pulseAnim }] }]}>
                <TouchableOpacity
                  style={styles.sosButton}
                  activeOpacity={0.9}
                  onPress={handleSOSPress}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Ionicons name="hourglass-outline" size={28} color="#FFFFFF" />
                  ) : (
                    <Text style={styles.sosButtonText}>SOS</Text>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>

            <View style={styles.footerCard}>
              <Text style={styles.footerTitle}>UMC Emergency Contacts</Text>
              <View style={styles.contactRow}>
                <Ionicons name="call-outline" size={18} color="#991B1B" />
                <Text style={styles.contactText}>Hotline: 1990</Text>
              </View>
              <View style={styles.contactRow}>
                <Ionicons name="business-outline" size={18} color="#991B1B" />
                <Text style={styles.contactText}>Reception: +94 11 234 5678</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.successState}>
            <View style={styles.successIconCircle}>
              <FontAwesome5 name="ambulance" size={40} color="#FFFFFF" />
            </View>

            <Text style={styles.successTitle}>Ambulance Dispatched!</Text>
            <Text style={styles.successEta}>ETA: 10 mins</Text>
            <Text style={styles.successBody}>
              Stay calm. A University Medical Center ambulance has been dispatched to your exact location.
            </Text>

            <TouchableOpacity style={styles.callButton} onPress={callHotline} activeOpacity={0.9}>
              <Ionicons name="call" size={20} color="#FFFFFF" />
              <Text style={styles.callButtonText}>Call UMC Hotline</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#7F1D1D',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFF1F2',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
  },
  initialState: {
    flex: 1,
    justifyContent: 'space-between',
  },
  warningText: {
    color: '#7F1D1D',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 380,
  },
  sosGlow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  sosButtonWrap: {
    zIndex: 2,
  },
  sosButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7F1D1D',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 10,
    borderWidth: 8,
    borderColor: '#FEE2E2',
  },
  sosButtonText: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  footerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#7F1D1D',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 2,
  },
  footerTitle: {
    color: '#7F1D1D',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  contactText: {
    color: '#7F1D1D',
    fontSize: 15,
    fontWeight: '600',
  },
  successState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  successIconCircle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    shadowColor: '#7F1D1D',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 16,
    elevation: 8,
  },
  successTitle: {
    color: '#7F1D1D',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  successEta: {
    marginTop: 8,
    color: '#B91C1C',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  successBody: {
    marginTop: 14,
    color: '#7F1D1D',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 320,
  },
  callButton: {
    marginTop: 28,
    backgroundColor: '#991B1B',
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});