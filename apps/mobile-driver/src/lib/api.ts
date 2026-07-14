import * as SecureStore from 'expo-secure-store';
import axios, { AxiosInstance } from 'axios';
import { router } from 'expo-router';

// ---------------------------------------------------------------------------
// Base URL resolution — tries candidates in order, first working one wins.
// Priority: env var → LAN IP → localhost → loopback → Android emulator
// ---------------------------------------------------------------------------
const API_BASE_URL_CANDIDATES = [
  process.env.EXPO_PUBLIC_API_URL,
  'http://10.238.170.242:3000',
  'http://192.168.8.147:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://10.0.2.2:3000',
].filter((c): c is string => Boolean(c?.trim()));

export const API_BASE_URL = API_BASE_URL_CANDIDATES[0] ?? '';
const SESSION_TOKEN_KEY = 'driver_session_token';

// ---------------------------------------------------------------------------
// Secure token storage (uses expo-secure-store on device, AsyncStorage on web)
// ---------------------------------------------------------------------------
export async function setSessionToken(token: string) {
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

export async function getSessionToken() {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function clearSessionToken() {
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Build an Axios instance for a specific base URL
// ---------------------------------------------------------------------------
function buildAxiosInstance(baseURL: string): AxiosInstance {
  const instance = axios.create({
    baseURL,
    timeout: 8000,
    headers: { 'Content-Type': 'application/json' },
  });

  // Inject JWT on every request
  instance.interceptors.request.use(async (config) => {
    const token = await getSessionToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Auto-logout on 401 / 403
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (axios.isAxiosError(error) && error.response) {
        if (error.response.status === 401 || error.response.status === 403) {
          await clearSessionToken();
          router.replace('/login');
        }
      }
      return Promise.reject(error);
    }
  );

  return instance;
}

// ---------------------------------------------------------------------------
// Cached working Axios instance — avoids re-probing on every request
// ---------------------------------------------------------------------------
let _axiosInstance: AxiosInstance | null = null;
let _activeBaseUrl: string | null = null;

async function getWorkingAxiosInstance(): Promise<AxiosInstance> {
  // Use cached instance if base URL is still alive
  if (_axiosInstance && _activeBaseUrl) {
    return _axiosInstance;
  }

  // Probe candidates in order and return the first one that responds
  for (const baseUrl of API_BASE_URL_CANDIDATES) {
    try {
      const probe = buildAxiosInstance(baseUrl);
      await probe.get('/api/health', { timeout: 2000 });
      _axiosInstance = probe;
      _activeBaseUrl = baseUrl;
      console.log(`[api] Connected to ${baseUrl}`);
      return probe;
    } catch {
      // This candidate is unreachable — try the next one
    }
  }

  // All candidates failed — return an instance for the first candidate anyway
  // so the caller receives a proper network error rather than a silent hang.
  const fallback = buildAxiosInstance(API_BASE_URL_CANDIDATES[0] ?? '');
  _axiosInstance = fallback;
  _activeBaseUrl = API_BASE_URL_CANDIDATES[0] ?? null;
  return fallback;
}

// ---------------------------------------------------------------------------
// apiFetch — fetch-compatible wrapper backed by Axios + interceptors
// ---------------------------------------------------------------------------
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const axiosInstance = await getWorkingAxiosInstance();

  const method = (init.method || 'GET').toUpperCase();
  const data = init.body ? JSON.parse(init.body as string) : undefined;
  const extraHeaders = (init.headers || {}) as Record<string, string>;

  const axiosResponse = await axiosInstance.request({
    url: path,
    method,
    data,
    headers: extraHeaders,
    // Do not throw on non-2xx so callers can inspect response.ok
    validateStatus: () => true,
  });

  // Wrap Axios response in a fetch-like Response object
  const dataString =
    typeof axiosResponse.data === 'string'
      ? axiosResponse.data
      : JSON.stringify(axiosResponse.data);

  return {
    ok: axiosResponse.status >= 200 && axiosResponse.status < 300,
    status: axiosResponse.status,
    statusText: axiosResponse.statusText ?? '',
    headers: new Headers(axiosResponse.headers as Record<string, string>),
    text: async () => dataString,
    json: async () => axiosResponse.data,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Allow other modules to reset the cached instance (e.g. after network change)
// ---------------------------------------------------------------------------
export function resetApiConnection() {
  _axiosInstance = null;
  _activeBaseUrl = null;
}