# Auth Service

Authentication and authorization microservice for CommerceSphere platform.

## Features

- User registration with bcrypt password hashing (cost factor 12)
- JWT-based authentication (access + refresh tokens)
- Token refresh mechanism
- Password reset flow
- User profile endpoint

## API Endpoints

### POST /auth/register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "name": "John Doe"
}
```

**Response:** `201 Created`
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "customer",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### POST /auth/login
Authenticate user and receive tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:** `200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "uuid-refresh-token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "customer",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### POST /auth/refresh
Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "uuid-refresh-token"
}
```

**Response:** `200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### POST /auth/logout
Invalidate refresh token.

**Request Body:**
```json
{
  "refreshToken": "uuid-refresh-token"
}
```

**Response:** `200 OK`
```json
{
  "message": "Logged out successfully"
}
```

### POST /auth/password-reset-request
Request password reset token.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:** `200 OK`
```json
{
  "message": "Password reset email sent"
}
```

### POST /auth/password-reset
Complete password reset with token.

**Request Body:**
```json
{
  "token": "reset-token-uuid",
  "newPassword": "newsecurepassword123"
}
```

**Response:** `200 OK`
```json
{
  "message": "Password reset successfully"
}
```

### GET /auth/me
Get current user profile (requires authentication).

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "customer",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
PORT=3001
JWT_SECRET=your-secret-key-change-in-production
JWT_ACCESS_EXPIRY=1h
JWT_REFRESH_EXPIRY=7d
BCRYPT_ROUNDS=12

DB_HOST=localhost
DB_PORT=5432
DB_NAME=auth_db
DB_USER=postgres
DB_PASSWORD=postgres

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

## Database Schema

The service automatically creates the following tables on startup:

- `users` - User accounts with encrypted passwords
- `refresh_tokens` - Active refresh tokens
- `password_reset_tokens` - Password reset tokens

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev

# Run in production mode
npm start
```

## Security Features

- Passwords hashed with bcrypt (cost factor 12)
- JWT tokens with configurable expiration
- Refresh token rotation
- Password reset tokens with expiration
- Input validation and sanitization
- SQL injection prevention (parameterized queries)

## Token Lifetimes

- **Access Token:** 1 hour (configurable)
- **Refresh Token:** 7 days (configurable)
- **Password Reset Token:** 1 hour

## Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "code": "ValidationError",
    "message": "Email and password are required",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "path": "/auth/login"
  }
}
```

## Requirements Implemented

- ✅ 1.1: User registration with encrypted credentials
- ✅ 1.2: Login with JWT token generation
- ✅ 1.3: Token refresh mechanism
- ✅ 1.4: Password reset flow
- ✅ 19.1: Bcrypt password hashing with cost factor 12
