import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiFetch } from '../lib/api';
import { routeFromNotification } from '../notifications/pushNotifications';
import {
  AppNotification,
  clearAll,
  getNotifications,
  markAllRead,
  markRead,
  subscribe,
} from '../notifications/notificationStore';

type ServerNotification = {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  sent_at: string;
};

const relativeTime = (timestamp: number) => {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} day ago`;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const localItems = await getNotifications();
    let merged = localItems;

    try {
      const response = await apiFetch('/api/notifications');
      const body = (await response.json()) as { data?: { notifications?: ServerNotification[] } };
      if (response.ok) {
        const serverItems: AppNotification[] = (body.data?.notifications ?? []).map((item) => ({
          id: `server:${item.id}`,
          title: item.type,
          body: item.message,
          receivedAt: new Date(item.sent_at).getTime(),
          read: item.is_read,
          data: { type: item.type, serverId: item.id },
        }));
        const localIds = new Set(localItems.map((item) => item.id));
        merged = [...localItems, ...serverItems.filter((item) => !localIds.has(item.id))];
      }
    } catch {
      // The local inbox remains available when the server is unreachable.
    }

    setItems(merged.sort((a, b) => b.receivedAt - a.receivedAt));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      return subscribe(() => void load());
    }, [load])
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleClear = () => {
    Alert.alert('Clear notifications?', 'This removes the local notification inbox from this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: () => void clearAll().then(load) },
    ]);
  };

  const openItem = async (item: AppNotification) => {
    if (!item.id.startsWith('server:')) await markRead(item.id);
    routeFromNotification(item.data, router);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => void markAllRead().then(load)} hitSlop={10}>
            <Ionicons name="checkmark-done-outline" size={22} color="#2F8F72" />
          </Pressable>
          <Pressable onPress={handleClear} hitSlop={10}>
            <Ionicons name="trash-outline" size={22} color="#FDA4AF" />
          </Pressable>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {items.length ? items.map((item) => (
          <Pressable key={item.id} onPress={() => void openItem(item)} style={[styles.item, !item.read && styles.unreadItem]}>
            <View style={styles.itemTop}>
              <Text style={[styles.itemTitle, !item.read && styles.unreadTitle]}>{item.title}</Text>
              {!item.read ? <View style={styles.dot} /> : null}
            </View>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.time}>{relativeTime(item.receivedAt)}</Text>
          </Pressable>
        )) : <Text style={styles.empty}>No notifications yet</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F2FAF6' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 18 },
  title: { flex: 1, color: '#111827', fontSize: 24, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 18 },
  content: { padding: 20, gap: 12 },
  item: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, gap: 8 },
  unreadItem: { borderLeftWidth: 3, borderLeftColor: '#2F8F72' },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { flex: 1, color: '#527067', fontSize: 16 },
  unreadTitle: { color: '#111827', fontWeight: '800' },
  body: { color: '#527067', fontSize: 14, lineHeight: 20 },
  time: { color: '#78958B', fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2F8F72' },
  empty: { color: '#527067', textAlign: 'center', marginTop: 80, fontSize: 16 },
});