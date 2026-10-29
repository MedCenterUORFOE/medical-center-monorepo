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
import { getNotifications, markRead, markAllRead, subscribe } from '../notifications/notificationStore';
import { colors } from '../theme/colors';

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
    const unsubscribe = subscribe(loadNotifications);
    return () => unsubscribe();
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

    let serverItems: NotificationItem[] = [];
    let fetchError: Error | null = null;

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

      serverItems = parsedResponse?.data?.notifications || parsedResponse?.notifications || [];
    } catch (error) {
      fetchError = error instanceof Error ? error : new Error('Unable to load notifications.');
    }

    try {
      const localData = await getNotifications();
      const localItems: NotificationItem[] = localData.map(n => ({
        id: `local:${n.id}`,
        type: 'PUSH',
        message: n.body ? `${n.title}\n${n.body}` : n.title,
        is_read: n.read,
        action_url: null,
        sent_at: new Date(n.receivedAt).toISOString()
      }));

      const merged = [...localItems, ...serverItems].sort((a, b) => {
        return new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime();
      });

      setNotifications(merged);

      if (fetchError && localItems.length === 0) {
        setErrorMessage(fetchError.message);
      } else if (fetchError && localItems.length > 0) {
        console.warn('Failed to load server notifications, showing local only.', fetchError.message);
      }
    } catch (e) {
      if (fetchError) {
        setErrorMessage(fetchError.message);
      }
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

    if (notificationId.startsWith('local:')) {
      const realId = notificationId.replace('local:', '');
      await markRead(realId);
      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) =>
          notification.id === notificationId ? { ...notification, is_read: true } : notification
        )
      );
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
      const hasLocalUnread = unreadNotifications.some(n => n.id.startsWith('local:'));
      if (hasLocalUnread) {
        await markAllRead();
      }

      const serverUnread = unreadNotifications.filter(n => !n.id.startsWith('local:'));
      await Promise.all(serverUnread.map((notification) => markNotificationAsRead(notification.id)));
      
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
      <StatusBar barStyle="dark-content" backgroundColor={colors.softSurface} />

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View>
            <Text style={styles.headerEyebrow}>Updates</Text>
            <Text style={styles.headerTitle}>Notifications</Text>
          </View>
          <View style={styles.badgePill}>
            <Ionicons name="notifications-outline" size={16} color={colors.primaryText} />
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
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <>
                <Ionicons name="checkmark-done-outline" size={18} color={colors.textOnPrimary} />
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
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshNotifications} tintColor={colors.primary} colors={[colors.primary]} />}
        >
          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
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
              <Ionicons name="notifications-off-outline" size={28} color={colors.primary} />
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
                        <Ionicons name={isUnread ? 'mail-unread-outline' : 'mail-open-outline'} size={18} color={isUnread ? colors.primary : colors.primaryText} />
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
    backgroundColor: colors.softSurface,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 22,
    backgroundColor: colors.softSurface,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerEyebrow: {
    color: colors.primaryText,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 360,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  badgePillText: {
    color: colors.primaryText,
    fontSize: 12,
    fontWeight: '700',
  },
  markAllButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
  },
  markAllButtonText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  surface: {
    flex: 1,
    backgroundColor: colors.background,
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
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  stateCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 240,
  },
  stateTitle: {
    marginTop: 12,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateBody: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
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
    backgroundColor: colors.softSurface,
    borderColor: colors.primary,
  },
  readCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
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
    backgroundColor: colors.surface,
  },
  readIconBubble: {
    backgroundColor: colors.softSurface,
  },
  cardHeaderText: {
    flex: 1,
    paddingRight: 10,
  },
  notificationType: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  unreadTitle: {
    fontWeight: '800',
  },
  notificationTime: {
    marginTop: 3,
    color: colors.textSecondary,
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
    backgroundColor: colors.primary,
  },
  readDotMuted: {
    backgroundColor: colors.border,
  },
  notificationMessage: {
    marginTop: 10,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 21,
  },
  unreadMessage: {
    fontWeight: '600',
  },
  actionUrlPill: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: colors.softSurface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionUrlText: {
    color: colors.primaryText,
    fontSize: 12,
    fontWeight: '600',
  },
});