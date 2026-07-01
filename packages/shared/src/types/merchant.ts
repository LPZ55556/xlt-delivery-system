export type GeoPoint = {
  latitude: string;
  longitude: string;
};

export type Merchant = {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  address: string;
  location?: GeoPoint | null;
  area?: string | null;
  defaultSalespersonId?: string | null;
  remark?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
