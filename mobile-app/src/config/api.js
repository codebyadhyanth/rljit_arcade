import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform, NativeModules } from 'react-native';

// Helper to strip trailing slashes so route concatenation never produces double slashes
const sanitizeUrl = (url) => (url ? url.trim().replace(/\/+$/, '') : '');

// Multi-Layer Base URL Resolution
export const getDynamicBaseUrl = () => {
  // Priority 1: Environment variable configured in mobile-app/.env
  if (process.env.EXPO_PUBLIC_API_URL) {
    return sanitizeUrl(process.env.EXPO_PUBLIC_API_URL);
  }

  // Priority 2: Extract host PC LAN IP from running Metro bundler scriptURL
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (scriptURL) {
    const match = scriptURL.match(/^https?:\/\/([^:/]+)/);
    if (match && match[1] && match[1] !== 'localhost' && match[1] !== '127.0.0.1') {
      return `http://${match[1]}:5000`;
    }
  }

  // Priority 3: Fall back to explicit Wi-Fi LAN IP (192.168.31.244)
  const defaultFallback = Platform.select({
    android: 'http://192.168.31.244:5000',
    ios: 'http://localhost:5000',
    default: 'http://192.168.31.244:5000',
  });

  return sanitizeUrl(defaultFallback);
};

const REQUEST_TIMEOUT =
  Number(process.env.EXPO_PUBLIC_REQUEST_TIMEOUT) || 15000;

const DEFAULT_URL = getDynamicBaseUrl();

let currentBaseUrl = DEFAULT_URL;
let inMemoryToken = null;

// Storage Keys
const TOKEN_KEY = 'rljit_mobile_jwt';
const BASE_URL_KEY = 'rljit_mobile_base_url';

export const getBaseUrl = () => currentBaseUrl;

export const setBaseUrl = async (url) => {
  if (!url) return;
  currentBaseUrl = sanitizeUrl(url);
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(BASE_URL_KEY, currentBaseUrl);
    }
  } catch (err) {
    // Non-fatal fallback
  }
};

export const initBaseUrl = async () => {
  try {
    if (Platform.OS !== 'web') {
      const saved = await SecureStore.getItemAsync(BASE_URL_KEY);
      if (saved) {
        currentBaseUrl = sanitizeUrl(saved);
      } else {
        currentBaseUrl = getDynamicBaseUrl();
      }
    }
  } catch (err) {
    // Keep default
  }
  return currentBaseUrl;
};

export const getToken = async () => {
  if (inMemoryToken) return inMemoryToken;
  try {
    if (Platform.OS !== 'web') {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      inMemoryToken = token;
      return token;
    }
  } catch {
    return inMemoryToken;
  }
  return inMemoryToken;
};

export const setToken = async (token) => {
  inMemoryToken = token;
  try {
    if (Platform.OS !== 'web') {
      if (token) {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
    }
  } catch {
    // Fallback
  }
};

export const removeToken = async () => {
  inMemoryToken = null;
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch {
    // Fallback
  }
};

// Create Axios Instance
const api = axios.create({
  baseURL: currentBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: REQUEST_TIMEOUT,
});

api.interceptors.request.use(
  async (config) => {
    config.baseURL = currentBaseUrl;
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Diagnostic Network Error: attach clear actionable advice when backend is unreachable
    if (!error.response) {
      const target = api.defaults.baseURL || currentBaseUrl;
      const diagMsg = `Network Error: Cannot reach backend at ${target}. Ensure PC and phone are on the same Wi-Fi and Windows Firewall port 5000 is open.`;
      error.userMessage = diagMsg;
      error.message = diagMsg;
    }

    if (error.response?.status === 401) {
      const isLogin = error.config?.url?.includes('/auth/login');
      if (!isLogin) {
        await removeToken();
      }
    }
    return Promise.reject(error);
  }
);

export default api;
