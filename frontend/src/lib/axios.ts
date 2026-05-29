import axios from 'axios';

const getBaseUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;

  if (envUrl) {
    return envUrl;
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // In development, always point to the backend on the same host
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5000';
    }
    // LAN access (e.g., 192.168.x.x from a phone) — backend is on same host
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
      return `http://${host}:5000`;
    }
  }
  // Server-side rendering fallback or default empty string
  return '';
};

export const api = axios.create({
  baseURL: getBaseUrl(),
});

// Inject token on every request
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If backend returns 401, clear stale token and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      // Token is expired or role changed — force re-login
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
