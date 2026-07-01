type ProcessLike = { env?: Record<string, string | undefined> };
const processLike = globalThis as typeof globalThis & { process?: ProcessLike };

export const API_BASE_URL =
  processLike.process?.env?.MOBILE_API_BASE_URL ??
  processLike.process?.env?.API_BASE_URL ??
  'http://api.lnize.top:8080';
