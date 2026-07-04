import type { MoneyString, UserRole } from '@xlt/shared';

export type CurrentUser = { id: string; username: string; name?: string; displayName: string; role: UserRole | string; isActive?: boolean; enabled: boolean };
export type Product = { id: string; name: string; barcode: string; category: string | null; spec: string | null; salePrice: MoneyString; stock: number; stockWarningValue: number | null; enabled: boolean; createdAt: string; updatedAt: string };
export type Merchant = { id: string; name: string; contactName: string | null; phone: string | null; address: string; latitude: string | null; longitude: string | null; area: string | null; defaultSalespersonId: string | null; remark: string | null; isActive: boolean; createdAt: string; updatedAt: string; distanceMeters?: number | null };
export type OrderItem = { id: string; productId: string; productNameSnapshot: string; productBarcodeSnapshot: string; productSpecSnapshot: string | null; salePriceSnapshot: MoneyString; quantity: number; subtotal: MoneyString };
export type Order = { id: string; orderNo: string; merchantId: string; salespersonId: string; merchant: { id: string; name: string; address: string; contactName: string | null; phone: string | null } | null; salesperson: { id: string; username: string; displayName: string; role: string } | null; items: OrderItem[]; totalAmount: MoneyString; status: string; latitude: string | null; longitude: string | null; remark: string | null; voidedAt: string | null; voidReason: string | null; createdAt: string; updatedAt: string };
export type Receipt = { storeName: string; salespersonName: string; dateTime: string; orderNo: string; items: Array<{ productName: string; spec?: string | null; unitPrice: MoneyString; quantity: number; subtotal: MoneyString }>; totalAmount: MoneyString };
export type CartItem = { product: Product; quantity: number };
export type PagedResult<T> = { items: T[]; total?: number; page?: number; pageSize?: number };
export type ProductSalesRankingItem = { rank: number; productId: string; productName: string; barcode: string; category?: string | null; quantitySold: number; salesAmount: MoneyString };
export type MerchantConsumptionRankingItem = { rank: number; merchantId: string; merchantName: string; orderCount: number; totalAmount: MoneyString; lastOrderAt: string };
export type BusinessOverview = { totalSalesAmount: MoneyString; totalOrders: number; totalProfit: MoneyString; profitNote: string; productSalesSummary: Array<{ productId: string; productName: string; barcode: string; category: string | null; quantitySold: number; salesAmount: MoneyString; costAmount: MoneyString; profitAmount: MoneyString }>; merchantConsumptionSummary: MerchantConsumptionRankingItem[]; salespersonSummary: Array<{ salespersonId: string; salespersonName: string; orderCount: number; totalAmount: MoneyString }> };
export type ProductCategory = { name: string };
export type TrackPoint = { id?: string; userId?: string; latitude: string; longitude: string; accuracy?: string | null; speed?: string | null; recordedAt: string; createdAt?: string };
export type AmapPoi = { id: string; name: string; address: string; latitude: string; longitude: string };
export type PrinterDevice = { name: string; address: string };
export type ReceiptSettings = { title: string; paperWidthMm: string; footer: string; printer?: PrinterDevice | null };
