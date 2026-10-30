import { getMessaging, getToken, requestPermission, onMessage, onNotificationOpenedApp, getInitialNotification, onTokenRefresh, AuthorizationStatus } from '@react-native-firebase/messaging';
import type { RemoteMessage } from '@react-native-firebase/messaging';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addNotification } from './notificationStore';
import { PermissionsAndroid, Platform } from 'react-native';

const messaging = getMessaging();

export const registerDeviceToken = async () => {
  try {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        return;
      }
    }

    // requestPermission is deprecated in favor of expo-notifications or react-native-permissions, but kept functional
    const authStatus = await requestPermission(messaging);
    const enabled =
      authStatus === AuthorizationStatus.AUTHORIZED ||
      authStatus === AuthorizationStatus.PROVISIONAL;

    if (!enabled) return;

    const fcmToken = await getToken(messaging);
    console.log('FCM_TOKEN_DEBUG', fcmToken); // REMOVE BEFORE RELEASE
    const userToken = await SecureStore.getItemAsync('userToken');

    if (userToken && fcmToken) {
      const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
      await fetch(`${API_URL}/api/users/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ fcm_token: fcmToken })
      });
    }
  } catch (error) {
    // errors silently caught
  }
};

export const startTokenRefreshListener = () => {
  return onTokenRefresh(messaging, () => {
    registerDeviceToken();
  });
};

const updateLocalCertificateStatus = async (requestId: string, status: string) => {
  try {
    const userId = (await AsyncStorage.getItem('userId')) || (await SecureStore.getItemAsync('userId'));
    if (!userId || !requestId) return;
    const storageKey = `patient_certificate_requests_${userId}`;
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return;
    const requests = JSON.parse(raw);
    const updated = requests.map((r: any) => {
      if (r.requestId === requestId || r.id === requestId) {
        return {
          ...r,
          status,
          updatedAt: new Date().toISOString(),
        };
      }
      return r;
    });
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to update local certificate status:', err);
  }
};

export const routeFromNotification = (data: any, router: any) => {
  const type = data?.type;
  if (['NEW_EMERGENCY', 'EMERGENCY_UPDATE', 'EMERGENCY_CANCELLED'].includes(type)) {
    router.push('/emergency');
  } else if (type === 'CERTIFICATE_UPDATE') {
    const requestId = data?.request_id || '';
    const status = data?.status;
    if (requestId && status) {
      void updateLocalCertificateStatus(requestId, status);
    }
    const targetUrl = requestId
      ? `/academic-submission?tab=certificates&requestId=${requestId}`
      : '/academic-submission?tab=certificates';
    router.push(targetUrl as any);
  } else {
    router.push('/notifications');
  }
};

export const setupNotificationHandlers = (router: any) => {
  const unsubscribeOnMessage = onMessage(messaging, async (remoteMessage: RemoteMessage) => {
    await addNotification(remoteMessage);
  });

  const unsubscribeOnNotificationOpenedApp = onNotificationOpenedApp(messaging, async (remoteMessage: RemoteMessage) => {
    await addNotification(remoteMessage);
    routeFromNotification(remoteMessage.data, router);
  });

  getInitialNotification(messaging).then(async remoteMessage => {
    if (remoteMessage) {
      await addNotification(remoteMessage);
      routeFromNotification(remoteMessage.data, router);
    }
  });

  return () => {
    unsubscribeOnMessage();
    unsubscribeOnNotificationOpenedApp();
  };
};
