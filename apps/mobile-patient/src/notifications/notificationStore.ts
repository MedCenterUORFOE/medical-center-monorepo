import AsyncStorage from '@react-native-async-storage/async-storage';
import { RemoteMessage } from '@react-native-firebase/messaging';

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  data?: Record<string, any>;
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
  return () => {
    listeners.delete(listener);
  };
};

const notifyListeners = () => {
  listeners.forEach((listener) => listener());
};

export const getNotifications = async (): Promise<AppNotification[]> => {
  const key = await getStorageKey();
  const data = await AsyncStorage.getItem(key);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const addNotification = async (remoteMessage: RemoteMessage) => {
  const key = await getStorageKey();
  const notifications = await getNotifications();
  const id = remoteMessage.messageId || Math.random().toString(36).slice(2, 11);
  
  if (notifications.some((n) => n.id === id)) {
    return;
  }
  
  const newNotification: AppNotification = {
    id,
    title: remoteMessage.notification?.title || 'Notification',
    body: remoteMessage.notification?.body || '',
    data: remoteMessage.data,
    receivedAt: Date.now(),
    read: false,
  };
  
  const updated = [newNotification, ...notifications].slice(0, 100);
  await AsyncStorage.setItem(key, JSON.stringify(updated));
  notifyListeners();
};

export const markAllRead = async () => {
  const key = await getStorageKey();
  const notifications = await getNotifications();
  const updated = notifications.map((n) => ({ ...n, read: true }));
  await AsyncStorage.setItem(key, JSON.stringify(updated));
  notifyListeners();
};

export const markRead = async (id: string) => {
  const key = await getStorageKey();
  const notifications = await getNotifications();
  const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
  await AsyncStorage.setItem(key, JSON.stringify(updated));
  notifyListeners();
};

export const clearAll = async () => {
  const key = await getStorageKey();
  await AsyncStorage.setItem(key, JSON.stringify([]));
  notifyListeners();
};

export const getUnreadCount = async (): Promise<number> => {
  const notifications = await getNotifications();
  return notifications.filter((n) => !n.read).length;
};
