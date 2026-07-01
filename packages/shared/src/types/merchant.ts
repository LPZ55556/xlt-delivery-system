export type GeoPoint = { latitude: string; longitude: string };

export type Merchant = {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  address: string;
  location?: GeoPoint;
  region?: string;
  defaultSalespersonId?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
};
