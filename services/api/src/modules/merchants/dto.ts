export type MerchantListQuery = {
  page?: string;
  pageSize?: string;
  search?: string;
  includeInactive?: string;
};

export type CreateMerchantRequest = {
  name?: string;
  contactName?: string;
  phone?: string;
  address?: string;
  latitude?: string;
  longitude?: string;
  area?: string;
  defaultSalespersonId?: string;
  remark?: string;
  isActive?: boolean;
};

export type UpdateMerchantRequest = Partial<CreateMerchantRequest>;
