import {
  createContext, useContext, useState, useEffect,
  useCallback, useMemo,
} from 'react';
import {
  api, setAccessToken, setUnauthorizedHandler, extractApiError,
} from '../api/axiosClient';

/**
 * Module-scope promise for the *initial* session bootstrap.
 *
 * Why module scope and not useRef / useState:
 * React 18 StrictMode mounts -> unmounts -> remounts every effect in dev.
 * A useRef guard combined with a `cancelled` cleanup flag causes the
 * first run's response to be silently discarded while blocking the
 * second run from ever firing a new request. Caching the in-flight
 * promise here guarantees exactly ONE /auth/refresh request per page
 * load, and both StrictMode effect runs subscribe to the same result.
 *
 * The cache is reset on logout so a subsequent reload starts fresh.
 */
let bootstrapRefreshPromise = null;

const AuthContext = createContext(null);

/**
 * status:
 *   'loading'       -> bootstrap in flight; render a splash
 *   'authenticated' -> session valid
 *   'anonymous'     -> no session
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [permissions, setPermissions] = useState([]);

  /* -------------------------------------------------------------- *
   *  Session writers
   * -------------------------------------------------------------- */
  const applySession = useCallback((payload) => {
    setAccessToken(payload?.accessToken ?? null);
    setUser(payload?.user ?? null);
    if (payload?.permissions) setPermissions(payload.permissions);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setProfile(null);
    setRole(null);
    setPermissions([]);
    setStatus('anonymous');
  }, []);

  /* -------------------------------------------------------------- *
   *  Register the global "session died" handler once
   * -------------------------------------------------------------- */
  useEffect(() => {
    setUnauthorizedHandler(() => clearSession());
  }, [clearSession]);

  /* -------------------------------------------------------------- *
   *  Bootstrap: ONE refresh request per page load.
   *
   *  - Module-level promise dedupes StrictMode's double-invoke.
   *  - Each mount subscribes to the same promise; only the "live"
   *    mount (cancelled === false) applies the result.
   *  - Hard timeout ensures we never sit on the spinner forever.
   * -------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    // Fire exactly once per page session
    if (!bootstrapRefreshPromise) {
      bootstrapRefreshPromise = api
        .post('/auth/refresh', {}, { skipAuth: true })
        .catch(() => null)   // normalise errors to null
        .finally(() => {
          // Release the cache after the response settles so that
          // a future full remount (e.g. dev HMR) can retry.
          // This does NOT cause a second StrictMode fire because
          // .finally runs in a later tick than both mounts.
          queueMicrotask(() => { bootstrapRefreshPromise = null; });
        });
    }

    const timeoutId = setTimeout(() => {
      if (!cancelled) clearSession();
    }, 8000);

    (async () => {
      const res = await bootstrapRefreshPromise;
      if (cancelled) return;

      clearTimeout(timeoutId);

      if (!res) { clearSession(); return; }

      const payload = res.data?.data;
      if (payload?.accessToken) {
        applySession(payload);
      } else {
        clearSession();
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [applySession, clearSession]);

  /* -------------------------------------------------------------- *
   *  Public API
   * -------------------------------------------------------------- */
  const login = useCallback(async (username, password) => {
    try {
      const { data } = await api.post(
        '/auth/login',
        { username, password },
        { skipAuth: true }
      );
      applySession(data.data);
      return { ok: true, user: data.data.user };
    } catch (error) {
      return { ok: false, error: extractApiError(error) };
    }
  }, [applySession]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* Logging out locally is more important than a clean server response. */
    } finally {
      // Allow a future page load / remount to bootstrap fresh.
      bootstrapRefreshPromise = null;
      clearSession();
    }
  }, [clearSession]);

  /** Reload user + profile + permissions from the server. */
  const reload = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      const payload = data.data;
      setUser(payload.user);
      setProfile(payload.profile);
      setRole(payload.role ?? null);
      setPermissions(payload.permissions ?? []);
      setStatus('authenticated');
      return payload;
    } catch (error) {
      const { status: httpStatus } = extractApiError(error);
      if (httpStatus === 401) clearSession();
      throw error;
    }
  }, [clearSession]);

  /**
   * hasPermission('a')            -> boolean
   * hasPermission(['a','b'])      -> true if ANY is held
   * hasPermission(['a','b'], true)-> true only if ALL are held
   */
  const hasPermission = useCallback((required, requireAll = false) => {
    if (!required) return true;
    const list = Array.isArray(required) ? required : [required];
    if (list.length === 0) return true;
    return requireAll
      ? list.every((p) => permissions.includes(p))
      : list.some((p) => permissions.includes(p));
  }, [permissions]);

  const value = useMemo(() => ({
    status,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
    user,
    profile,
    role,
    permissions,
    login,
    logout,
    reload,
    hasPermission,
    setProfile,
  }), [status, user, profile, role, permissions,
       login, logout, reload, hasPermission]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}