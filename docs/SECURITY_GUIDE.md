# Security Implementation Guide

This guide covers the security controls implemented across the CommerceSphere microservices platform.

## Overview

The platform implements multiple layers of security controls to protect against common vulnerabilities and ensure data protection:

1. **Input Validation & Sanitization** - Prevents SQL injection and XSS attacks
2. **Authentication & Authorization** - JWT-based authentication with role-based access control
3. **CORS Configuration** - Controls cross-origin resource sharing
4. **CSRF Protection** - Prevents cross-site request forgery attacks
5. **Rate Limiting** - Protects against abuse and DDoS attacks
6. **TLS/SSL Encryption** - Secures data in transit
7. **Data Encryption at Rest** - Protects sensitive data in storage
8. **Security Headers** - Adds defense-in-depth protections
9. **Secrets Management** - Secure handling of sensitive configuration

## 1. Input Validation & Sanitization

### SQL Injection Prevention

All database queries use **parameterized queries** to prevent SQL injection:

```typescript

const result = await pool.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);


const result = await pool.query(
  `SELECT * FROM users WHERE email = '${email}'`
);
```

### XSS Protection

Input sanitization is applied to all user-provided data:

```typescript
import { validateRequest, sanitizeString } from '@commercesphere/utils';


router.post('/products', 
  validateRequest({
    body: [
      { field: 'title', type: 'string', required: true, sanitize: true, maxLength: 500 },
      { field: 'description', type: 'string', sanitize: true },
      { field: 'price', type: 'number', required: true, min: 0 },
    ]
  }),
  async (req, res) => {

    const product = await createProduct(req.body);
    res.json(product);
  }
);
```

### Validation Rules

Available validation types:
- `string` - String validation with min/max length
- `number` - Numeric validation with min/max values
- `email` - Email format validation
- `uuid` - UUID format validation
- `boolean` - Boolean type validation
- `array` - Array type validation
- `object` - Object type validation

## 2. Authentication & Authorization

### JWT Token Authentication

Services use JWT tokens for authentication:

```typescript
import { authenticate } from '@commercesphere/utils';


router.get('/orders', authenticate, async (req, res) => {
  const userId = req.user.sub; // User ID from JWT payload
  const orders = await getOrdersByUser(userId);
  res.json(orders);
});
```

### Password Security

Passwords are hashed using bcrypt with cost factor 12:

```typescript
import bcrypt from 'bcrypt';


const password_hash = await bcrypt.hash(password, 12);


const isValid = await bcrypt.compare(password, user.password_hash);
```

### Token Structure

JWT tokens contain:
```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "role": "customer",
  "iat": 1234567890,
  "exp": 1234571490
}
```

Token lifetimes:
- **Access Token**: 1 hour
- **Refresh Token**: 7 days

## 3. CORS Configuration

Configure CORS to control which origins can access your API:

```typescript
import { corsMiddleware } from '@commercesphere/utils';

app.use(corsMiddleware({
  allowedOrigins: [
    'https://app.commercesphere.com',
    'https://admin.commercesphere.com'
  ],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));
```

### Environment Configuration

```bash
# .env
CORS_ENABLED=true
CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
CORS_CREDENTIALS=true
```

## 4. CSRF Protection

CSRF protection uses the double-submit cookie pattern:

```typescript
import { csrfProtection, generateCSRFToken } from '@commercesphere/utils';


app.use(csrfProtection({
  cookieName: 'csrf-token',
  headerName: 'x-csrf-token',
  excludePaths: ['/health', '/metrics'],
  excludeMethods: ['GET', 'HEAD', 'OPTIONS']
}));


app.get('/csrf-token', (req, res) => {
  const token = generateCSRFToken();
  res.cookie('csrf-token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict'
  });
  res.json({ token });
});
```

### Client-Side Usage

```javascript

const response = await fetch('/csrf-token');
const { token } = await response.json();


await fetch('/api/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': token
  },
  credentials: 'include',
  body: JSON.stringify(orderData)
});
```

## 5. Rate Limiting

### API Gateway Rate Limiting

The API Gateway implements rate limiting using Redis:

```typescript
import { rateLimitMiddleware } from '@commercesphere/utils';

app.use(rateLimitMiddleware({
  windowMs: 60000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  keyGenerator: (req) => req.user?.sub || req.ip
}));
```

### Configuration

```bash
# .env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Response Headers

Rate limit information is included in response headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

## 6. TLS/SSL Encryption

### Inter-Service Communication

All inter-service communication should use TLS:

```typescript
import https from 'https';
import fs from 'fs';
import { getTLSConfig } from '@commercesphere/utils';

const tlsConfig = getTLSConfig();

if (tlsConfig.enabled) {
  const server = https.createServer({
    cert: fs.readFileSync(tlsConfig.cert!),
    key: fs.readFileSync(tlsConfig.key!),
    ca: tlsConfig.ca ? fs.readFileSync(tlsConfig.ca) : undefined
  }, app);
  
  server.listen(port);
} else {
  app.listen(port);
}
```

### Configuration

```bash
# .env
TLS_ENABLED=true
TLS_CERT_PATH=/path/to/cert.pem
TLS_KEY_PATH=/path/to/key.pem
TLS_CA_PATH=/path/to/ca.pem
TLS_REJECT_UNAUTHORIZED=true
```

### Kubernetes TLS

In Kubernetes, use cert-manager for automatic certificate management:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: service-tls
spec:
  secretName: service-tls-secret
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - service.commercesphere.com
```

