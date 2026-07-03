import { clearSession, getAccessToken } from './session';
import type { BusinessOverview, CurrentUser, ManagedUser, Merchant, MerchantConsumptionRankingItem, Order, PagedResult, Product, ProductCategory, ProductSalesRankingItem, Receipt, ReceiptTemplateSetting } from './types';

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');

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

function buildUrl(path: string, query?: RequestOptions['query']) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${apiBaseUrl}${normalizedPath}`;
  if (!query) return url;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
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
  const token = getAccessToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(buildUrl(path, options.query), {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (response.status === 401) {
    clearSession();
    if (typeof window !== 'undefined') window.location.assign('/login');
    throw new ApiError('登录已过期，请重新登录。', response.status);
  }

  if (!response.ok) {
    throw new ApiError(normalizeErrorMessage(payload, '请求失败，请稍后重试。'), response.status);
  }

  return payload as T;
}


export type UserInput = {
  username?: string;
  name: string;
  phone?: string;
  role: string;
  password?: string;
};

export type ProductInput = {
  name: string;
  barcode: string;
  category?: string;
  spec?: string;
  salePrice: string;
  costPrice?: string;
  stock?: number;
  stockWarningValue?: number;
  enabled?: boolean;
};

export type MerchantInput = {
  name: string;
  contactName?: string;
  phone?: string;
  address: string;
  latitude?: string;
  longitude?: string;
  area?: string;
  defaultSalespersonId?: string;
  remark?: string;
  isActive?: boolean;
};

export const api = {
  login: (body: { username: string; password: string }) =>
    apiRequest<{ accessToken: string; tokenType: string; expiresIn: string; user: CurrentUser }>('/api/auth/login', { method: 'POST', body }),
  getMe: () => apiRequest<{ user: CurrentUser }>('/api/auth/me'),
  getFirstRunStatus: () => apiRequest<{ initialized: boolean; setupAvailable: boolean }>('/api/first-run-setup/status'),
  firstRunSetup: (body: {
    adminUsername: string;
    adminPassword: string;
    adminPasswordConfirm: string;
    costPricePassword: string;
    costPricePasswordConfirm: string;
  }) => apiRequest<{ initialized: boolean; setupAvailable: boolean }>('/api/first-run-setup', { method: 'POST', body }),
  listUsers: (query?: { page?: number; pageSize?: number; search?: string; role?: string; isActive?: boolean }) =>
    apiRequest<PagedResult<ManagedUser>>('/api/users', { query }),
  getUser: (id: string) => apiRequest<ManagedUser>(`/api/users/${id}`),
  createUser: (body: UserInput) => apiRequest<ManagedUser>('/api/users', { method: 'POST', body }),
  updateUser: (id: string, body: Omit<UserInput, 'username' | 'password'>) => apiRequest<ManagedUser>(`/api/users/${id}`, { method: 'PATCH', body }),
  resetUserPassword: (id: string, newPassword: string) => apiRequest<ManagedUser>(`/api/users/${id}/password`, { method: 'PATCH', body: { newPassword } }),
  resetCostPricePassword: (body: { currentPassword: string; newCostPricePassword: string; newCostPricePasswordConfirm: string }) =>
    apiRequest<{ updated: boolean }>('/api/system-settings/cost-price-password', { method: 'PATCH', body }),
  disableUser: (id: string) => apiRequest<ManagedUser>(`/api/users/${id}/disable`, { method: 'PATCH' }),
  enableUser: (id: string) => apiRequest<ManagedUser>(`/api/users/${id}/enable`, { method: 'PATCH' }),
  listProducts: () => apiRequest<PagedResult<Product>>('/api/products'),
  getProduct: (id: string) => apiRequest<Product>(`/api/products/${id}`),
  createProduct: (body: ProductInput) => apiRequest<Product>('/api/products', { method: 'POST', body }),
  updateProduct: (id: string, body: ProductInput) => apiRequest<Product>(`/api/products/${id}`, { method: 'PATCH', body }),
  disableProduct: (id: string) => apiRequest<Product>(`/api/products/${id}`, { method: 'DELETE' }),
  verifyProductCostPrice: (id: string, costPricePassword: string) =>
    apiRequest<{ productId: string; costPrice: string | null }>(`/api/products/${id}/cost-price-verification`, {
      method: 'POST',
      body: { costPricePassword },
    }),
  listMerchants: (query?: { page?: number; pageSize?: number; search?: string; includeInactive?: boolean }) =>
    apiRequest<PagedResult<Merchant>>('/api/merchants', { query }),
  getMerchant: (id: string) => apiRequest<Merchant>(`/api/merchants/${id}`),
  createMerchant: (body: MerchantInput) => apiRequest<Merchant>('/api/merchants', { method: 'POST', body }),
  updateMerchant: (id: string, body: MerchantInput) => apiRequest<Merchant>(`/api/merchants/${id}`, { method: 'PATCH', body }),
  disableMerchant: (id: string) => apiRequest<Merchant>(`/api/merchants/${id}`, { method: 'DELETE' }),
  productCategories: () => apiRequest<{ items: ProductCategory[] }>('/api/products/categories'),
  productSalesRanking: (range: 'today' | '7d' | 'month') => apiRequest<{ range: string; items: ProductSalesRankingItem[] }>('/api/reports/product-sales-ranking', { query: { range, limit: 20 } }),
  merchantConsumptionRanking: (range: 'today' | '7d' | 'month' | '6m' | '1y' | 'all') => apiRequest<{ range: string; items: MerchantConsumptionRankingItem[] }>('/api/reports/merchant-consumption-ranking', { query: { range, limit: 50 } }),
  verifyOverview: (costPricePassword: string) => apiRequest<{ verified: boolean }>('/api/reports/overview/verify', { method: 'POST', body: { costPricePassword } }),
  businessOverview: (range: 'today' | '7d' | 'month', costPricePassword: string) => apiRequest<BusinessOverview>('/api/reports/business-overview', { headers: { 'x-cost-price-password': costPricePassword }, query: { range } }),
  getReceiptTemplate: () => apiRequest<ReceiptTemplateSetting>('/api/system-settings/receipt-template'),
  updateReceiptTemplate: (body: Partial<Omit<ReceiptTemplateSetting, 'id' | 'updatedAt'>>) => apiRequest<ReceiptTemplateSetting>('/api/system-settings/receipt-template', { method: 'PATCH', body }),
  listOrders: (query?: { page?: number; pageSize?: number; dateFrom?: string; dateTo?: string; merchantId?: string; merchantKeyword?: string; status?: string }) => apiRequest<PagedResult<Order>>('/api/orders', { query }),
  getOrder: (id: string) => apiRequest<Order>(`/api/orders/${id}`),
  voidOrder: (id: string, reason?: string) => apiRequest<Order>(`/api/orders/${id}/void`, { method: 'PATCH', body: { reason } }),
  getReceipt: (id: string) => apiRequest<Receipt>(`/api/orders/${id}/receipt`),
};
