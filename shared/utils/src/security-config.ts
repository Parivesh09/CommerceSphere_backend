/**
 * Security Configuration
 * Centralized security settings for all microservices
 */

export interface SecurityConfig {

  cors: {
    enabled: boolean;
    allowedOrigins: string[];
    allowedMethods: string[];
    allowedHeaders: string[];
    credentials: boolean;
  };


  csrf: {
    enabled: boolean;
    cookieName: string;
    headerName: string;
    excludePaths: string[];
  };


  rateLimit: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
  };


  validation: {
    enabled: boolean;
    sanitizeInput: boolean;
    maxBodySize: string;
  };


  encryption: {
    enabled: boolean;
    algorithm: string;
    secretKey: string;
  };


  tls: {
    enabled: boolean;
    certPath?: string;
    keyPath?: string;
    caPath?: string;
    rejectUnauthorized: boolean;
  };


  headers: {
    enabled: boolean;
    hsts: boolean;
    noSniff: boolean;
    xssProtection: boolean;
    frameOptions: string;
  };


  secrets: {
    provider: 'env' | 'kubernetes' | 'vault';
    vaultUrl?: string;
    kubernetesNamespace?: string;
  };
}

/**
 * Get security configuration from environment variables
 */
export function getSecurityConfig(): SecurityConfig {
  return {
    cors: {
      enabled: process.env.CORS_ENABLED !== 'false',
      allowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      allowedMethods: process.env.CORS_ALLOWED_METHODS?.split(',') || [
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'PATCH',
        'OPTIONS',
      ],
      allowedHeaders: process.env.CORS_ALLOWED_HEADERS?.split(',') || [
        'Content-Type',
        'Authorization',
        'X-Correlation-ID',
        'X-CSRF-Token',
      ],
      credentials: process.env.CORS_CREDENTIALS !== 'false',
    },

    csrf: {
      enabled: process.env.CSRF_ENABLED === 'true',
      cookieName: process.env.CSRF_COOKIE_NAME || 'csrf-token',
      headerName: process.env.CSRF_HEADER_NAME || 'x-csrf-token',
      excludePaths: process.env.CSRF_EXCLUDE_PATHS?.split(',') || ['/health', '/ready', '/metrics'],
    },

    rateLimit: {
      enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    },

    validation: {
      enabled: process.env.INPUT_VALIDATION_ENABLED !== 'false',
      sanitizeInput: process.env.SANITIZE_INPUT !== 'false',
      maxBodySize: process.env.MAX_BODY_SIZE || '10mb',
    },

    encryption: {
      enabled: process.env.ENCRYPTION_ENABLED === 'true',
      algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-cbc',
      secretKey: process.env.ENCRYPTION_SECRET_KEY || '',
    },

    tls: {
      enabled: process.env.TLS_ENABLED === 'true',
      certPath: process.env.TLS_CERT_PATH,
      keyPath: process.env.TLS_KEY_PATH,
      caPath: process.env.TLS_CA_PATH,
      rejectUnauthorized: process.env.TLS_REJECT_UNAUTHORIZED !== 'false',
    },

    headers: {
      enabled: process.env.SECURITY_HEADERS_ENABLED !== 'false',
      hsts: process.env.HSTS_ENABLED !== 'false',
      noSniff: process.env.NO_SNIFF_ENABLED !== 'false',
      xssProtection: process.env.XSS_PROTECTION_ENABLED !== 'false',
      frameOptions: process.env.FRAME_OPTIONS || 'DENY',
    },

    secrets: {
      provider: (process.env.SECRETS_PROVIDER as 'env' | 'kubernetes' | 'vault') || 'env',
      vaultUrl: process.env.VAULT_URL,
      kubernetesNamespace: process.env.KUBERNETES_NAMESPACE || 'default',
    },
  };
}

/**
 * Validate security configuration
 */
export function validateSecurityConfig(config: SecurityConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];


  if (config.encryption.enabled && !config.encryption.secretKey) {
    errors.push('Encryption is enabled but ENCRYPTION_SECRET_KEY is not set');
  }


  if (config.tls.enabled) {
    if (!config.tls.certPath) {
      errors.push('TLS is enabled but TLS_CERT_PATH is not set');
    }
    if (!config.tls.keyPath) {
      errors.push('TLS is enabled but TLS_KEY_PATH is not set');
    }
  }


  if (config.secrets.provider === 'vault' && !config.secrets.vaultUrl) {
    errors.push('Vault secrets provider is configured but VAULT_URL is not set');
  }


  if (config.cors.enabled && config.cors.allowedOrigins.length === 0) {
    errors.push('CORS is enabled but no allowed origins are configured');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Default security configuration for development
 */
export const developmentSecurityConfig: SecurityConfig = {
  cors: {
    enabled: true,
    allowedOrigins: ['http://localhost:3000', 'http://localhost:3001'],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-CSRF-Token'],
    credentials: true,
  },
  csrf: {
    enabled: false, // Disabled in development for easier testing
    cookieName: 'csrf-token',
    headerName: 'x-csrf-token',
    excludePaths: ['/health', '/ready', '/metrics'],
  },
  rateLimit: {
    enabled: false, // Disabled in development
    windowMs: 60000,
    maxRequests: 1000,
  },
  validation: {
    enabled: true,
    sanitizeInput: true,
    maxBodySize: '10mb',
  },
  encryption: {
    enabled: false, // Disabled in development
    algorithm: 'aes-256-cbc',
    secretKey: 'dev-secret-key-change-in-production',
  },
  tls: {
    enabled: false, // Disabled in development
    rejectUnauthorized: false,
  },
  headers: {
    enabled: true,
    hsts: false, // Disabled in development (no HTTPS)
    noSniff: true,
    xssProtection: true,
    frameOptions: 'DENY',
  },
  secrets: {
    provider: 'env',
  },
};

/**
 * Default security configuration for production
 */
export const productionSecurityConfig: SecurityConfig = {
  cors: {
    enabled: true,
    allowedOrigins: [], // Must be configured via environment variables
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-CSRF-Token'],
    credentials: true,
  },
  csrf: {
    enabled: true,
    cookieName: 'csrf-token',
    headerName: 'x-csrf-token',
    excludePaths: ['/health', '/ready', '/metrics'],
  },
  rateLimit: {
    enabled: true,
    windowMs: 60000, // 1 minute
    maxRequests: 100,
  },
  validation: {
    enabled: true,
    sanitizeInput: true,
    maxBodySize: '10mb',
  },
  encryption: {
    enabled: true,
    algorithm: 'aes-256-cbc',
    secretKey: '', // Must be configured via environment variables
  },
  tls: {
    enabled: true,
    rejectUnauthorized: true,
  },
  headers: {
    enabled: true,
    hsts: true,
    noSniff: true,
    xssProtection: true,
    frameOptions: 'DENY',
  },
  secrets: {
    provider: 'kubernetes', // Use Kubernetes Secrets in production
  },
};
