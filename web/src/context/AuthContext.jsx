import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import * as authApi from '../api/auth';
import { getAccessToken, getStoredUser, setSession, clearSession } from '../api/tokenStorage';
import { registerSessionExpiredHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    registerSessionExpiredHandler(() => setUser(null));
  }, []);

  // On load, if a token exists, re-validate it against GET /auth/me rather
  // than trusting whatever role/user object was last cached — the account
  // could have been deactivated or its role changed since the last visit.
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const token = getAccessToken();
      if (!token) {
        setIsBootstrapping(false);
        return;
      }
      try {
        const freshUser = await authApi.fetchMe();
        if (!cancelled) {
          setSession({ user: freshUser });
          setUser(freshUser);
        }
      } catch {
        if (!cancelled) {
          clearSession();
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
    setSession({ accessToken, refreshToken, user: loggedInUser });
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the network call fails, clear the local session — the user
      // clicked logout and expects to be logged out locally regardless.
    }
    clearSession();
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
