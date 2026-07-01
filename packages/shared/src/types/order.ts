import type { MoneyAmount } from '../utils/money';
import type { GeoPoint, Merchant } from './merchant';
import type { User } from './user';

export type OrderStatus = 'created' | 'printed' | 'synced' | 'voided';

export type OrderItem = {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productBarcodeSnapshot: string;
  productSpecSnapshot?: string | null;
  salePriceSnapshot: MoneyAmount;
  quantity: number;
  subtotal: MoneyAmount;
};

export type Order = {
  id: string;
  orderNo: string;
  merchantId: string;
  salespersonId: string;
  merchant?: Pick<Merchant, 'id' | 'name' | 'address' | 'contactName' | 'phone'> | null;
  salesperson?: Pick<User, 'id' | 'username' | 'displayName' | 'role'> | null;
  items: OrderItem[];
  totalAmount: MoneyAmount;
  status: OrderStatus;
  location?: GeoPoint | null;
  remark?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  createdAt: string;
  updatedAt: string;
};
