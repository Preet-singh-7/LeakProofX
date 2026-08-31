// Token storage lives in one place so the "where" is easy to audit and to
// change later (e.g. moving to an httpOnly-cookie-backed session, which
// would need a backend change too — see Phase 3 docs "Known limitations"
// for why localStorage was chosen for this MVP over that alternative).
const ACCESS_TOKEN_KEY = 'leakproofx.accessToken';
const REFRESH_TOKEN_KEY = 'leakproofx.refreshToken';
const USER_KEY = 'leakproofx.user';

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession({ accessToken, refreshToken, user }) {
  if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function setAccessToken(accessToken) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
