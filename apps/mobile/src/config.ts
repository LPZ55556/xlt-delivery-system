import { NativeModules } from 'react-native';

type ProcessLike = { env?: Record<string, string | undefined> };
const processLike = globalThis as typeof globalThis & { process?: ProcessLike };
const nativeApiBaseUrl = NativeModules.XltConfig?.apiBaseUrl as string | undefined;

const configuredApiBaseUrl = nativeApiBaseUrl || processLike.process?.env?.MOBILE_API_BASE_URL || processLike.process?.env?.API_BASE_URL || '';

export const API_BASE_URL = configuredApiBaseUrl.replace(/\/$/, '');
