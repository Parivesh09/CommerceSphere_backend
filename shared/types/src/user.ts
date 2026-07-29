export type UserRole = 'customer' | 'seller' | 'admin' | 'moderator';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JWTPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}
