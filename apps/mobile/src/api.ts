import { API_BASE_URL } from './config';
import { clearSession, getAccessToken } from './storage';
import type { BusinessOverview, CurrentUser, Merchant, MerchantConsumptionRankingItem, Order, PagedResult, Product, ProductCategory, ProductSalesRankingItem, Receipt, TrackPoint } from './types';

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown; query?: Record<string, string | number | boolean | null | undefined> };
export class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
let unauthorizedHandler: (() => void) | undefined;
export function setUnauthorizedHandler(handler: () => void) { unauthorizedHandler = handler; }
function buildUrl(path: string, query?: RequestOptions['query']) { if (!API_BASE_URL) throw new ApiError('未配置 API 地址，请设置 MOBILE_API_BASE_URL。', 0); const normalizedPath = path.startsWith('/') ? path : `/${path}`; const qs = query ? Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&') : ''; return `${API_BASE_URL}${normalizedPath}${qs ? `?${qs}` : ''}`; }
function normalizeErrorMessage(payload: unknown, fallback: string) { if (payload && typeof payload === 'object' && 'message' in payload) { const message = (payload as { message?: unknown }).message; if (Array.isArray(message)) return message.join('；'); if (typeof message === 'string') { if (/^Cannot\s+(GET|POST|PATCH|DELETE|PUT)\s+/i.test(message)) return fallback; return message; } } return fallback; }
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> { const token = await getAccessToken(); const headers = new Headers(options.headers); if (!headers.has('Content-Type') && options.body !== undefined) headers.set('Content-Type', 'application/json'); if (token) headers.set('Authorization', `Bearer ${token}`); let response: Response; try { response = await fetch(buildUrl(path, options.query), { ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }); } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('网络请求失败，请检查网络和 API 地址。', 0); } const text = await response.text(); let payload: unknown = null; try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; } if (response.status === 401) { await clearSession(); unauthorizedHandler?.(); throw new ApiError('登录已过期，请重新登录。', response.status); } if (!response.ok) throw new ApiError(normalizeErrorMessage(payload, '请求失败，请稍后重试。'), response.status); return payload as T; }
export const api = {
  login: (body: { username: string; password: string }) => apiRequest<{ accessToken: string; tokenType: string; expiresIn: string; user: CurrentUser }>('/api/auth/login', { method: 'POST', body }),
  me: () => apiRequest<{ user: CurrentUser }>('/api/auth/me'),
  listMerchants: (query?: { search?: string; includeInactive?: boolean }) => apiRequest<PagedResult<Merchant>>('/api/merchants', { query: { page: 1, pageSize: 100, search: query?.search, includeInactive: query?.includeInactive } }),
  createMerchant: (body: Partial<Merchant>) => apiRequest<Merchant>('/api/merchants', { method: 'POST', body }),
  updateMerchant: (id: string, body: Partial<Merchant>) => apiRequest<Merchant>(`/api/merchants/${id}`, { method: 'PATCH', body }),
  disableMerchant: (id: string) => apiRequest<Merchant>(`/api/merchants/${id}`, { method: 'DELETE' }),
  listProducts: () => apiRequest<PagedResult<Product>>('/api/products'),
  productCategories: () => apiRequest<{ items: ProductCategory[] }>('/api/products/categories'),
  createProduct: (body: Partial<Product> & { salePrice?: string; stockWarningValue?: number | null }) => apiRequest<Product>('/api/products', { method: 'POST', body }),
  updateProduct: (id: string, body: Partial<Product> & { salePrice?: string; stockWarningValue?: number | null }) => apiRequest<Product>(`/api/products/${id}`, { method: 'PATCH', body }),
  disableProduct: (id: string) => apiRequest<Product>(`/api/products/${id}`, { method: 'DELETE' }),
  createOrder: (body: { merchantId: string; items: Array<{ productId: string; quantity: number }>; latitude?: string; longitude?: string; remark?: string }) => apiRequest<Order>('/api/orders', { method: 'POST', body }),
  listOrders: (query?: { dateFrom?: string; dateTo?: string; merchantKeyword?: string; status?: string }) => apiRequest<PagedResult<Order>>('/api/orders', { query: { page: 1, pageSize: 100, ...query } }),
  getOrder: (id: string) => apiRequest<Order>(`/api/orders/${id}`),
  getReceipt: (id: string) => apiRequest<Receipt>(`/api/orders/${id}/receipt`),
  productSalesRanking: (range: 'today' | '7d' | 'month') => apiRequest<{ range: string; items: ProductSalesRankingItem[] }>('/api/reports/product-sales-ranking', { query: { range, limit: 20 } }),
  merchantConsumptionRanking: (range: 'today' | '7d' | 'month') => apiRequest<{ range: string; items: MerchantConsumptionRankingItem[] }>('/api/reports/merchant-consumption-ranking', { query: { range, limit: 20 } }),
  verifyOverview: (costPricePassword: string) => apiRequest<{ verified: boolean }>('/api/reports/overview/verify', { method: 'POST', body: { costPricePassword } }),
  businessOverview: (range: 'today' | '7d' | 'month', costPricePassword: string) => apiRequest<BusinessOverview>('/api/reports/business-overview', { headers: { 'x-cost-price-password': costPricePassword }, query: { range } }),
  checkIn: (body: { merchantId: string; latitude?: string; longitude?: string; address?: string }) => apiRequest('/api/locations/check-in', { method: 'POST', body }),
  uploadTrackPoints: (points: TrackPoint[]) => apiRequest<{ count: number; items: TrackPoint[] }>('/api/locations/track-points', { method: 'POST', body: { points } }),
  myTodayTrack: () => apiRequest<{ points: TrackPoint[]; checkIns: Array<{ id: string; merchantId: string; latitude: string | null; longitude: string | null; address: string | null; createdAt: string }> }>('/api/locations/my-today-track'),
};
