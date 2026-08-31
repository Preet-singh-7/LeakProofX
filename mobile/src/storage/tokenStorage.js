import * as SecureStore from 'expo-secure-store';

// SecureStore (iOS Keychain / Android Keystore) rather than AsyncStorage for
// tokens specifically — AsyncStorage is unencrypted on-disk storage, fine
// for the offline scan queue (custody metadata, not secrets) but not for
// JWTs. This is a stricter choice than the web dashboard's localStorage
// (see Phase 3 docs "Known limitations") — the mobile platform gives us a
// better option, so we use it.
const ACCESS_TOKEN_KEY = 'leakproofx.accessToken';
const REFRESH_TOKEN_KEY = 'leakproofx.refreshToken';
const USER_KEY = 'leakproofx.user';

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function getStoredUser() {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function setSession({ accessToken, refreshToken, user }) {
  const writes = [];
  if (accessToken) writes.push(SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken));
  if (refreshToken) writes.push(SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken));
  if (user) writes.push(SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)));
  await Promise.all(writes);
}

export async function setAccessToken(accessToken) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
}
