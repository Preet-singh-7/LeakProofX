import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import * as authApi from '../api/auth';
import { getAccessToken, setSession, clearSession } from '../storage/tokenStorage';
import { registerSessionExpiredHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    registerSessionExpiredHandler(() => setUser(null));
  }, []);

  // Same reasoning as the web dashboard: re-validate against GET /auth/me on
  // launch rather than trusting whatever was cached at last login, so a
  // deactivated account or changed role is caught immediately rather than
  // silently trusted until the token naturally expires.
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const token = await getAccessToken();
      if (!token) {
        if (!cancelled) setIsBootstrapping(false);
        return;
      }
      try {
        const freshUser = await authApi.fetchMe();
        if (!cancelled) {
          await setSession({ user: freshUser });
          setUser(freshUser);
        }
      } catch {
        if (!cancelled) {
          await clearSession();
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const { user: loggedInUser, accessToken, refreshToken } = await authApi.login(email, password);
    await setSession({ accessToken, refreshToken, user: loggedInUser });
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Log out locally regardless of whether the network call succeeded.
    }
    await clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isAuthenticated: Boolean(user), isBootstrapping, login, logout }),
    [user, isBootstrapping, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
