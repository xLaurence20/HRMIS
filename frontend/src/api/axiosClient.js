import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,   // sends the HttpOnly refresh cookie
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

/* ------------------------------------------------------------------ *
 *  In-memory access token (never localStorage — XSS-safe)
 * ------------------------------------------------------------------ */
let accessToken = null;
export const setAccessToken = (token) => { accessToken = token; };
export const getAccessToken = () => accessToken;

/* ------------------------------------------------------------------ *
 *  Unauthorized callback — AuthContext registers a handler so the
 *  whole app can be logged out when a refresh ultimately fails.
 * ------------------------------------------------------------------ */
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

/* ------------------------------------------------------------------ *
 *  Request interceptor: attach the Bearer token
 * ------------------------------------------------------------------ */
api.interceptors.request.use((config) => {
  if (accessToken && !config.skipAuth) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/* ------------------------------------------------------------------ *
 *  Response interceptor: single-flight silent refresh on 401
 * ------------------------------------------------------------------ */
let refreshPromise = null;

function runRefresh() {
  if (!refreshPromise) {
    refreshPromise = api
  .post('/auth/refresh', {}, { skipAuth: true })
      .then((res) => {
        const payload = res.data?.data ?? {};
        setAccessToken(payload.accessToken ?? null);
        return payload;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;
    const isAuthEndpoint =
      typeof config?.url === 'string' && config.url.includes('/auth/');

    // Do not attempt a refresh for login/refresh failures or non-401s.
    if (
      !response ||
      response.status !== 401 ||
      config?._retry ||
      config?.skipAuth ||
      isAuthEndpoint
    ) {
      return Promise.reject(error);
    }

    config._retry = true;

    try {
      await runRefresh();
      return api(config);
    } catch (refreshError) {
      setAccessToken(null);
      onUnauthorized();
      return Promise.reject(refreshError);
    }
  }
);

/* ------------------------------------------------------------------ *
 *  Normalise API errors into a predictable shape for the UI.
 * ------------------------------------------------------------------ */
export function extractApiError(error) {
  if (error?.response?.data?.error) {
    const { code, message, details } = error.response.data.error;
    return { code, message, details, status: error.response.status };
  }
  if (error?.code === 'ECONNABORTED') {
    return { code: 'TIMEOUT', message: 'The server took too long to respond.' };
  }
  if (!error?.response) {
    return { code: 'NETWORK_ERROR', message: 'Cannot reach the server. Check your connection.' };
  }
  return { code: 'UNKNOWN', message: 'An unexpected error occurred.' };
}