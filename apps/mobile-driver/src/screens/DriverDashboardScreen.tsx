import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useState } from 'react';
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
  TextInput,
  View,
} from 'react-native';

import { apiFetch, clearSessionToken } from '../lib/api';
import { ensureNotificationChannelAsync, registerForPushNotificationsAsync } from '../lib/push';

type RequestInfo = {
  id: string;
  status?: string;
  created_at: string;
  requester: {
    name: string;
    phone: string | null;
  };
  patient_location_lat: number;
  patient_location_lng: number;
};

type NotificationItem = {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  action_url: string | null;
  sent_at: string;
};

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
  active_request: RequestInfo | null;
  pending_requests: RequestInfo[];
  pending_count: number;
};

type NotificationsPayload = {
  unread_count: number;
  notifications: NotificationItem[];
};

type ApiResponse<T> = {
  data?: T;
  message?: string;
};

const parseApiResponse = async <T,>(response: Response): Promise<ApiResponse<T> | null> => {
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as ApiResponse<T>;
  } catch {
    return {
      message: rawBody,
    };
  }
};

export default function DriverDashboardScreen() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'overview' | 'requests' | 'notifications' | 'profile'>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payload, setPayload] = useState<HomePayload | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notificationText, setNotificationText] = useState<string | null>(null);
  const seenRequestIds = React.useRef(new Set<string>());

  const loadHome = useCallback(async () => {
    const response = await apiFetch('/api/ambulance/driver/home');
    const body = await parseApiResponse<HomePayload>(response);

    if (!response.ok) {
      throw new Error(body?.message || 'Failed to load home data.');
    }

    if (!body?.data) {
      throw new Error('Failed to load home data.');
    }

    return body.data;
  }, []);

  const loadNotifications = useCallback(async () => {
    const response = await apiFetch('/api/notifications');
    const body = await parseApiResponse<NotificationsPayload>(response);

    if (!response.ok) {
      throw new Error(body?.message || 'Failed to load notifications.');
    }

    return body?.data ?? { unread_count: 0, notifications: [] };
  }, []);

  const syncPushToken = useCallback(async () => {
    try {
      const token = await Promise.race([
        registerForPushNotificationsAsync(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (!token) {
        return;
      }

      await apiFetch('/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({ fcm_token: token }),
      });
    } catch (pushError) {
      console.warn('Failed to sync push token on dashboard:', pushError);
    }
  }, []);

  const refreshHome = useCallback(async () => {
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

  const refreshNotifications = useCallback(async () => {
    const data = await loadNotifications();
    setNotifications(data.notifications);
    setUnreadCount(data.unread_count);
  }, [loadNotifications]);

  const refreshDashboard = useCallback(async () => {
    await refreshHome();

    try {
      await refreshNotifications();
    } catch (error) {
      console.error(error);
    }
  }, [refreshHome, refreshNotifications]);

  useEffect(() => {
    if (!payload) {
      return;
    }

    setProfileName(payload.driver.user.name ?? '');
    setProfilePhone(payload.driver.user.phone ?? '');
  }, [payload]);

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

        await refreshDashboard();

        intervalId = setInterval(() => {
          refreshHome().catch((error) => console.error(error));
          refreshNotifications().catch((error) => console.error(error));
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
  }, [refreshDashboard, refreshHome, refreshNotifications, router, syncPushToken]);

  const handleRequestError = useCallback((error: unknown, fallbackMessage: string) => {
    console.error(error);
    Alert.alert('Action failed', fallbackMessage);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshDashboard();
    } catch (error) {
      handleRequestError(error, 'Could not refresh the driver dashboard.');
    } finally {
      setRefreshing(false);
    }
  }, [handleRequestError, refreshDashboard]);

  const handleToggleAvailability = useCallback(async () => {
    if (!payload) {
      return;
    }

    const nextAvailability = !(payload.availability?.is_available ?? false);
    setBusyAction('availability');

    try {
      const response = await apiFetch('/api/ambulance/driver/status', {
        method: 'PATCH',
        body: JSON.stringify({ is_available: nextAvailability }),
      });
      const body = await parseApiResponse<{ is_available: boolean }>(response);

      if (!response.ok) {
        throw new Error(body?.message || 'Failed to update availability.');
      }

      setPayload((current) =>
        current
          ? {
              ...current,
              availability: {
                is_available: body?.data?.is_available ?? nextAvailability,
              },
            }
          : current
      );
      setNotificationText(body?.message || (nextAvailability ? 'You are now online.' : 'You are now offline.'));
    } catch (error) {
      handleRequestError(error, 'Could not update driver availability.');
    } finally {
      setBusyAction(null);
    }
  }, [handleRequestError, payload]);

  const runRequestAction = useCallback(
    async (requestId: string, action: 'accept' | 'status-arrived' | 'status-completed' | 'cancel') => {
      setBusyAction(`${action}:${requestId}`);

      try {
        const endpoint =
          action === 'accept'
            ? `/api/ambulance/requests/${requestId}/accept`
            : action === 'cancel'
              ? `/api/ambulance/requests/${requestId}/cancel`
              : `/api/ambulance/requests/${requestId}/status`;

        const init: RequestInit =
          action === 'accept'
            ? { method: 'POST' }
            : action === 'cancel'
              ? {
                  method: 'PATCH',
                  body: JSON.stringify({ reason: 'Cancelled from the driver app.' }),
                }
              : {
                  method: 'PATCH',
                  body: JSON.stringify({
                    status: action === 'status-arrived' ? 'ARRIVED' : 'COMPLETED',
                  }),
                };

        const response = await apiFetch(endpoint, init);
        const body = await parseApiResponse<unknown>(response);

        if (!response.ok) {
          throw new Error(body?.message || 'Request update failed.');
        }

        await refreshDashboard();
        setNotificationText(body?.message || 'Request updated successfully.');
      } catch (error) {
        handleRequestError(error, 'Could not complete the request action.');
      } finally {
        setBusyAction(null);
      }
    },
    [handleRequestError, refreshDashboard]
  );

  const handleAcceptRequest = useCallback(
    (requestId: string) => {
      Alert.alert('Accept request?', 'This will assign the ambulance run to you and take the driver offline.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Accept', style: 'default', onPress: () => void runRequestAction(requestId, 'accept') },
      ]);
    },
    [runRequestAction]
  );

  const handleMarkArrived = useCallback(
    (requestId: string) => {
      void runRequestAction(requestId, 'status-arrived');
    },
    [runRequestAction]
  );

  const handleCompleteTrip = useCallback(
    (requestId: string) => {
      Alert.alert('Complete trip?', 'This will close the run and bring the driver back online.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Complete', style: 'default', onPress: () => void runRequestAction(requestId, 'status-completed') },
      ]);
    },
    [runRequestAction]
  );

  const handleCancelTrip = useCallback(
    (requestId: string) => {
      Alert.alert('Cancel trip?', 'The request will be cancelled and the driver will be set back online.', [
        { text: 'Keep running', style: 'cancel' },
        { text: 'Cancel request', style: 'destructive', onPress: () => void runRequestAction(requestId, 'cancel') },
      ]);
    },
    [runRequestAction]
  );

  const handleMarkNotificationRead = useCallback(
    async (notificationId: string) => {
      setBusyAction(`notification:${notificationId}`);

      try {
        const response = await apiFetch(`/api/notifications/${notificationId}/read`, {
          method: 'PATCH',
        });
        const body = await parseApiResponse<{ id: string; is_read: boolean }>(response);

        if (!response.ok) {
          throw new Error(body?.message || 'Could not mark notification as read.');
        }

        setNotifications((current) =>
          current.map((notification) =>
            notification.id === notificationId ? { ...notification, is_read: true } : notification
          )
        );
        setUnreadCount((current) => Math.max(0, current - 1));
      } catch (error) {
        handleRequestError(error, 'Could not update the notification.');
      } finally {
        setBusyAction(null);
      }
    },
    [handleRequestError]
  );

  const handleSaveProfile = useCallback(async () => {
    const trimmedName = profileName.trim();
    const trimmedPhone = profilePhone.trim();

    if (!trimmedName && !trimmedPhone) {
      Alert.alert('Missing details', 'Enter a username or phone number to save your profile.');
      return;
    }

    setBusyAction('profile');

    try {
      const response = await apiFetch('/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          ...(trimmedName ? { username: trimmedName } : {}),
          ...(trimmedPhone ? { phone: trimmedPhone } : {}),
        }),
      });
      const body = await parseApiResponse<unknown>(response);

      if (!response.ok) {
        throw new Error(body?.message || 'Could not save profile details.');
      }

      setPayload((current) =>
        current
          ? {
              ...current,
              driver: {
                ...current.driver,
                user: {
                  ...current.driver.user,
                  name: trimmedName || current.driver.user.name,
                  phone: trimmedPhone || null,
                },
              },
            }
          : current
      );
      setNotificationText(body?.message || 'Profile details saved.');
    } catch (error) {
      handleRequestError(error, 'Could not save driver profile details.');
    } finally {
      setBusyAction(null);
    }
  }, [handleRequestError, profileName, profilePhone]);

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

  const availabilityLabel = payload?.availability?.is_available ? 'Online' : 'Offline';
  const activeRequest = payload?.active_request;
  const activeRequestStatus = activeRequest?.status ?? 'PENDING';
  const isCurrentTripArrived = activeRequestStatus === 'ARRIVED';
  const isTabOverview = activeTab === 'overview';
  const isTabRequests = activeTab === 'requests';
  const isTabNotifications = activeTab === 'notifications';
  const isTabProfile = activeTab === 'profile';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
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

        <View style={styles.tabBar}>
          <Pressable style={[styles.tabButton, isTabOverview && styles.tabButtonActive]} onPress={() => setActiveTab('overview')}>
            <Text style={[styles.tabButtonText, isTabOverview && styles.tabButtonTextActive]}>Overview</Text>
          </Pressable>
          <Pressable style={[styles.tabButton, isTabRequests && styles.tabButtonActive]} onPress={() => setActiveTab('requests')}>
            <Text style={[styles.tabButtonText, isTabRequests && styles.tabButtonTextActive]}>Requests</Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, isTabNotifications && styles.tabButtonActive]}
            onPress={() => setActiveTab('notifications')}>
            <Text style={[styles.tabButtonText, isTabNotifications && styles.tabButtonTextActive]}>Notifications</Text>
          </Pressable>
          <Pressable style={[styles.tabButton, isTabProfile && styles.tabButtonActive]} onPress={() => setActiveTab('profile')}>
            <Text style={[styles.tabButtonText, isTabProfile && styles.tabButtonTextActive]}>Profile</Text>
          </Pressable>
        </View>

        {isTabOverview ? (
          <>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Shift controls</Text>
              <Text style={styles.sectionCopy}>
                Toggle your availability before, during, or after a run. This updates the driver status on the server.
              </Text>
              <Pressable
                style={[styles.primaryButton, busyAction === 'availability' && styles.buttonDisabled]}
                onPress={handleToggleAvailability}
                disabled={busyAction === 'availability'}>
                <Text style={styles.primaryButtonText}>{payload?.availability?.is_available ? 'Not Available' : 'Available'}</Text>
              </Pressable>
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
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{unreadCount}</Text>
                <Text style={styles.metricLabel}>Unread notifications</Text>
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
                  <View style={styles.actionStack}>
                    {!isCurrentTripArrived ? (
                      <Pressable
                        style={[styles.inlineActionButton, busyAction === `status-arrived:${activeRequest.id}` && styles.buttonDisabled]}
                        onPress={() => handleMarkArrived(activeRequest.id)}
                        disabled={busyAction === `status-arrived:${activeRequest.id}` || busyAction === `status-completed:${activeRequest.id}` || busyAction === `cancel:${activeRequest.id}`}>
                        <Text style={styles.inlineActionButtonText}>Mark arrived</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={[styles.inlineActionButton, busyAction === `status-completed:${activeRequest.id}` && styles.buttonDisabled]}
                      onPress={() => handleCompleteTrip(activeRequest.id)}
                      disabled={busyAction === `status-completed:${activeRequest.id}` || busyAction === `status-arrived:${activeRequest.id}` || busyAction === `cancel:${activeRequest.id}`}>
                      <Text style={styles.inlineActionButtonText}>Complete trip</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.dangerButton, busyAction === `cancel:${activeRequest.id}` && styles.buttonDisabled]}
                      onPress={() => handleCancelTrip(activeRequest.id)}
                      disabled={busyAction === `cancel:${activeRequest.id}` || busyAction === `status-arrived:${activeRequest.id}` || busyAction === `status-completed:${activeRequest.id}`}>
                      <Text style={styles.dangerButtonText}>Cancel request</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Text style={styles.emptyText}>No active ambulance run right now.</Text>
              )}
            </View>
          </>
        ) : null}

        {isTabRequests ? (
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
                  <View style={styles.requestActions}>
                    <Pressable
                      style={styles.mapButton}
                      onPress={() => openRequestLocation(request.patient_location_lat, request.patient_location_lng)}>
                      <Text style={styles.mapButtonText}>View on maps</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.inlineActionButton, busyAction === `accept:${request.id}` && styles.buttonDisabled]}
                      onPress={() => handleAcceptRequest(request.id)}
                      disabled={busyAction === `accept:${request.id}` || busyAction?.startsWith('status-') || busyAction?.startsWith('cancel:')}>
                      <Text style={styles.inlineActionButtonText}>Accept</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No pending ambulance requests yet.</Text>
            )}
          </View>
        ) : null}

        {isTabNotifications ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Notifications</Text>
              <Text style={styles.badgeText}>{unreadCount} unread</Text>
            </View>
            {notifications.length ? (
              notifications.map((notification) => (
                <View key={notification.id} style={[styles.notificationCard, notification.is_read && styles.notificationRead]}>
                  <View style={styles.notificationInfo}>
                    <Text style={styles.notificationType}>{notification.type}</Text>
                    <Text style={styles.notificationMessage}>{notification.message}</Text>
                    <Text style={styles.notificationMeta}>
                      {new Date(notification.sent_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <View style={styles.requestActions}>
                    {!notification.is_read ? (
                      <Pressable
                        style={[styles.inlineActionButton, busyAction === `notification:${notification.id}` && styles.buttonDisabled]}
                        onPress={() => void handleMarkNotificationRead(notification.id)}
                        disabled={busyAction === `notification:${notification.id}`}>
                        <Text style={styles.inlineActionButtonText}>Mark read</Text>
                      </Pressable>
                    ) : null}
                    {notification.action_url ? (
                      <Pressable
                        style={styles.mapButton}
                        onPress={async () => {
                          try {
                            await Linking.openURL(notification.action_url ?? '');
                          } catch (error) {
                            handleRequestError(error, 'Could not open the notification link.');
                          }
                        }}>
                        <Text style={styles.mapButtonText}>Open</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No notifications yet.</Text>
            )}
          </View>
        ) : null}

        {isTabProfile ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Driver profile</Text>
            <Text style={styles.sectionCopy}>Update your username and phone number from the app.</Text>
            <Text style={styles.label}>Username</Text>
            <TextInput
              value={profileName}
              onChangeText={setProfileName}
              placeholder="Enter your username"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              style={styles.input}
            />
            <Text style={styles.label}>Phone</Text>
            <TextInput
              value={profilePhone}
              onChangeText={setProfilePhone}
              placeholder="Enter your phone number"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              style={styles.input}
            />
            <Pressable
              style={[styles.primaryButton, busyAction === 'profile' && styles.buttonDisabled]}
              onPress={handleSaveProfile}
              disabled={busyAction === 'profile'}>
              <Text style={styles.primaryButtonText}>Save profile</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          <Pressable style={styles.primaryButton} onPress={() => void handleRefresh()}>
            <Text style={styles.primaryButtonText}>Refresh</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => void handleLogout()}>
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    padding: 6,
    gap: 6,
  },
  tabButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#F8FAFC',
  },
  tabButtonText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '800',
  },
  tabButtonTextActive: {
    color: '#0F172A',
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionCopy: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
  },
  badgeText: {
    color: '#0F766E',
    fontSize: 12,
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
  requestActions: {
    gap: 8,
    alignItems: 'flex-start',
  },
  actionStack: {
    gap: 10,
    marginTop: 8,
  },
  inlineActionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignSelf: 'flex-start',
  },
  inlineActionButtonText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },
  dangerButton: {
    backgroundColor: '#FFF1F2',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#FDA4AF',
    alignSelf: 'flex-start',
  },
  dangerButtonText: {
    color: '#BE123C',
    fontSize: 12,
    fontWeight: '800',
  },
  notificationCard: {
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },
  notificationRead: {
    opacity: 0.7,
  },
  notificationInfo: {
    flex: 1,
  },
  notificationType: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  notificationMessage: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  notificationMeta: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
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
  input: {
    backgroundColor: '#E2E8F0',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: '#0F172A',
    fontSize: 16,
    marginBottom: 12,
  },
  label: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 6,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
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
  buttonDisabled: {
    opacity: 0.55,
  },
});
