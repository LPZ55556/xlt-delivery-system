import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CurrentUser, PrinterDevice, ReceiptSettings } from './types';

const TOKEN_KEY = 'xlt_mobile_access_token';
const USER_KEY = 'xlt_mobile_current_user';
const RECEIPT_SETTINGS_KEY = 'xlt_mobile_receipt_settings';
const API_BASE_URL_OVERRIDE_KEY = 'xlt_mobile_api_base_url_override';

export async function getAccessToken() { return AsyncStorage.getItem(TOKEN_KEY); }
export async function getStoredUser(): Promise<CurrentUser | null> { const raw = await AsyncStorage.getItem(USER_KEY); if (!raw) return null; try { return JSON.parse(raw) as CurrentUser; } catch { await AsyncStorage.removeItem(USER_KEY); return null; } }
export async function saveSession(accessToken: string, user: CurrentUser) { await AsyncStorage.multiSet([[TOKEN_KEY, accessToken], [USER_KEY, JSON.stringify(user)]]); }
export async function clearSession() { await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]); }
export async function getReceiptSettings(): Promise<ReceiptSettings> { const defaults: ReceiptSettings = { title: '源源食品销售单', paperWidthMm: '72', footer: '\u8c22\u8c22\u60e0\u987e', printer: null }; const raw = await AsyncStorage.getItem(RECEIPT_SETTINGS_KEY); if (!raw) return defaults; try { return { ...defaults, ...(JSON.parse(raw) as Partial<ReceiptSettings>) }; } catch { return defaults; } }
export async function saveReceiptSettings(settings: ReceiptSettings) { await AsyncStorage.setItem(RECEIPT_SETTINGS_KEY, JSON.stringify(settings)); }
export async function saveDefaultPrinter(printer: PrinterDevice) { const settings = await getReceiptSettings(); await saveReceiptSettings({ ...settings, printer }); }

export async function getCustomApiBaseUrl() { return AsyncStorage.getItem(API_BASE_URL_OVERRIDE_KEY); }
export async function saveCustomApiBaseUrl(url: string) { await AsyncStorage.setItem(API_BASE_URL_OVERRIDE_KEY, url); }
export async function clearCustomApiBaseUrl() { await AsyncStorage.removeItem(API_BASE_URL_OVERRIDE_KEY); }
