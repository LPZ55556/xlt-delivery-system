import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CurrentUser } from './types';

const TOKEN_KEY = 'xlt_mobile_access_token';
const USER_KEY = 'xlt_mobile_current_user';

export async function getAccessToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function getStoredUser(): Promise<CurrentUser | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CurrentUser;
  } catch {
    await AsyncStorage.removeItem(USER_KEY);
    return null;
  }
}

export async function saveSession(accessToken: string, user: CurrentUser) {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, accessToken],
    [USER_KEY, JSON.stringify(user)],
  ]);
}

export async function clearSession() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}
