import axios from 'axios';
import { getAccessToken, getRefreshToken, setAccessToken, clearSession } from './tokenStorage';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

export const apiClient = axios.create({ baseURL });

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Listeners the AuthContext registers so a forced logout (refresh failed)
// can clear React state too, not just localStorage — the interceptor has no
// direct access to React context.
let onSessionExpired = () => {};
export function registerSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

// Multiple requests can 401 around the same moment (e.g. a page firing
// several fetches on load with a just-expired token) — without this, each
// one would independently race to refresh. Sharing one in-flight promise
// means only the first 401 triggers a real /auth/refresh call; the rest
// wait on it and retry with whatever token it produced.
let refreshPromise = null;

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token available');

  // Deliberately bypasses the apiClient interceptors (a fresh axios call)
  // so this request never recurses into its own 401 handler.
  const response = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
  const { accessToken } = response.data;
  setAccessToken(accessToken);
  return accessToken;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthEndpoint = config?.url?.includes('/auth/login') || config?.url?.includes('/auth/refresh');

    if (response?.status === 401 && !config._retry && !isAuthEndpoint) {
      config._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const accessToken = await refreshPromise;
        config.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(config);
      } catch (refreshError) {
        clearSession();
        onSessionExpired();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export function extractErrorMessage(error) {
  const data = error?.response?.data;
  const fieldErrors = data?.details?.fieldErrors;
  if (fieldErrors && Object.keys(fieldErrors).length) {
    const parts = Object.entries(fieldErrors)
      .filter(([, messages]) => messages?.length)
      .map(([field, messages]) => `${field} — ${messages.join(', ')}`);
    if (parts.length) {
      return `${data.message || 'Validation failed'}: ${parts.join('; ')}`;
    }
  }
  return data?.message || error?.message || 'Something went wrong';
}
