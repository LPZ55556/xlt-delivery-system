export type UserRole = 'super_admin' | 'admin' | 'finance' | 'warehouse' | 'salesperson';

export type User = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
