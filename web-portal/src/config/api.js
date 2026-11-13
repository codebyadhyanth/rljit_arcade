import axios from 'axios';

// Sanitize URL helper to guarantee no trailing slashes
const sanitizeUrl = (url) => (url ? url.trim().replace(/\/+$/, '') : '');

// Default backend API URL for Web Portal configured via Vite environment
const DEFAULT_BASE_URL = sanitizeUrl(
  import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    'http://localhost:5000'
);

// Configurable request timeout
const REQUEST_TIMEOUT =
  Number(import.meta.env.VITE_REQUEST_TIMEOUT) || 15000;

// Allow overriding via environment variable or localStorage
export const getBaseUrl = () => {
  const local = localStorage.getItem('rljit_api_base_url');
  if (local) return sanitizeUrl(local);
  return DEFAULT_BASE_URL;
};

export const setBaseUrl = (newUrl) => {
  if (newUrl) {
    localStorage.setItem('rljit_api_base_url', sanitizeUrl(newUrl));
  } else {
    localStorage.removeItem('rljit_api_base_url');
  }
};

export const BASE_URL = getBaseUrl();

// Axios client with authorization interceptors
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: REQUEST_TIMEOUT,
});

api.interceptors.request.use(
  (config) => {
    // Dynamically update baseURL if changed in runtime
    config.baseURL = getBaseUrl();

    const token = localStorage.getItem('rljit_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Session revoked or token expired
      const isLoginRequest = error.config?.url?.includes('/auth/login');
      if (!isLoginRequest) {
        localStorage.removeItem('rljit_token');
        localStorage.removeItem('rljit_user');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login?revoked=true';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
