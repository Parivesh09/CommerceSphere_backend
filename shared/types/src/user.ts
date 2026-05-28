export interface User {
  id: string;
  email: string;
  name: string;
  role: 'customer' | 'admin' | 'moderator';
  createdAt: Date;
  updatedAt: Date;
}

export interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}
