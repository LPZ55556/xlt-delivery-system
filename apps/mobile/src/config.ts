import { NativeModules } from 'react-native';

type ProcessLike = { env?: Record<string, string | undefined> };
const processLike = globalThis as typeof globalThis & { process?: ProcessLike };
const nativeApiBaseUrl = NativeModules.XltConfig?.apiBaseUrl as string | undefined;
const nativeAmapAndroidKey = NativeModules.XltConfig?.amapAndroidKey as string | undefined;
const nativeAmapWebServiceKey = NativeModules.XltConfig?.amapWebServiceKey as string | undefined;

const configuredApiBaseUrl = nativeApiBaseUrl || processLike.process?.env?.MOBILE_API_BASE_URL || processLike.process?.env?.API_BASE_URL || '';

export const API_BASE_URL = configuredApiBaseUrl.replace(/\/$/, '');
export const AMAP_ANDROID_KEY = nativeAmapAndroidKey || processLike.process?.env?.AMAP_ANDROID_KEY || '';
export const AMAP_WEB_SERVICE_KEY = nativeAmapWebServiceKey || processLike.process?.env?.AMAP_WEB_SERVICE_KEY || processLike.process?.env?.AMAP_WEB_KEY || '';
