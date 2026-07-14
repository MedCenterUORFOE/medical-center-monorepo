import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const SESSION_TOKEN_KEY = 'driver_session_token';

export async function setSessionToken(token: string) {
  await AsyncStorage.setItem(SESSION_TOKEN_KEY, token);
}

export async function getSessionToken() {
  return AsyncStorage.getItem(SESSION_TOKEN_KEY);
}

export async function clearSessionToken() {
  await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await getSessionToken();

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}