import { API_BASE_URL } from './config';
import { clearSession, getAccessToken } from './storage';
import type { CurrentUser, Merchant, Order, PagedResult, Product, Receipt } from './types';

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let unauthorizedHandler: (() => void) | undefined;

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  if (!API_BASE_URL) throw new ApiError('未配置 API 地址，请设置 MOBILE_API_BASE_URL。', 0);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const qs = query
    ? Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&')
    : '';
  return `${API_BASE_URL}${normalizedPath}${qs ? `?${qs}` : ''}`;
}

function normalizeErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join('；');
    if (typeof message === 'string') return message;
  }
  return fallback;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const url = buildUrl(path, options.query);

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('网络请求失败，请检查网络和 API 地址。', 0);
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (response.status === 401) {
    await clearSession();
    unauthorizedHandler?.();
    throw new ApiError('登录已过期，请重新登录。', response.status);
  }

  if (!response.ok) throw new ApiError(normalizeErrorMessage(payload, '请求失败，请稍后重试。'), response.status);
  return payload as T;
}

export const api = {
  login: (body: { username: string; password: string }) =>
    apiRequest<{ accessToken: string; tokenType: string; expiresIn: string; user: CurrentUser }>('/api/auth/login', { method: 'POST', body }),
  me: () => apiRequest<{ user: CurrentUser }>('/api/auth/me'),
  listMerchants: () => apiRequest<PagedResult<Merchant>>('/api/merchants', { query: { page: 1, pageSize: 100 } }),
  listProducts: () => apiRequest<PagedResult<Product>>('/api/products'),
  getProduct: (id: string) => apiRequest<Product>(`/api/products/${id}`),
  createOrder: (body: { merchantId: string; items: Array<{ productId: string; quantity: number }>; latitude?: string; longitude?: string; remark?: string }) =>
    apiRequest<Order>('/api/orders', { method: 'POST', body }),
  listOrders: () => apiRequest<PagedResult<Order>>('/api/orders', { query: { page: 1, pageSize: 100 } }),
  getOrder: (id: string) => apiRequest<Order>(`/api/orders/${id}`),
  getReceipt: (id: string) => apiRequest<Receipt>(`/api/orders/${id}/receipt`),
};
