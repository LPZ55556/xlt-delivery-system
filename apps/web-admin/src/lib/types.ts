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
    spec?: string | null;
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


export type ProductSalesRankingItem = {
  rank: number;
  productId: string;
  productName: string;
  barcode: string;
  category?: string | null;
  quantitySold: number;
  salesAmount: string;
};

export type MerchantConsumptionRankingItem = {
  rank: number;
  merchantId: string;
  merchantName: string;
  orderCount: number;
  totalAmount: string;
  lastOrderAt: string;
};

export type BusinessOverview = {
  totalSalesAmount: string;
  totalOrders: number;
  totalProfit: string;
  profitNote: string;
  productSalesSummary: Array<{ productId: string; productName: string; barcode: string; category: string | null; quantitySold: number; salesAmount: string; costAmount: string; profitAmount: string }>;
  merchantConsumptionSummary: MerchantConsumptionRankingItem[];
  salespersonSummary: Array<{ salespersonId: string; salespersonName: string; orderCount: number; totalAmount: string }>;
};

export type ProductCategory = { name: string };

export type ReceiptTemplateSetting = {
  id: string;
  title: string;
  paperWidthMm: number;
  footerText: string;
  showMerchantName: boolean;
  showOrderNo: boolean;
  showSalesperson: boolean;
  showPrintTime: boolean;
  updatedAt: string;
};
