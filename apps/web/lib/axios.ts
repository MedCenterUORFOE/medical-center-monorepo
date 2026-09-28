import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach token from localStorage if available
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('session_token');
      if (token) {
        config.headers = {
          ...(config.headers || {}),
          Authorization: `Bearer ${token}`
        } as any;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle session expiration or unauthorized access
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status } = error.response;
      if (status === 401) {
        const url: string = error.config?.url ?? '';
        const isAuthCall = url.includes('auth/');
        if (!isAuthCall && typeof window !== 'undefined' && window.location.pathname !== '/login') {
          // Clear credentials
          localStorage.removeItem('session_token');
          // Redirect to login page
          window.location.href = `/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
