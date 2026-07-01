import type { MoneyAmount } from '../utils/money';
import type { GeoPoint } from './merchant';

export type OrderStatus = 'created' | 'printed' | 'synced' | 'voided';

export type OrderItem = {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productSpecSnapshot?: string;
  salePriceSnapshot: MoneyAmount;
  quantity: number;
  subtotalSnapshot: MoneyAmount;
};

export type Order = {
  id: string;
  orderNo: string;
  merchantId: string;
  salespersonId: string;
  items: OrderItem[];
  totalAmount: MoneyAmount;
  status: OrderStatus;
  printed: boolean;
  synced: boolean;
  location?: GeoPoint;
  createdAt: string;
  updatedAt: string;
};
