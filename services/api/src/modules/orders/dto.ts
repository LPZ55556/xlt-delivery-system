export type CreateOrderRequest = {
  merchantId?: string;
  items?: Array<{
    productId?: string;
    quantity?: number;
  }>;
  latitude?: string;
  longitude?: string;
  remark?: string;
};

export type OrderListQuery = {
  page?: string;
  pageSize?: string;
  dateFrom?: string;
  dateTo?: string;
  merchantKeyword?: string;
  status?: 'created' | 'printed' | 'synced' | 'voided';
};

export type VoidOrderRequest = {
  reason?: string;
};
