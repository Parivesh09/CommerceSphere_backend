import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './database';
import { config } from './config';
import { createLogger, ValidationError, UnauthorizedError, ConflictError, NotFoundError } from '@commercesphere/utils';
import { User, JWTPayload } from '@commercesphere/types';
import {
  UserRecord,
  RegisterRequest,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  PasswordResetRequest,
  PasswordResetComplete,
  RefreshTokenRecord,
  PasswordResetTokenRecord,
} from './types';

const logger = createLogger({ serviceName: 'auth-service' });

export class AuthService {
  async register(data: RegisterRequest): Promise<User> {
    const { email, password, name } = data;


    if (!email || !password || !name) {
      throw new ValidationError('Email, password, and name are required');
    }

    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    if (!this.isValidEmail(email)) {
      throw new ValidationError('Invalid email format');
    }


    const existingUser = await this.findUserByEmail(email);
    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }


    const password_hash = await bcrypt.hash(password, config.bcryptRounds);


    const result = await pool.query<UserRecord>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, created_at, updated_at`,
      [email, password_hash, name, 'customer']
    );

    const user = result.rows[0];
    logger.info('User registered successfully', { userId: user.id, email: user.email });

    return this.mapToUser(user);
  }

  async login(data: LoginRequest): Promise<LoginResponse> {
    const { email, password } = data;

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }


    const userRecord = await this.findUserByEmail(email);
    if (!userRecord) {
      throw new UnauthorizedError('Invalid credentials');
    }


    const isPasswordValid = await bcrypt.compare(password, userRecord.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid credentials');
    }


    const accessToken = this.generateAccessToken(userRecord);
    const refreshToken = await this.generateRefreshToken(userRecord.id);

    const user = this.mapToUser(userRecord);

    logger.info('User logged in successfully', { userId: user.id, email: user.email });

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  async refreshAccessToken(data: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    const { refreshToken } = data;

    if (!refreshToken) {
      throw new ValidationError('Refresh token is required');
    }


    const result = await pool.query<RefreshTokenRecord>(
      `SELECT * FROM refresh_tokens WHERE token = $1`,
      [refreshToken]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const tokenRecord = result.rows[0];


    if (new Date(tokenRecord.expires_at) < new Date()) {

      await pool.query(`DELETE FROM refresh_tokens WHERE id = $1`, [tokenRecord.id]);
      throw new UnauthorizedError('Refresh token expired');
    }


    const userResult = await pool.query<UserRecord>(
      `SELECT * FROM users WHERE id = $1`,
      [tokenRecord.user_id]
    );

    if (userResult.rows.length === 0) {
      throw new UnauthorizedError('User not found');
    }

    const user = userResult.rows[0];


    const accessToken = this.generateAccessToken(user);

    logger.info('Access token refreshed', { userId: user.id });

    return { accessToken };
  }

  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) {
      return;
    }


    await pool.query(`DELETE FROM refresh_tokens WHERE token = $1`, [refreshToken]);
    logger.info('User logged out');
  }

  async requestPasswordReset(data: PasswordResetRequest): Promise<void> {
    const { email } = data;

    if (!email) {
      throw new ValidationError('Email is required');
    }


    const user = await this.findUserByEmail(email);
    if (!user) {

      logger.info('Password reset requested for non-existent email', { email });
      return;
    }


    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour


    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, token, expiresAt]
    );

    logger.info('Password reset token generated', { userId: user.id, email: user.email });



    logger.info('Password reset token (dev only)', { token, email });
  }

  async completePasswordReset(data: PasswordResetComplete): Promise<void> {
    const { token, newPassword } = data;

    if (!token || !newPassword) {
      throw new ValidationError('Token and new password are required');
    }

    if (newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }


    const result = await pool.query<PasswordResetTokenRecord>(
      `SELECT * FROM password_reset_tokens WHERE token = $1 AND used = FALSE`,
      [token]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Invalid or expired reset token');
    }

    const resetToken = result.rows[0];


    if (new Date(resetToken.expires_at) < new Date()) {
      throw new UnauthorizedError('Reset token expired');
    }


    const password_hash = await bcrypt.hash(newPassword, config.bcryptRounds);


    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [password_hash, resetToken.user_id]
      );

      await client.query(
        `UPDATE password_reset_tokens SET used = TRUE WHERE id = $1`,
        [resetToken.id]
      );

      await client.query('COMMIT');

      logger.info('Password reset completed', { userId: resetToken.user_id });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserById(userId: string): Promise<User> {
    const result = await pool.query<UserRecord>(
      `SELECT id, email, name, role, created_at, updated_at FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    return this.mapToUser(result.rows[0]);
  }

  verifyAccessToken(token: string): JWTPayload {
    try {
      const payload = jwt.verify(token, config.jwtSecret) as JWTPayload;
      return payload;
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }

  private async findUserByEmail(email: string): Promise<UserRecord | null> {
    const result = await pool.query<UserRecord>(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  private generateAccessToken(user: UserRecord): string {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtAccessExpiry,
    } as jwt.SignOptions);
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, token, expiresAt]
    );

    return token;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private mapToUser(userRecord: UserRecord): User {
    return {
      id: userRecord.id,
      email: userRecord.email,
      name: userRecord.name,
      role: userRecord.role as 'customer' | 'admin' | 'moderator',
      createdAt: new Date(userRecord.created_at),
      updatedAt: new Date(userRecord.updated_at),
    };
  }
}
