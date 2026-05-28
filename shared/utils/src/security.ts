import { Request, Response, NextFunction } from 'express';
import { createLogger } from './logger';
import crypto from 'crypto';

const logger = createLogger({ serviceName: 'security-middleware' });

/**
 * Input validation and sanitization middleware
 * Prevents SQL injection and XSS attacks
 */
export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'email' | 'uuid' | 'boolean' | 'array' | 'object';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  sanitize?: boolean;
}

export interface ValidationSchema {
  body?: ValidationRule[];
  query?: ValidationRule[];
  params?: ValidationRule[];
}

/**
 * Sanitize string input to prevent XSS attacks
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return input;
  }

  return input
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=
    .trim();
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate input against schema
 */
export function validateInput(data: any, rules: ValidationRule[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const rule of rules) {
    const value = data[rule.field];


    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(`${rule.field} is required`);
      continue;
    }


    if (!rule.required && (value === undefined || value === null)) {
      continue;
    }


    switch (rule.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${rule.field} must be a string`);
        } else {
          if (rule.minLength && value.length < rule.minLength) {
            errors.push(`${rule.field} must be at least ${rule.minLength} characters`);
          }
          if (rule.maxLength && value.length > rule.maxLength) {
            errors.push(`${rule.field} must be at most ${rule.maxLength} characters`);
          }
          if (rule.pattern && !rule.pattern.test(value)) {
            errors.push(`${rule.field} has invalid format`);
          }
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(`${rule.field} must be a number`);
        } else {
          if (rule.min !== undefined && value < rule.min) {
            errors.push(`${rule.field} must be at least ${rule.min}`);
          }
          if (rule.max !== undefined && value > rule.max) {
            errors.push(`${rule.field} must be at most ${rule.max}`);
          }
        }
        break;

      case 'email':
        if (typeof value !== 'string' || !isValidEmail(value)) {
          errors.push(`${rule.field} must be a valid email address`);
        }
        break;

      case 'uuid':
        if (typeof value !== 'string' || !isValidUUID(value)) {
          errors.push(`${rule.field} must be a valid UUID`);
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${rule.field} must be a boolean`);
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`${rule.field} must be an array`);
        }
        break;

      case 'object':
        if (typeof value !== 'object' || Array.isArray(value) || value === null) {
          errors.push(`${rule.field} must be an object`);
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validation middleware factory
 */
export function validateRequest(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];


    if (schema.body) {
      const bodyValidation = validateInput(req.body, schema.body);
      if (!bodyValidation.valid) {
        errors.push(...bodyValidation.errors);
      }


      const sanitizeFields = schema.body.filter(r => r.sanitize).map(r => r.field);
      if (sanitizeFields.length > 0) {
        req.body = sanitizeObject(req.body);
      }
    }


    if (schema.query) {
      const queryValidation = validateInput(req.query, schema.query);
      if (!queryValidation.valid) {
        errors.push(...queryValidation.errors);
      }
    }


    if (schema.params) {
      const paramsValidation = validateInput(req.params, schema.params);
      if (!paramsValidation.valid) {
        errors.push(...paramsValidation.errors);
      }
    }

    if (errors.length > 0) {
      logger.warn('Request validation failed', {
        path: req.path,
        method: req.method,
        errors,
      });

      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: errors,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
      return;
    }

    next();
  };
}

/**
 * CORS configuration middleware
 */
export interface CORSOptions {
  allowedOrigins: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export function corsMiddleware(options: CORSOptions) {
  const {
    allowedOrigins,
    allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-Correlation-ID'],
    exposedHeaders = ['X-Correlation-ID'],
    credentials = true,
    maxAge = 86400, // 24 hours
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;


    if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    res.setHeader('Access-Control-Expose-Headers', exposedHeaders.join(', '));
    res.setHeader('Access-Control-Max-Age', maxAge.toString());


    if (req.method === 'OPTIONS') {
      res.status(204).send();
      return;
    }

    next();
  };
}

/**
 * CSRF protection middleware
 * Uses double-submit cookie pattern
 */
export interface CSRFOptions {
  cookieName?: string;
  headerName?: string;
  excludePaths?: string[];
  excludeMethods?: string[];
}

export function csrfProtection(options: CSRFOptions = {}) {
  const {
    cookieName = 'csrf-token',
    headerName = 'x-csrf-token',
    excludePaths = [],
    excludeMethods = ['GET', 'HEAD', 'OPTIONS'],
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {

    if (excludeMethods.includes(req.method)) {
      next();
      return;
    }


    if (excludePaths.some(path => req.path.startsWith(path))) {
      next();
      return;
    }


    const cookieToken = req.cookies?.[cookieName];
    const headerToken = req.headers[headerName];


    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      logger.warn('CSRF validation failed', {
        path: req.path,
        method: req.method,
        hasCookie: !!cookieToken,
        hasHeader: !!headerToken,
      });

      res.status(403).json({
        error: {
          code: 'CSRF_VALIDATION_FAILED',
          message: 'CSRF token validation failed',
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
      return;
    }

    next();
  };
}

/**
 * Generate CSRF token
 */
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Security headers middleware
 * Adds common security headers to responses
 */
export function securityHeadersMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {

    res.setHeader('X-Frame-Options', 'DENY');


    res.setHeader('X-Content-Type-Options', 'nosniff');


    res.setHeader('X-XSS-Protection', '1; mode=block');


    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');


    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'"
    );


    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');


    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    next();
  };
}

/**
 * Rate limiting helper
 * Note: Actual rate limiting is implemented in API Gateway using Redis
 * This is a simple in-memory rate limiter for services without gateway
 */
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: Request) => string; // Function to generate rate limit key
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export function rateLimitMiddleware(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req: Request) => req.ip || 'unknown',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  const store: RateLimitStore = {};


