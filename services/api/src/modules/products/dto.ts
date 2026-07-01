export type CreateProductRequest = {
  name?: string;
  barcode?: string;
  category?: string;
  spec?: string;
  salePrice?: string;
  costPrice?: string;
  stock?: number;
  stockWarningValue?: number;
  enabled?: boolean;
};

export type UpdateProductRequest = Partial<CreateProductRequest>;

export type VerifyCostPriceRequest = {
  costPricePassword?: string;
};
