import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { apiFetch, clearSessionToken, setSessionToken } from '../lib/api';
import { ensureNotificationChannelAsync, registerForPushNotificationsAsync } from '../lib/push';

type HomePayload = {
  driver: {
    driver_id: string;
    vehicle_registration: string;
    user: {
      name: string;
      email: string;
      phone: string | null;
    };
  };
  availability: {
    is_available: boolean;
  } | null;
  active_request: {
    id: string;
    status: string;
    created_at: string;
    requester: {
      name: string;
      phone: string | null;
    };
    patient_location_lat: number;
    patient_location_lng: number;
  } | null;
  pending_requests: Array<{
    id: string;
    created_at: string;
    requester: {
      name: string;
      phone: string | null;
    };
    patient_location_lat: number;
    patient_location_lng: number;
  }>;
  pending_count: number;
};

type HomeResponse = {
  data?: HomePayload;
  message?: string;
};

export default function HomeScreen() {
  const router = useRouter();
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payload, setPayload] = useState<HomePayload | null>(null);
  const [notificationText, setNotificationText] = useState<string | null>(null);
  const seenRequestIds = useRef(new Set<string>());
  const isDemoMode = demo === '1';

  const loadDemoHome = useCallback(async () => {
    return {
      driver: {
        driver_id: '12345',
        vehicle_registration: 'TEST-12345',
        user: {
          name: 'Test Driver',
          email: '12345@test.local',
          phone: null,
        },
      },
      availability: {
        is_available: true,
      },
      active_request: {
        id: 'demo-request-1',
        status: 'PENDING',
        created_at: new Date().toISOString(),
        requester: {
          name: 'Demo Patient',
          phone: '0712345678',
        },
        patient_location_lat: 6.9271,
        patient_location_lng: 79.8612,
      },
      pending_requests: [
        {
          id: 'demo-request-1',
          created_at: new Date().toISOString(),
          requester: {
            name: 'Demo Patient',
            phone: '0712345678',
          },
          patient_location_lat: 6.9271,
          patient_location_lng: 79.8612,
        },
      ],
      pending_count: 1,
    } satisfies HomePayload;
  }, []);

  const loadHome = useCallback(async () => {
    if (isDemoMode) {
      return loadDemoHome();
    }

    const response = await apiFetch('/api/ambulance/driver/home');
    const body = (await response.json()) as HomeResponse;

    if (!response.ok) {
      throw new Error(body.message || 'Failed to load home data.');
    }

    if (!body.data) {
      throw new Error('Failed to load home data.');
    }

    return body.data;
  }, [isDemoMode, loadDemoHome]);

  const syncPushToken = useCallback(async () => {
    if (isDemoMode) {
      return;
    }

    const token = await registerForPushNotificationsAsync();

    if (!token) {
      return;
    }

    await apiFetch('/api/users/settings', {
      method: 'PATCH',
      body: JSON.stringify({ fcm_token: token }),
    });
  }, [isDemoMode]);

  const refresh = useCallback(async () => {
    const data = await loadHome();
    setPayload(data);

    if (data.pending_requests.length > 0) {
      const newest = data.pending_requests[0];
      if (!seenRequestIds.current.has(newest.id)) {
        seenRequestIds.current.add(newest.id);
        setNotificationText(`New ambulance request from ${newest.requester.name}`);

        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'New ambulance request',
            body: `Pickup request from ${newest.requester.name}`,
          },
          trigger: null,
        });
      }

      data.pending_requests.forEach((request) => seenRequestIds.current.add(request.id));
    }
  }, [loadHome]);

  useEffect(() => {
    let mounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        await ensureNotificationChannelAsync();
        await syncPushToken();
        if (!mounted) {
          return;
        }

        await refresh();
        intervalId = setInterval(() => {
          refresh().catch((error) => console.error(error));
        }, 15000);
      } catch (error) {
        console.error(error);
        Alert.alert('Unable to load home screen', 'Please sign in again.');
        await clearSessionToken();
        router.replace('/login');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [refresh, router, syncPushToken]);

  const availabilityLabel = useMemo(() => {
    if (!payload?.availability) return 'Offline';
    return payload.availability.is_available ? 'Online' : 'Offline';
  }, [payload]);

  const activeRequest = payload?.active_request;

  const openRequestLocation = useCallback(async (lat: number, lng: number) => {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

    try {
      const canOpen = await Linking.canOpenURL(mapsUrl);
      if (!canOpen) {
        Alert.alert('Maps unavailable', 'Could not open the location on maps.');
        return;
      }

      await Linking.openURL(mapsUrl);
    } catch (error) {
      console.error(error);
      Alert.alert('Maps unavailable', 'Could not open the location on maps.');
    }
  }, []);

  const handleLogout = async () => {
    await clearSessionToken();
    router.replace('/');
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#99F6E4" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
          setRefreshing(true);
          try {
            await refresh();
          } finally {
            setRefreshing(false);
          }
        }} />}
      >
        <View style={styles.headerCard}>
          <View>
            <Text style={styles.kicker}>Driver dashboard</Text>
            <Text style={styles.title}>Ready for ambulance dispatch</Text>
            <Text style={styles.subtitle}>
              {payload?.driver.user.name} · {payload?.driver.vehicle_registration}
            </Text>
          </View>

          <View style={styles.statusPill}>
            <View style={[styles.statusDot, payload?.availability?.is_available ? styles.statusOnline : styles.statusOffline]} />
            <Text style={styles.statusText}>{availabilityLabel}</Text>
          </View>
        </View>

        {notificationText ? (
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>New alert</Text>
            <Text style={styles.alertText}>{notificationText}</Text>
          </View>
        ) : null}

        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{payload?.pending_count ?? 0}</Text>
            <Text style={styles.metricLabel}>Pending requests</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{payload?.active_request ? '1' : '0'}</Text>
            <Text style={styles.metricLabel}>Active runs</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Current trip</Text>
          {activeRequest ? (
            <View style={styles.tripCard}>
              <Text style={styles.tripName}>{activeRequest.requester.name}</Text>
              <Text style={styles.tripMeta}>Status: {activeRequest.status}</Text>
              <Text style={styles.tripMeta}>
                Lat {activeRequest.patient_location_lat.toFixed(5)}, Lng {activeRequest.patient_location_lng.toFixed(5)}
              </Text>
              <Pressable
                style={styles.mapButton}
                onPress={() => openRequestLocation(activeRequest.patient_location_lat, activeRequest.patient_location_lng)}>
                <Text style={styles.mapButtonText}>View on maps</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.emptyText}>No active ambulance run right now.</Text>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Latest requests</Text>
          {payload?.pending_requests.length ? (
            payload.pending_requests.map((request) => (
              <View key={request.id} style={styles.requestCard}>
                <View style={styles.requestInfo}>
                  <Text style={styles.requestTitle}>{request.requester.name}</Text>
                  <Text style={styles.requestMeta}>
                    {new Date(request.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={styles.requestMeta}>
                    Lat {request.patient_location_lat.toFixed(5)}, Lng {request.patient_location_lng.toFixed(5)}
                  </Text>
                </View>
                <Pressable
                  style={styles.mapButton}
                  onPress={() => openRequestLocation(request.patient_location_lat, request.patient_location_lng)}>
                  <Text style={styles.mapButtonText}>View on maps</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No pending ambulance requests yet.</Text>
          )}
        </View>

        <View style={styles.actionsRow}>
          <Pressable style={styles.primaryButton} onPress={() => refresh().catch((error) => console.error(error))}>
            <Text style={styles.primaryButtonText}>Refresh</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={handleLogout}>
            <Text style={styles.secondaryButtonText}>Logout</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#071821',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#071821',
  },
  headerCard: {
    backgroundColor: '#0F172A',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  kicker: {
    color: '#99F6E4',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '800',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
  },
  subtitle: {
    color: 'rgba(226,232,240,0.75)',
    marginTop: 8,
    fontSize: 14,
  },
  statusPill: {
    marginTop: 16,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusOnline: {
    backgroundColor: '#34D399',
  },
  statusOffline: {
    backgroundColor: '#FB7185',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  alertCard: {
    backgroundColor: '#053B3A',
    borderRadius: 22,
    padding: 16,
  },
  alertTitle: {
    color: '#99F6E4',
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  alertText: {
    color: '#FFFFFF',
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 22,
    padding: 16,
  },
  metricValue: {
    color: '#0F172A',
    fontSize: 26,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#475569',
    marginTop: 4,
    fontSize: 13,
  },
  sectionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 28,
    padding: 18,
    gap: 12,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  tripCard: {
    backgroundColor: '#E2E8F0',
    borderRadius: 20,
    padding: 16,
    gap: 6,
  },
  tripName: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  tripMeta: {
    color: '#475569',
    fontSize: 13,
  },
  requestCard: {
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
  },
  requestInfo: {
    flex: 1,
  },
  requestTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  requestMeta: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 3,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
  },
  mapButton: {
    backgroundColor: '#0F766E',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  mapButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  primaryButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
});