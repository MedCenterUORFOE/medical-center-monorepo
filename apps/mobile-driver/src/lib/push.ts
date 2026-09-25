import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const tokenResult = await Notifications.getDevicePushTokenAsync();

    return tokenResult.data;
  } catch (error) {
    console.warn('Failed to get device push token:', error);
    return null;
  }
}

export async function ensureNotificationChannelAsync() {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0F766E',
    });
  } catch (error) {
    console.warn('Failed to set notification channel:', error);
  }
}