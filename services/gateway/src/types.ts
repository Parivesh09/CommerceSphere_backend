import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    email: string;
    role: string;
    iat: number;
    exp: number;
  };
  correlationId?: string;
}

export interface RateLimitInfo {
  count: number;
  resetTime: number;
}

export interface RouteConfig {
  path: string;
  target: string;
  requiresAuth: boolean;
}
