import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RemoteMessage } from '@react-native-firebase/messaging';

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  data?: Record<string, string | object>;
  receivedAt: number;
  read: boolean;
};

const listeners = new Set<() => void>();

const getStorageKey = async () => {
  const userId = (await AsyncStorage.getItem('userId')) || 'anonymous';
  return `notifications:${userId}`;
};

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notifyListeners = () => listeners.forEach((listener) => listener());

export const getNotifications = async (): Promise<AppNotification[]> => {
  const raw = await AsyncStorage.getItem(await getStorageKey());
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AppNotification[]) : [];
  } catch {
    return [];
  }
};

export const addNotification = async (remoteMessage: RemoteMessage) => {
  const existing = await getNotifications();
  const id = `local:${remoteMessage.messageId || Math.random().toString(36).slice(2, 11)}`;
  if (existing.some((notification) => notification.id === id)) return;

  const item: AppNotification = {
    id,
    title: remoteMessage.notification?.title || 'Notification',
    body: remoteMessage.notification?.body || '',
    data: remoteMessage.data,
    receivedAt: Date.now(),
    read: false,
  };

  await AsyncStorage.setItem(
    await getStorageKey(),
    JSON.stringify([item, ...existing].slice(0, 100))
  );
  notifyListeners();
};

export const markRead = async (id: string) => {
  const list = (await getNotifications()).map((notification) =>
    notification.id === id ? { ...notification, read: true } : notification
  );
  await AsyncStorage.setItem(await getStorageKey(), JSON.stringify(list));
  notifyListeners();
};

export const markAllRead = async () => {
  const list = (await getNotifications()).map((notification) => ({ ...notification, read: true }));
  await AsyncStorage.setItem(await getStorageKey(), JSON.stringify(list));
  notifyListeners();
};

export const clearAll = async () => {
  await AsyncStorage.setItem(await getStorageKey(), JSON.stringify([]));
  notifyListeners();
};

export const getUnreadCount = async () =>
  (await getNotifications()).filter((notification) => !notification.read).length;