export type UserRole = 'super_admin' | 'admin' | 'finance' | 'warehouse' | 'salesperson' | string;

export type CurrentUser = {
  id: string;
  username: string;
  name?: string;
  displayName: string;
  role: UserRole;
  isActive?: boolean;
  enabled: boolean;
};

export type ManagedUser = {
  id: string;
  username: string;
  name: string;
  displayName: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  name: string;
  barcode: string;
  category: string | null;
  spec: string | null;
  salePrice: string;
  stock: number;
  stockWarningValue: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Merchant = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  address: string;
  latitude: string | null;
  longitude: string | null;
  area: string | null;
  defaultSalespersonId: string | null;
  remark: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrderItem = {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productBarcodeSnapshot: string;
  productSpecSnapshot: string | null;
  salePriceSnapshot: string;
  quantity: number;
  subtotal: string;
};

export type Order = {
  id: string;
  orderNo: string;
  merchantId: string;
  salespersonId: string;
  merchant: {
    id: string;
    name: string;
    address: string;
    contactName: string | null;
    phone: string | null;
  } | null;
  salesperson: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  } | null;
  totalAmount: string;
  status: 'created' | 'voided' | string;
  latitude: string | null;
  longitude: string | null;
  remark: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
};

export type Receipt = {
  storeName: string;
  salespersonName: string;
  dateTime: string;
  orderNo: string;
  items: Array<{
    productName: string;
    unitPrice: string;
    quantity: number;
    subtotal: string;
  }>;
  totalAmount: string;
};

export type PagedResult<T> = {
  items: T[];
  total?: number;
  page?: number;
  pageSize?: number;
};