## 7. Data Encryption at Rest

### Encrypting Sensitive Fields

Use encryption for sensitive data like payment information:

```typescript
import { createEncryptionConfig, encryptData, decryptData } from '@commercesphere/utils';

const encryptionConfig = createEncryptionConfig(process.env.ENCRYPTION_SECRET_KEY!);


const encryptedCardNumber = encryptData(cardNumber, encryptionConfig);
await pool.query(
  'INSERT INTO payment_methods (user_id, card_number_encrypted) VALUES ($1, $2)',
  [userId, encryptedCardNumber]
);


const result = await pool.query(
  'SELECT card_number_encrypted FROM payment_methods WHERE id = $1',
  [paymentMethodId]
);
const cardNumber = decryptData(result.rows[0].card_number_encrypted, encryptionConfig);
```

### Configuration

```bash
# .env
ENCRYPTION_ENABLED=true
ENCRYPTION_SECRET_KEY=your-secret-key-min-32-chars
ENCRYPTION_ALGORITHM=aes-256-cbc
```

### Database-Level Encryption

For PostgreSQL, enable transparent data encryption (TDE):

```sql
-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create encrypted column
ALTER TABLE users 
ADD COLUMN ssn_encrypted BYTEA;

-- Encrypt data
UPDATE users 
SET ssn_encrypted = pgp_sym_encrypt(ssn, 'encryption-key')
WHERE ssn IS NOT NULL;
```

## 8. Security Headers

Security headers are automatically added to all responses:

```typescript
import { securityHeadersMiddleware } from '@commercesphere/utils';

app.use(securityHeadersMiddleware());
```

### Headers Applied

- **X-Frame-Options**: `DENY` - Prevents clickjacking
- **X-Content-Type-Options**: `nosniff` - Prevents MIME sniffing
- **X-XSS-Protection**: `1; mode=block` - Enables XSS filter
- **Strict-Transport-Security**: `max-age=31536000; includeSubDomains` - Enforces HTTPS
- **Content-Security-Policy**: Restricts resource loading
- **Referrer-Policy**: `strict-origin-when-cross-origin` - Controls referrer information
- **Permissions-Policy**: Restricts browser features

## 9. Secrets Management

### Environment Variables (Development)

```bash
# .env
DATABASE_URL=postgresql://user:pass@localhost:5432/db
JWT_SECRET=your-jwt-secret
STRIPE_SECRET_KEY=sk_test_...
```

### Kubernetes Secrets (Production)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: service-secrets
type: Opaque
stringData:
  database-url: postgresql://user:pass@db:5432/db
  jwt-secret: your-jwt-secret
  stripe-secret-key: sk_live_...
```

```yaml
# Deployment using secrets
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
spec:
  template:
    spec:
      containers:
      - name: auth-service
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: service-secrets
              key: database-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: service-secrets
              key: jwt-secret
```

### HashiCorp Vault (Enterprise)

```typescript
import { SecretsManager } from '@commercesphere/utils';


class VaultSecretsManager implements SecretsManager {
  async getSecret(key: string): Promise<string | null> {
    const response = await fetch(`${vaultUrl}/v1/secret/data/${key}`, {
      headers: {
        'X-Vault-Token': vaultToken
      }
    });
    const data = await response.json();
    return data.data.data.value;
  }
  

}
```

## Security Checklist

### Development
- [ ] Use parameterized queries for all database operations
- [ ] Validate and sanitize all user input
- [ ] Hash passwords with bcrypt (cost factor ≥ 12)
- [ ] Use JWT tokens for authentication
- [ ] Enable CORS with appropriate origins
- [ ] Add security headers to responses
- [ ] Never commit secrets to version control
- [ ] Use environment variables for configuration

### Production
- [ ] Enable TLS/SSL for all communications
- [ ] Enable CSRF protection
- [ ] Enable rate limiting
- [ ] Encrypt sensitive data at rest
- [ ] Use Kubernetes Secrets or Vault for secrets management
- [ ] Enable HSTS header
- [ ] Configure strict CSP policy
- [ ] Set up security monitoring and alerts
- [ ] Perform regular security audits
- [ ] Keep dependencies up to date
- [ ] Enable database encryption
- [ ] Implement audit logging for sensitive operations

## Common Vulnerabilities Prevented

### SQL Injection
✅ **Prevented by**: Parameterized queries, input validation

### XSS (Cross-Site Scripting)
✅ **Prevented by**: Input sanitization, output encoding, CSP headers

### CSRF (Cross-Site Request Forgery)
✅ **Prevented by**: CSRF tokens, SameSite cookies

### Clickjacking
✅ **Prevented by**: X-Frame-Options header

### Man-in-the-Middle
✅ **Prevented by**: TLS/SSL encryption, HSTS header

### Brute Force Attacks
✅ **Prevented by**: Rate limiting, account lockout

### Session Hijacking
✅ **Prevented by**: Secure cookies, short token lifetimes

### Data Breaches
✅ **Prevented by**: Encryption at rest, access controls

## Security Monitoring

### Logging Security Events

```typescript
import { createLogger } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'auth-service' });


logger.warn('Authentication failed', {
  email: email,
  ip: req.ip,
  userAgent: req.get('user-agent')
});


logger.warn('Authorization failed', {
  userId: req.user.sub,
  resource: req.path,
  action: req.method
});
```

### Metrics to Monitor

- Failed authentication attempts
- Rate limit violations
- CSRF token validation failures
- Unusual access patterns
- Database query errors
- Encryption/decryption failures

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
