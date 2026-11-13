import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Default URLs for mobile:
// Android Emulator uses 10.0.2.2 to access host machine localhost
// iOS Simulator uses localhost
// Physical device uses LAN IP e.g. 192.168.1.5
const DEFAULT_URL = Platform.select({
  android: 'http://10.0.2.2:5000',
  ios: 'http://localhost:5000',
  default: 'http://localhost:5000',
});

let currentBaseUrl = DEFAULT_URL;
let inMemoryToken = null;

// Storage Keys
const TOKEN_KEY = 'rljit_mobile_jwt';
const BASE_URL_KEY = 'rljit_mobile_base_url';

export const getBaseUrl = () => currentBaseUrl;

export const setBaseUrl = async (url) => {
  if (!url) return;
  currentBaseUrl = url.trim();
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
      if (saved) currentBaseUrl = saved;
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
  timeout: 15000,
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

