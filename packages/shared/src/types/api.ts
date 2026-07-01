export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  requestId?: string;
};

export type PaginationQuery = { page?: number; pageSize?: number };
export type PaginatedResult<T> = { items: T[]; total: number; page: number; pageSize: number };
