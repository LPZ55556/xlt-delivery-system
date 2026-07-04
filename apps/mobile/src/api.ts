import { API_BASE_URL as DEFAULT_API_BASE_URL } from './config';
import { clearSession, getAccessToken, getCustomApiBaseUrl } from './storage';
import type { BusinessOverview, CurrentUser, Merchant, MerchantConsumptionRankingItem, Order, PagedResult, Product, ProductCategory, ProductSalesRankingItem, Receipt, TrackPoint } from './types';

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown; query?: Record<string, string | number | boolean | null | undefined> };
type RankingRange = 'today' | '7d' | 'month' | '6m' | '1y' | 'all';
export class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
let unauthorizedHandler: (() => void) | undefined;
export function setUnauthorizedHandler(handler: () => void) { unauthorizedHandler = handler; }
export function normalizeApiBaseUrl(value: string) { return value.trim().replace(/\/+$/, ''); }
export async function getCurrentApiBaseUrl() { const custom = await getCustomApiBaseUrl(); return normalizeApiBaseUrl(custom || DEFAULT_API_BASE_URL || ''); }
async function buildUrl(path: string, query?: RequestOptions['query']) { const baseUrl = await getCurrentApiBaseUrl(); if (!baseUrl) throw new ApiError('\u672a\u914d\u7f6e API \u5730\u5740\uff0c\u8bf7\u8bbe\u7f6e MOBILE_API_BASE_URL \u6216\u5728\u767b\u5f55\u9875\u66f4\u6539 API \u5730\u5740\u3002', 0); const normalizedPath = path.startsWith('/') ? path : `/${path}`; const qs = query ? Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&') : ''; return `${baseUrl}${normalizedPath}${qs ? `?${qs}` : ''}`; }
function normalizeErrorMessage(payload: unknown, fallback: string) { if (payload && typeof payload === 'object' && 'message' in payload) { const message = (payload as { message?: unknown }).message; if (Array.isArray(message)) return message.join('；'); if (typeof message === 'string') { if (/^Cannot\s+(GET|POST|PATCH|DELETE|PUT)\s+/i.test(message)) return fallback; return message; } } return fallback; }
export async function testApiBaseUrl(url: string) { const baseUrl = normalizeApiBaseUrl(url); if (!/^https?:\/\//i.test(baseUrl)) throw new ApiError('API \u5730\u5740\u5fc5\u987b\u4ee5 http:// \u6216 https:// \u5f00\u5934\u3002', 0); try { const response = await fetch(`${baseUrl}/api/health`); if (!response.ok) throw new ApiError('\u8fde\u63a5\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 API \u670d\u52a1\u53ef\u8bbf\u95ee\u3002', response.status); return true; } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('\u8fde\u63a5\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u548c API \u5730\u5740\u3002', 0); } }
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> { const token = await getAccessToken(); const headers = new Headers(options.headers); if (!headers.has('Content-Type') && options.body !== undefined) headers.set('Content-Type', 'application/json'); if (token) headers.set('Authorization', `Bearer ${token}`); let response: Response; try { response = await fetch(await buildUrl(path, options.query), { ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }); } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('\u7f51\u7edc\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u548c API \u5730\u5740\u3002', 0); } const text = await response.text(); let payload: unknown = null; try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; } if (response.status === 401) { await clearSession(); unauthorizedHandler?.(); throw new ApiError('\u767b\u5f55\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002', response.status); } if (!response.ok) throw new ApiError(normalizeErrorMessage(payload, '\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'), response.status); return payload as T; }
export const api = {
  login: (body: { username: string; password: string }) => apiRequest<{ accessToken: string; tokenType: string; expiresIn: string; user: CurrentUser }>('/api/auth/login', { method: 'POST', body }),
  me: () => apiRequest<{ user: CurrentUser }>('/api/auth/me'),
  listMerchants: (query?: { search?: string; includeInactive?: boolean }) => apiRequest<PagedResult<Merchant>>('/api/merchants', { query: { page: 1, pageSize: 100, search: query?.search, includeInactive: query?.includeInactive } }),
  getMerchant: (id: string) => apiRequest<Merchant>(`/api/merchants/${id}`),
  createMerchant: (body: Partial<Merchant>) => apiRequest<Merchant>('/api/merchants', { method: 'POST', body }),
  updateMerchant: (id: string, body: Partial<Merchant>) => apiRequest<Merchant>(`/api/merchants/${id}`, { method: 'PATCH', body }),
  disableMerchant: (id: string) => apiRequest<Merchant>(`/api/merchants/${id}`, { method: 'DELETE' }),
  listProducts: () => apiRequest<PagedResult<Product>>('/api/products'),
  productCategories: () => apiRequest<{ items: ProductCategory[] }>('/api/products/categories'),
  createProduct: (body: Partial<Product> & { salePrice?: string; stockWarningValue?: number | null }) => apiRequest<Product>('/api/products', { method: 'POST', body }),
  updateProduct: (id: string, body: Partial<Product> & { salePrice?: string; stockWarningValue?: number | null }) => apiRequest<Product>(`/api/products/${id}`, { method: 'PATCH', body }),
  disableProduct: (id: string) => apiRequest<Product>(`/api/products/${id}`, { method: 'DELETE' }),
  createOrder: (body: { merchantId: string; items: Array<{ productId: string; quantity: number }>; latitude?: string; longitude?: string; remark?: string }) => apiRequest<Order>('/api/orders', { method: 'POST', body }),
  listOrders: (query?: { dateFrom?: string; dateTo?: string; merchantId?: string; merchantKeyword?: string; status?: string }) => apiRequest<PagedResult<Order>>('/api/orders', { query: { page: 1, pageSize: 100, ...query } }),
  getOrder: (id: string) => apiRequest<Order>(`/api/orders/${id}`),
  getReceipt: (id: string) => apiRequest<Receipt>(`/api/orders/${id}/receipt`),
  productSalesRanking: (range: 'today' | '7d' | 'month') => apiRequest<{ range: string; items: ProductSalesRankingItem[] }>('/api/reports/product-sales-ranking', { query: { range, limit: 20 } }),
  merchantConsumptionRanking: (range: RankingRange) => apiRequest<{ range: string; items: MerchantConsumptionRankingItem[] }>('/api/reports/merchant-consumption-ranking', { query: { range, limit: 20 } }),
  verifyOverview: (costPricePassword: string) => apiRequest<{ verified: boolean }>('/api/reports/overview/verify', { method: 'POST', body: { costPricePassword } }),
  businessOverview: (range: 'today' | '7d' | 'month', costPricePassword: string) => apiRequest<BusinessOverview>('/api/reports/business-overview', { headers: { 'x-cost-price-password': costPricePassword }, query: { range } }),
  checkIn: (body: { merchantId: string; latitude?: string; longitude?: string; address?: string }) => apiRequest('/api/locations/check-in', { method: 'POST', body }),
  uploadTrackPoints: (points: TrackPoint[]) => apiRequest<{ count: number; items: TrackPoint[] }>('/api/locations/track-points', { method: 'POST', body: { points } }),
  myTodayTrack: () => apiRequest<{ points: TrackPoint[]; checkIns: Array<{ id: string; merchantId: string; latitude: string | null; longitude: string | null; address: string | null; createdAt: string }> }>('/api/locations/my-today-track'),
};
