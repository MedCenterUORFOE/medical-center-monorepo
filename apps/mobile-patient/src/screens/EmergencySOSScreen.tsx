import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  const [emergencyStatus, setEmergencyStatus] = useState<'IDLE' | 'PENDING' | 'ACCEPTED' | 'DISPATCHED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED'>('IDLE');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [driverDetails, setDriverDetails] = useState<{ name: string; phone: string | null; vehicleRegistration: string } | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

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
        console.error("Error restoring active request state:", e);
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
        console.error("Error saving request state:", e);
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
        const token = await AsyncStorage.getItem('userToken');

        const response = await fetch(`${API_URL}/api/ambulance/requests/${requestId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok) {
          console.warn("Poll response error status:", response.status);
          return;
        }

        const responseBody = await response.json();
        if (responseBody?.success && responseBody?.data) {
          const { status, driver, driver_id } = responseBody.data;

          if ((status === 'DISPATCHED' || status === 'ACCEPTED' || status === 'ARRIVED') && (driver || driver_id)) {
            clearInterval(intervalId);
            
            const name = driver?.user?.name || "UMC Driver";
            const phone = driver?.user?.phone || null;
            const vehicleRegistration = driver?.vehicle_registration || "Ambulance";

            setDriverDetails({
              name,
              phone,
              vehicleRegistration,
            });
            setEmergencyStatus(status);
            Alert.alert('Ambulance Dispatched', 'A driver has accepted your request and is en route!');
          } else if (status === 'CANCELLED') {
            clearInterval(intervalId);
            setEmergencyStatus('IDLE');
            setRequestId(null);
            Alert.alert('Request Cancelled', 'Your emergency request was cancelled.');
          } else if (status === 'COMPLETED') {
            clearInterval(intervalId);
            setEmergencyStatus('IDLE');
            setRequestId(null);
            Alert.alert('Completed', 'The emergency run has been completed.');
          }
        }
      } catch (error) {
        console.error("Error polling emergency status:", error);
      }
    };

    pollStatus();
    intervalId = setInterval(pollStatus, 4000);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [requestId, emergencyStatus]);

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
        const status = responseBody?.data?.status;
        const reqId = responseBody?.data?.id;

        if (reqId) {
          setRequestId(reqId);
        }

        if (status === 'PENDING') {
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
            [{ text: 'Call Hotline', onPress: () => callHotline() }, { text: 'Cancel', style: 'cancel' }]
          );
        } else {
          Alert.alert('Request Failed', errorMessage);
        }
      }
    } catch (error) {
      console.error("SOS Fetch Error:", error);
      const message = error instanceof Error ? error.message : 'Unable to dispatch ambulance right now.';
      Alert.alert(
        'Request Failed',
        `${message}\n\nCalling emergency hotline fallback...`,
        [{ text: 'Call Hotline', onPress: () => callHotline() }, { text: 'Cancel', style: 'cancel' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEmergency = async () => {
    if (!requestId) return;

    Alert.alert(
      'Cancel Emergency Request',
      'Are you sure you want to cancel this ambulance request?',
      [
        { text: 'No, Keep Request', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              const API_URL = process.env.EXPO_PUBLIC_API_URL;
              const token = await AsyncStorage.getItem('userToken');

              const response = await fetch(`${API_URL}/api/ambulance/requests/${requestId}/cancel`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ reason: 'Cancelled by patient.' }),
              });

              if (response.ok) {
                Alert.alert('Cancelled', 'Your request has been cancelled.');
                setEmergencyStatus('IDLE');
                setRequestId(null);
                setDriverDetails(null);
              } else {
                const body = await response.json();
                Alert.alert('Error', body.message || 'Unable to cancel request.');
              }
            } catch (error) {
              console.error(error);
              Alert.alert('Error', 'Unable to cancel request right now.');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const callHotline = async () => {
    const canOpen = await Linking.canOpenURL('tel:1990');
    if (canOpen) {
      await Linking.openURL('tel:1990');
    } else {
      Alert.alert('Unavailable', 'This device cannot place phone calls.');
    }
  };

  const isIdle = emergencyStatus === 'IDLE';
  const isPending = emergencyStatus === 'PENDING';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#7F1D1D" />

      <View style={styles.container}>
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
        )}

        {isPending && (
          <View style={styles.pendingState}>
            <View style={styles.pulseContainer}>
              <ActivityIndicator color="#DC2626" size="large" />
            </View>

            <Text style={styles.pendingTitle}>Finding a Driver</Text>
            <Text style={styles.pendingBody}>
              Finding an available driver near you... please wait.
            </Text>

            <TouchableOpacity style={styles.callButton} onPress={callHotline} activeOpacity={0.9}>
              <Ionicons name="call" size={20} color="#FFFFFF" />
              <Text style={styles.callButtonText}>Call UMC Hotline</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelLinkButton} onPress={handleCancelEmergency} activeOpacity={0.8}>
              <Ionicons name="close-circle-outline" size={18} color="#BE123C" />
              <Text style={styles.cancelLinkButtonText}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        )}

        {(!isIdle && !isPending) && (
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
              onPress={driverDetails?.phone ? () => Linking.openURL(`tel:${driverDetails.phone}`) : callHotline} 
              activeOpacity={0.9}
            >
              <Ionicons name="call" size={20} color="#FFFFFF" />
              <Text style={styles.callButtonText}>
                {driverDetails?.phone ? `Call Driver (${driverDetails.name})` : 'Call UMC Hotline'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelLinkButton} onPress={handleCancelEmergency} activeOpacity={0.8}>
              <Ionicons name="close-circle-outline" size={18} color="#BE123C" />
              <Text style={styles.cancelLinkButtonText}>Cancel SOS Request</Text>
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
    width: 108,
    height: 108,
    borderRadius: 54,
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
    marginTop: 16,
    marginBottom: 8,
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
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
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
    fontSize: 15,
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
});