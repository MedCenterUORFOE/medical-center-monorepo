import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type NotificationItem = {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  action_url?: string | null;
  sent_at: string;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const formatDate = (value?: string | null): string => {
  if (!value) return 'Recently';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Recently';

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatTypeLabel = (type?: string | null): string => {
  if (!type) return 'Notification';

  return type
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications]
  );

  useEffect(() => {
    loadNotifications();
  }, []);

  const getHeaders = async () => {
    const token = await AsyncStorage.getItem('userToken');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const loadNotifications = async () => {
    setErrorMessage(null);

    try {
      if (!API_URL) {
        throw new Error('API URL is not configured.');
      }

      const response = await fetch(`${API_URL}/api/notifications`, {
        method: 'GET',
        headers: await getHeaders(),
      });

      const responseText = await response.text();
      let parsedResponse: any = null;

      try {
        parsedResponse = JSON.parse(responseText);
      } catch {
        throw new Error('Server returned an unexpected response.');
      }

      if (!response.ok) {
        throw new Error(parsedResponse?.message || 'Unable to load notifications.');
      }

      const items: NotificationItem[] = parsedResponse?.data?.notifications || parsedResponse?.notifications || [];
      setNotifications(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load notifications.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const refreshNotifications = async () => {
    setIsRefreshing(true);
    await loadNotifications();
  };

  const markNotificationAsRead = async (notificationId: string) => {
    const targetNotification = notifications.find((notification) => notification.id === notificationId);
    if (!targetNotification || targetNotification.is_read) {
      return;
    }

    try {
      if (!API_URL) {
        throw new Error('API URL is not configured.');
      }

      const response = await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: await getHeaders(),
      });

      if (!response.ok) {
        throw new Error('Unable to update notification.');
      }

      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) =>
          notification.id === notificationId ? { ...notification, is_read: true } : notification
        )
      );
    } catch (error) {
      Alert.alert('Update Failed', 'Could not mark the notification as read.');
    }
  };

  const markAllAsRead = async () => {
    const unreadNotifications = notifications.filter((notification) => !notification.is_read);

    if (unreadNotifications.length === 0) {
      return;
    }

    setIsBulkUpdating(true);
    try {
      await Promise.all(unreadNotifications.map((notification) => markNotificationAsRead(notification.id)));
      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) => ({
          ...notification,
          is_read: true,
        }))
      );
    } finally {
      setIsBulkUpdating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#154C5B" />

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View>
            <Text style={styles.headerEyebrow}>Updates</Text>
            <Text style={styles.headerTitle}>Notifications</Text>
          </View>
          <View style={styles.badgePill}>
            <Ionicons name="notifications-outline" size={16} color="#154C5B" />
            <Text style={styles.badgePillText}>{unreadCount} unread</Text>
          </View>
        </View>

        <Text style={styles.headerSubtitle}>
          Stay on top of appointment changes, medical updates, and system alerts.
        </Text>

        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={markAllAsRead}
            disabled={isBulkUpdating}
            activeOpacity={0.85}
          >
            {isBulkUpdating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-done-outline" size={18} color="#FFFFFF" />
                <Text style={styles.markAllButtonText}>Mark all as read</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.surface}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshNotifications} tintColor="#154C5B" colors={['#154C5B']} />}
        >
          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#0F766E" />
              <Text style={styles.loadingText}>Loading notifications...</Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.stateCard}>
              <Ionicons name="alert-circle-outline" size={28} color="#DC2626" />
              <Text style={styles.stateTitle}>Unable to load notifications</Text>
              <Text style={styles.stateBody}>{errorMessage}</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={loadNotifications}>
                <Text style={styles.primaryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.stateCard}>
              <Ionicons name="notifications-off-outline" size={28} color="#0F766E" />
              <Text style={styles.stateTitle}>No notifications yet</Text>
              <Text style={styles.stateBody}>
                You’ll see appointment updates, reminders, and medical alerts here.
              </Text>
            </View>
          ) : (
            <View style={styles.listStack}>
              {notifications.map((notification) => {
                const isUnread = !notification.is_read;

                return (
                  <TouchableOpacity
                    key={notification.id}
                    style={[styles.notificationCard, isUnread ? styles.unreadCard : styles.readCard]}
                    activeOpacity={0.88}
                    onPress={() => markNotificationAsRead(notification.id)}
                  >
                    <View style={styles.cardHeaderRow}>
                      <View style={[styles.iconBubble, isUnread ? styles.unreadIconBubble : styles.readIconBubble]}>
                        <Ionicons name={isUnread ? 'mail-unread-outline' : 'mail-open-outline'} size={18} color={isUnread ? '#1D4ED8' : '#155E75'} />
                      </View>

                      <View style={styles.cardHeaderText}>
                        <Text style={[styles.notificationType, isUnread && styles.unreadTitle]}>
                          {formatTypeLabel(notification.type)}
                        </Text>
                        <Text style={styles.notificationTime}>{formatDate(notification.sent_at)}</Text>
                      </View>

                      <View style={[styles.readDot, isUnread ? styles.unreadDot : styles.readDotMuted]} />
                    </View>

                    <Text style={[styles.notificationMessage, isUnread && styles.unreadMessage]}>
                      {notification.message}
                    </Text>

                    {notification.action_url ? (
                      <View style={styles.actionUrlPill}>
                        <Text style={styles.actionUrlText} numberOfLines={1}>
                          {notification.action_url}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={{ height: 28 }} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#154C5B',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 22,
    backgroundColor: '#154C5B',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 360,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D8F3F0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  badgePillText: {
    color: '#154C5B',
    fontSize: 12,
    fontWeight: '700',
  },
  markAllButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F766E',
    borderRadius: 14,
    paddingVertical: 12,
  },
  markAllButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  surface: {
    flex: 1,
    backgroundColor: '#EEF7F6',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -8,
    paddingTop: 16,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  loadingWrap: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#0F3D47',
    fontSize: 15,
    fontWeight: '600',
  },
  stateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8EAE7',
    minHeight: 240,
  },
  stateTitle: {
    marginTop: 12,
    color: '#0F3D47',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateBody: {
    marginTop: 8,
    color: '#4B6470',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: '#0F766E',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  listStack: {
    gap: 12,
  },
  notificationCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
  },
  unreadCard: {
    backgroundColor: '#EAF3FF',
    borderColor: '#C7DBFF',
  },
  readCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D6EAE6',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  unreadIconBubble: {
    backgroundColor: '#D8EAFE',
  },
  readIconBubble: {
    backgroundColor: '#E8F6F4',
  },
  cardHeaderText: {
    flex: 1,
    paddingRight: 10,
  },
  notificationType: {
    color: '#0F3D47',
    fontSize: 15,
    fontWeight: '700',
  },
  unreadTitle: {
    fontWeight: '800',
  },
  notificationTime: {
    marginTop: 3,
    color: '#5D7280',
    fontSize: 12,
    fontWeight: '500',
  },
  readDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  unreadDot: {
    backgroundColor: '#1D4ED8',
  },
  readDotMuted: {
    backgroundColor: '#B8C9D4',
  },
  notificationMessage: {
    marginTop: 10,
    color: '#23424B',
    fontSize: 14,
    lineHeight: 21,
  },
  unreadMessage: {
    fontWeight: '600',
  },
  actionUrlPill: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#F0FAF8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionUrlText: {
    color: '#136F63',
    fontSize: 12,
    fontWeight: '600',
  },
});