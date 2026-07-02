export type UserListQuery = {
  page?: string;
  pageSize?: string;
  search?: string;
  role?: string;
  isActive?: string;
};

export type CreateUserRequest = {
  username?: string;
  name?: string;
  phone?: string;
  role?: string;
  password?: string;
};

export type UpdateUserRequest = {
  name?: string;
  phone?: string;
  role?: string;
  isActive?: boolean;
};

export type ResetUserPasswordRequest = {
  newPassword?: string;
};
