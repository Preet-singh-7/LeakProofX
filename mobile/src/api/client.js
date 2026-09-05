import axios from 'axios';
import { getAccessToken, getRefreshToken, setAccessToken, clearSession } from '../storage/tokenStorage';

const baseURL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

export const apiClient = axios.create({ baseURL, timeout: 15000 });

apiClient.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Same shared-in-flight-refresh pattern as the web dashboard's api/client.js
// — see that file's comments for why. SecureStore reads/writes are async
// (unlike web's synchronous localStorage), which is the only structural
// difference from the web client.
let onSessionExpired = () => {};
export function registerSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

let refreshPromise = null;

async function refreshAccessToken() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token available');

  const response = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
  const { accessToken } = response.data;
  await setAccessToken(accessToken);
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
        await clearSession();
        onSessionExpired();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export function extractErrorMessage(error) {
  if (error?.message === 'Network Error' || error?.code === 'ECONNABORTED') {
    return 'No connection to the server.';
  }
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
