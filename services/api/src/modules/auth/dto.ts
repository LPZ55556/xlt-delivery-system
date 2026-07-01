export type LoginRequest = {
  username?: string;
  password?: string;
};

export type AuthTokenPayload = {
  sub: string;
  username: string;
  role: string;
};