  setInterval(() => {
    const now = Date.now();
    for (const key in store) {
      if (store[key].resetTime < now) {
        delete store[key];
      }
    }
  }, windowMs);

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const now = Date.now();


    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 0,
        resetTime: now + windowMs,
      };
    }


    if (store[key].count >= maxRequests) {
      const retryAfter = Math.ceil((store[key].resetTime - now) / 1000);

      logger.warn('Rate limit exceeded', {
        key,
        path: req.path,
        method: req.method,
      });

      res.status(429)
        .setHeader('Retry-After', retryAfter.toString())
        .setHeader('X-RateLimit-Limit', maxRequests.toString())
        .setHeader('X-RateLimit-Remaining', '0')
        .setHeader('X-RateLimit-Reset', store[key].resetTime.toString())
        .json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
            retryAfter,
            timestamp: new Date().toISOString(),
            path: req.path,
          },
        });
      return;
    }


    store[key].count++;


    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', (maxRequests - store[key].count).toString());
    res.setHeader('X-RateLimit-Reset', store[key].resetTime.toString());


    const originalSend = res.send;
    res.send = function (data: any) {
      const shouldSkip =
        (skipSuccessfulRequests && res.statusCode < 400) ||
        (skipFailedRequests && res.statusCode >= 400);

      if (shouldSkip) {
        store[key].count--;
      }

      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * SQL injection prevention helper
 * Validates that parameterized queries are being used
 */
export function isSafeQuery(query: string): boolean {

  const dangerousPatterns = [
    /;\s*DROP\s+TABLE/i,
    /;\s*DELETE\s+FROM/i,
    /;\s*UPDATE\s+.*\s+SET/i,
    /UNION\s+SELECT/i,
    /--/,
    /\/\*/,
    /xp_cmdshell/i,
    /exec\s*\(/i,
  ];

  return !dangerousPatterns.some(pattern => pattern.test(query));
}

/**
 * Data encryption helpers for sensitive fields
 */
export interface EncryptionConfig {
  algorithm: string;
  key: Buffer;
  ivLength: number;
}

export function createEncryptionConfig(secretKey: string): EncryptionConfig {

  const key = crypto.createHash('sha256').update(secretKey).digest();

  return {
    algorithm: 'aes-256-cbc',
    key,
    ivLength: 16,
  };
}

/**
 * Encrypt sensitive data
 */
export function encryptData(data: string, config: EncryptionConfig): string {
  const iv = crypto.randomBytes(config.ivLength);
  const cipher = crypto.createCipheriv(config.algorithm, config.key, iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');


  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt sensitive data
 */
export function decryptData(encryptedData: string, config: EncryptionConfig): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];

  const decipher = crypto.createDecipheriv(config.algorithm, config.key, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Hash sensitive data (one-way)
 */
export function hashData(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Secrets management helper
 * In production, this should integrate with Kubernetes Secrets or Vault
 */
export interface SecretsManager {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
}

/**
 * Environment-based secrets manager (for development)
 */
export class EnvironmentSecretsManager implements SecretsManager {
  async getSecret(key: string): Promise<string | null> {
    return process.env[key] || null;
  }

  async setSecret(key: string, value: string): Promise<void> {
    process.env[key] = value;
  }

  async deleteSecret(key: string): Promise<void> {
    delete process.env[key];
  }
}

/**
 * TLS configuration helper
 */
export interface TLSConfig {
  enabled: boolean;
  cert?: string;
  key?: string;
  ca?: string;
  rejectUnauthorized?: boolean;
}

export function getTLSConfig(): TLSConfig {
  return {
    enabled: process.env.TLS_ENABLED === 'true',
    cert: process.env.TLS_CERT_PATH,
    key: process.env.TLS_KEY_PATH,
    ca: process.env.TLS_CA_PATH,
    rejectUnauthorized: process.env.TLS_REJECT_UNAUTHORIZED !== 'false',
  };
}
