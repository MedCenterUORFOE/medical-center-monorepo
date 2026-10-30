import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function EmergencySOSScreen() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [emergencyStatus, setEmergencyStatus] = useState<
    'IDLE' | 'PENDING' | 'ACCEPTED' | 'DISPATCHED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED'
  >('IDLE');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [driverDetails, setDriverDetails] = useState<{
    name: string;
    phone: string | null;
    vehicleRegistration: string;
  } | null>(null);

  // ── Countdown States ──
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(5);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  // Restore active emergency request from storage on mount
  useEffect(() => {
    const restoreActiveRequest = async () => {
      try {
        const storedId = await AsyncStorage.getItem('activeEmergencyRequestId');
        const storedStatus = await AsyncStorage.getItem('activeEmergencyStatus');
        if (storedId && storedStatus) {
          setRequestId(storedId);
          setEmergencyStatus(storedStatus as any);
        }
      } catch (e) {
        console.error('Error restoring active request state:', e);
      }
    };
    restoreActiveRequest();
  }, []);

  // Save active request state to storage
  useEffect(() => {
    const saveRequestState = async () => {
      try {
        if (requestId && emergencyStatus !== 'IDLE') {
          await AsyncStorage.setItem('activeEmergencyRequestId', requestId);
          await AsyncStorage.setItem('activeEmergencyStatus', emergencyStatus);
        } else {
          await AsyncStorage.removeItem('activeEmergencyRequestId');
          await AsyncStorage.removeItem('activeEmergencyStatus');
        }
      } catch (e) {
        console.error('Error saving request state:', e);
      }
    };
    saveRequestState();
  }, [requestId, emergencyStatus]);

  // Polling hook to query emergency request status
  useEffect(() => {
    if (!requestId || emergencyStatus !== 'PENDING') {
      return;
    }

    let intervalId: ReturnType<typeof setInterval>;

    const pollStatus = async () => {
      try {
        const API_URL = process.env.EXPO_PUBLIC_API_URL;
        const token =
          (await SecureStore.getItemAsync('userToken')) ||
          (await AsyncStorage.getItem('userToken'));

        const response = await fetch(`${API_URL}/api/ambulance/requests/${requestId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok) {
          console.warn('Poll response error status:', response.status);
          return;
        }

        const responseBody = await response.json();
        if (responseBody?.success && responseBody?.data) {
          const { status, driver, driver_id } = responseBody.data;

          if (
            (status === 'DISPATCHED' || status === 'ACCEPTED' || status === 'ARRIVED') &&
            (driver || driver_id)
          ) {
            clearInterval(intervalId);

            const name = driver?.user?.name || 'UMC Driver';
            const phone = driver?.user?.phone || null;
            const vehicleRegistration = driver?.vehicle_registration || 'Ambulance';

            setDriverDetails({
              name,
              phone,
              vehicleRegistration,
            });
            setEmergencyStatus(status);
            Alert.alert('Ambulance Dispatched', 'A driver has accepted your request and is en route!');
          } else if (status === 'CANCELLED') {
            clearInterval(intervalId);
            await AsyncStorage.removeItem('activeEmergencyRequestId');
            await AsyncStorage.removeItem('activeEmergencyStatus');
            setEmergencyStatus('IDLE');
            setRequestId(null);
            Alert.alert('Request Cancelled', 'Your emergency request was cancelled.', [
              { text: 'Return to Dashboard', onPress: () => router.replace('/(tabs)') },
            ]);
          } else if (status === 'COMPLETED') {
            clearInterval(intervalId);
            await AsyncStorage.removeItem('activeEmergencyRequestId');
            await AsyncStorage.removeItem('activeEmergencyStatus');
            setEmergencyStatus('IDLE');
            setRequestId(null);
            Alert.alert('Completed', 'The emergency run has been completed.', [
              { text: 'Return to Dashboard', onPress: () => router.replace('/(tabs)') },
            ]);
          }
        }
      } catch (error) {
        console.error('Error polling emergency status:', error);
      }
    };

    pollStatus();
    intervalId = setInterval(pollStatus, 4000);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [requestId, emergencyStatus, router]);

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

  // ── Native Phone Dialer Helper ──
  const handlePhoneCall = async (rawNumber: string) => {
    const cleanedNumber = rawNumber.replace(/[^\d+]/g, '');
    if (!cleanedNumber) return;
    const telUrl = `tel:${cleanedNumber}`;
    try {
      await Linking.openURL(telUrl);
    } catch (err) {
      console.warn('Unable to open native dialer:', err);
      Alert.alert('Unable to Open Dialer', `Please dial ${rawNumber} manually.`);
    }
  };

  // ── SOS Press: Trigger 5-Second Countdown Modal ──
  const handleSOSPress = () => {
    setCountdownSeconds(5);
    setIsCountingDown(true);

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    countdownTimerRef.current = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          setIsCountingDown(false);
          void sendEmergencyRequest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ── Cancel During Countdown: Clear Timer and Route to Dashboard ──
  const handleCancelCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setIsCountingDown(false);
    setCountdownSeconds(5);
    router.replace('/(tabs)');
  };

  // ── Dispatch Immediately: Skip Countdown ──
  const handleDispatchImmediately = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setIsCountingDown(false);
    void sendEmergencyRequest();
  };

  // ── Send Emergency Request to Backend ──
  const sendEmergencyRequest = async () => {
    try {
      setIsLoading(true);

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(
          'Location Required',
          'Location permission is required to dispatch the ambulance to your exact position.'
        );
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = currentPosition.coords;

      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      if (!API_URL) {
        throw new Error('API URL is not configured.');
      }

      const token =
        (await SecureStore.getItemAsync('userToken')) ||
        (await AsyncStorage.getItem('userToken'));

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

      console.log('SOS Response Status:', response.status);
      const responseBody = await response.json();
      console.log('SOS Response Body:', responseBody);

      if (response.status === 201 || responseBody?.success === true) {
        const status = responseBody?.data?.status;
        const reqId = responseBody?.data?.id;

        if (reqId) {
          setRequestId(reqId);
          await AsyncStorage.setItem('activeEmergencyRequestId', reqId);
          await AsyncStorage.setItem('activeEmergencyStatus', status || 'PENDING');
        }

        const serverMsg = responseBody?.message || '';
        if (serverMsg.toLowerCase().includes('no driver')) {
          setEmergencyStatus('IDLE');
          setRequestId(null);
          await AsyncStorage.removeItem('activeEmergencyRequestId');
          await AsyncStorage.removeItem('activeEmergencyStatus');
          await handlePhoneCall('0123456789');
          return;
        } else if (status === 'PENDING') {
          Alert.alert('Success', 'Searching for nearby ambulance...');
          setEmergencyStatus('PENDING');
        } else if (status === 'ASSIGNED' || status === 'DISPATCHED') {
          Alert.alert('Success', 'Driver Assigned!');
          const driver = responseBody?.data?.driver;
          if (driver) {
            setDriverDetails({
              name: driver.user?.name || 'UMC Driver',
              phone: driver.user?.phone || null,
              vehicleRegistration: driver.vehicle_registration || 'Ambulance',
            });
          }
          setEmergencyStatus(status === 'ASSIGNED' ? 'DISPATCHED' : status);
        } else {
          Alert.alert('Success', 'SOS Sent Successfully!');
          setEmergencyStatus('PENDING');
        }
      } else {
        const errorMessage = responseBody?.message || 'Unable to dispatch ambulance.';
        if (response.status === 404 || response.status === 500) {
          Alert.alert(
            'Request Failed',
            `${errorMessage}\n\nCalling emergency hotline fallback...`,
            [
              { text: 'Call Hotline', onPress: () => handlePhoneCall('0123456789') },
              { text: 'Dashboard', onPress: () => router.replace('/(tabs)'), style: 'cancel' },
            ]
          );
        } else {
          Alert.alert('Request Failed', errorMessage, [
            { text: 'OK', onPress: () => router.replace('/(tabs)') },
          ]);
        }
      }
    } catch (error) {
      console.error('SOS Fetch Error:', error);
      const message =
        error instanceof Error ? error.message : 'Unable to dispatch ambulance right now.';
      Alert.alert(
        'Request Failed',
        `${message}\n\nCalling emergency hotline fallback...`,
        [
          { text: 'Call Hotline', onPress: () => handlePhoneCall('0123456789') },
          { text: 'Dashboard', onPress: () => router.replace('/(tabs)'), style: 'cancel' },
        ]
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ── Cancel Active Emergency: Cancel on Backend & Route to Dashboard ──
  const handleCancelEmergency = async () => {
    Alert.alert(
      'Cancel Emergency Request',
      'Are you sure you want to cancel this ambulance request and return to the dashboard?',
      [
        { text: 'No, Keep Request', style: 'cancel' },
        {
          text: 'Yes, Cancel & Exit',
          style: 'destructive',
          onPress: async () => {
            // Stop any timer
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = null;
            }
            setIsCountingDown(false);

            // If an active request exists on backend, notify backend
            if (requestId) {
              try {
                setIsLoading(true);
                const API_URL = process.env.EXPO_PUBLIC_API_URL;
                const token =
                  (await SecureStore.getItemAsync('userToken')) ||
                  (await AsyncStorage.getItem('userToken'));

                const response = await fetch(
                  `${API_URL}/api/ambulance/requests/${requestId}/cancel`,
                  {
                    method: 'PATCH',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ reason: 'Cancelled by patient.' }),
                  }
                );

                if (!response.ok) {
                  const body = await response.json().catch(() => ({}));
                  console.warn('Emergency cancel API response warning:', body);
                }
              } catch (error) {
                console.error('Error cancelling emergency request on backend:', error);
              } finally {
                setIsLoading(false);
              }
            }

            // Clear local storage and reset state
            await AsyncStorage.removeItem('activeEmergencyRequestId');
            await AsyncStorage.removeItem('activeEmergencyStatus');
            setEmergencyStatus('IDLE');
            setRequestId(null);
            setDriverDetails(null);

            // Navigate directly to Dashboard
            router.replace('/(tabs)');
          },
        },
      ]
    );
  };

  const isIdle = emergencyStatus === 'IDLE';
  const isPending = emergencyStatus === 'PENDING';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#7F1D1D" />

      {/* ── COUNTDOWN MODAL ── */}
      <Modal
        visible={isCountingDown}
        transparent
        animationType="fade"
        onRequestClose={handleCancelCountdown}
      >
        <View style={styles.countdownOverlay}>
          <View style={styles.countdownCard}>
            <View style={styles.countdownWarningIconCircle}>
              <Ionicons name="warning" size={32} color="#DC2626" />
            </View>

            <Text style={styles.countdownTitle}>DISPATCHING AMBULANCE</Text>
            <Text style={styles.countdownSubtitle}>
              An ambulance will be requested to your current location in
            </Text>

            <View style={styles.countdownNumberCircle}>
              <Text style={styles.countdownNumberText}>{countdownSeconds}</Text>
              <Text style={styles.countdownSecondsLabel}>seconds</Text>
            </View>

            <TouchableOpacity
              style={styles.cancelCountdownButton}
              onPress={handleCancelCountdown}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle" size={22} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.cancelCountdownButtonText}>Cancel & Exit to Dashboard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dispatchNowButton}
              onPress={handleDispatchImmediately}
              activeOpacity={0.8}
            >
              <Ionicons name="flash" size={18} color="#7F1D1D" style={{ marginRight: 6 }} />
              <Text style={styles.dispatchNowButtonText}>Dispatch Immediately</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.container}>
        {/* ── TOP HEADER WITH BACK / CANCEL TO DASHBOARD ── */}
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={isIdle ? () => router.replace('/(tabs)') : handleCancelEmergency}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#7F1D1D" />
            <Text style={styles.backButtonText}>Dashboard</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Emergency SOS</Text>
          <View style={{ width: 85 }} />
        </View>

        {isIdle && (
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

            {/* ── UMC EMERGENCY CONTACTS (Interactive Call Buttons) ── */}
            <View style={styles.footerCard}>
              <Text style={styles.footerTitle}>UMC Emergency Contacts</Text>

              {/* Hotline Row: Tap to Call */}
              <TouchableOpacity
                style={styles.contactButton}
                onPress={() => handlePhoneCall('0123456789')}
                activeOpacity={0.7}
              >
                <View style={styles.contactLeft}>
                  <View style={styles.contactIconCircle}>
                    <Ionicons name="call" size={18} color="#991B1B" />
                  </View>
                  <View>
                    <Text style={styles.contactNameLabel}>Emergency Hotline</Text>
                    <Text style={styles.contactText}>0123456789</Text>
                  </View>
                </View>
                <View style={styles.callBadge}>
                  <Ionicons name="call" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.callBadgeText}>Call</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.contactDivider} />

              {/* Reception Row: Tap to Call */}
              <TouchableOpacity
                style={styles.contactButton}
                onPress={() => handlePhoneCall('+94 11 234 5678')}
                activeOpacity={0.7}
              >
                <View style={styles.contactLeft}>
                  <View style={[styles.contactIconCircle, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="business" size={18} color="#991B1B" />
                  </View>
                  <View>
                    <Text style={styles.contactNameLabel}>UMC Reception</Text>
                    <Text style={styles.contactText}>+94 11 234 5678</Text>
                  </View>
                </View>
                <View style={styles.callBadge}>
                  <Ionicons name="call" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.callBadgeText}>Call</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isPending && (
          <View style={styles.pendingState}>
            <View style={styles.pulseContainer}>
              <ActivityIndicator color="#DC2626" size="large" />
            </View>

            <Text style={styles.pendingTitle}>Finding a Driver</Text>
            <Text style={styles.pendingBody}>
              Finding an available ambulance driver near you... please wait.
            </Text>

            <TouchableOpacity
              style={styles.callButton}
              onPress={() => handlePhoneCall('0123456789')}
              activeOpacity={0.9}
            >
              <Ionicons name="call" size={20} color="#FFFFFF" />
              <Text style={styles.callButtonText}>Call UMC Hotline (0123456789)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelLinkButton}
              onPress={handleCancelEmergency}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle-outline" size={18} color="#BE123C" />
              <Text style={styles.cancelLinkButtonText}>Cancel Request & Return</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isIdle && !isPending && (
          <View style={styles.successState}>
            <View style={styles.successIconCircle}>
              <FontAwesome5 name="ambulance" size={40} color="#FFFFFF" />
            </View>

            <Text style={styles.successTitle}>Ambulance Dispatched!</Text>

            {driverDetails ? (
              <View style={styles.driverCard}>
                <Text style={styles.driverCardTitle}>Driver & Vehicle Details</Text>
                <View style={styles.driverInfoRow}>
                  <Ionicons name="person" size={16} color="#7F1D1D" />
                  <Text style={styles.driverInfoText}>Name: {driverDetails.name}</Text>
                </View>
                <View style={styles.driverInfoRow}>
                  <Ionicons name="car" size={16} color="#7F1D1D" />
                  <Text style={styles.driverInfoText}>Vehicle: {driverDetails.vehicleRegistration}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.successEta}>ETA: 10 mins</Text>
            )}

            <Text style={styles.successBody}>
              Stay calm. A University Medical Center ambulance has been dispatched to your exact location.
            </Text>

            <TouchableOpacity
              style={styles.callButton}
              onPress={() => handlePhoneCall(driverDetails?.phone || '0123456789')}
              activeOpacity={0.9}
            >
              <Ionicons name="call" size={20} color="#FFFFFF" />
              <Text style={styles.callButtonText}>
                {driverDetails?.phone
                  ? `Call Driver (${driverDetails.name})`
                  : 'Call UMC Hotline (0123456789)'}
              </Text>
            </TouchableOpacity>

            {driverDetails?.phone ? (
              <TouchableOpacity
                style={styles.secondaryCallButton}
                onPress={() => handlePhoneCall('0123456789')}
                activeOpacity={0.8}
              >
                <Ionicons name="call-outline" size={18} color="#991B1B" />
                <Text style={styles.secondaryCallButtonText}>Call UMC Hotline (0123456789)</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.cancelLinkButton}
              onPress={handleCancelEmergency}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle-outline" size={18} color="#BE123C" />
              <Text style={styles.cancelLinkButtonText}>Cancel SOS Request & Return</Text>
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
    paddingTop: 10,
    paddingBottom: 20,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 6,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#7F1D1D',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  backButtonText: {
    color: '#7F1D1D',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  headerTitle: {
    color: '#7F1D1D',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  initialState: {
    flex: 1,
    justifyContent: 'space-between',
  },
  warningText: {
    color: '#7F1D1D',
    fontSize: 15.5,
    lineHeight: 23,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 6,
  },
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 340,
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
    padding: 16,
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
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFF5F5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  contactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contactIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactNameLabel: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '600',
  },
  contactText: {
    color: '#7F1D1D',
    fontSize: 15,
    fontWeight: '800',
  },
  contactDivider: {
    height: 6,
  },
  callBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  callBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  successState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  successIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#7F1D1D',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 16,
    elevation: 8,
  },
  successTitle: {
    color: '#7F1D1D',
    fontSize: 28,
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
    marginTop: 12,
    color: '#7F1D1D',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
  },
  callButton: {
    marginTop: 22,
    backgroundColor: '#991B1B',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
  secondaryCallButton: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  secondaryCallButtonText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '700',
  },
  pendingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  pendingTitle: {
    color: '#7F1D1D',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 18,
  },
  pendingBody: {
    marginTop: 12,
    color: '#7F1D1D',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 20,
  },
  pulseContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7F1D1D',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
  },
  driverCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    width: '100%',
    marginTop: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#7F1D1D',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 1,
  },
  driverCardTitle: {
    color: '#7F1D1D',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FEE2E2',
    paddingBottom: 6,
  },
  driverInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  driverInfoText: {
    color: '#7F1D1D',
    fontSize: 14.5,
    fontWeight: '600',
  },
  cancelLinkButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  cancelLinkButtonText: {
    color: '#BE123C',
    fontSize: 15,
    fontWeight: '700',
  },

  // ── Countdown Modal Styles ──
  countdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(127, 29, 29, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  countdownCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  countdownWarningIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  countdownTitle: {
    color: '#7F1D1D',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  countdownSubtitle: {
    color: '#4B5563',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  countdownNumberCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 4,
    borderColor: '#FEE2E2',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  countdownNumberText: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 44,
  },
  countdownSecondsLabel: {
    color: '#FEE2E2',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cancelCountdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 16,
    paddingVertical: 14,
    width: '100%',
    marginBottom: 10,
  },
  cancelCountdownButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  dispatchNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 16,
    paddingVertical: 12,
    width: '100%',
  },
  dispatchNowButtonText: {
    color: '#7F1D1D',
    fontSize: 14,
    fontWeight: '700',
  },
});