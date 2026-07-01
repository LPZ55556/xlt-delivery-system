import type { MoneyAmount } from '../utils/money';

export type Product = {
  id: string;
  name: string;
  barcode: string;
  category?: string;
  spec?: string;
  salePrice: MoneyAmount;
  costPrice?: MoneyAmount;
  stock: number;
  stockWarningValue?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
