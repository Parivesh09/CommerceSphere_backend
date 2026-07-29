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
  UpdateProfileRequest,
  ChangePasswordRequest,
  AddressRecord,
  CreateAddressRequest,
  UpdateAddressRequest,
} from './types';

const logger = createLogger({ serviceName: 'auth-service' });

export class AuthService {
  async register(data: RegisterRequest): Promise<User> {
    const { email, password, name, role } = data;


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


    const userRole = (role === 'seller') ? 'seller' : 'customer';
    const result = await pool.query<UserRecord>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, created_at, updated_at`,
      [email, password_hash, name, userRole]
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
      `SELECT id, email, name, role, avatar_url, phone, created_at, updated_at FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    return this.mapToUser(result.rows[0]);
  }

  async updateProfile(userId: string, data: UpdateProfileRequest): Promise<User> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.email !== undefined) {
      const existing = await this.findUserByEmail(data.email);
      if (existing && existing.id !== userId) {
        throw new ConflictError('Email already in use');
      }
      fields.push(`email = $${paramIndex++}`);
      values.push(data.email);
    }
    if (data.phone !== undefined) {
      fields.push(`phone = $${paramIndex++}`);
      values.push(data.phone);
    }

    if (fields.length === 0) {
      throw new ValidationError('No fields to update');
    }

    fields.push(`updated_at = NOW()`);
    values.push(userId);

    const result = await pool.query<UserRecord>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, email, name, role, avatar_url, phone, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    logger.info('Profile updated', { userId });
    return this.mapToUser(result.rows[0]);
  }

  async changePassword(userId: string, data: ChangePasswordRequest): Promise<void> {
    const { currentPassword, newPassword } = data;

    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password are required');
    }

    if (newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters long');
    }

    const result = await pool.query<UserRecord>(
      `SELECT * FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const password_hash = await bcrypt.hash(newPassword, config.bcryptRounds);

    await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [password_hash, userId]
    );

    logger.info('Password changed', { userId });
  }

  async updateAvatar(userId: string, avatarUrl: string): Promise<User> {
    const result = await pool.query<UserRecord>(
      `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, email, name, role, avatar_url, phone, created_at, updated_at`,
      [avatarUrl, userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    logger.info('Avatar updated', { userId });
    return this.mapToUser(result.rows[0]);
  }

  async getAddresses(userId: string): Promise<AddressRecord[]> {
    const result = await pool.query<AddressRecord>(
      `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );

    return result.rows;
  }

  async createAddress(userId: string, data: CreateAddressRequest): Promise<AddressRecord> {
    const { label, street, city, state, postalCode, country, phone } = data;

    const existingCount = await pool.query(
      `SELECT COUNT(*) FROM addresses WHERE user_id = $1`,
      [userId]
    );
    const isDefault = parseInt(existingCount.rows[0].count, 10) === 0;

    const result = await pool.query<AddressRecord>(
      `INSERT INTO addresses (user_id, label, street, city, state, postal_code, country, phone, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, label || 'Home', street, city, state, postalCode, country, phone || null, isDefault]
    );

    logger.info('Address created', { userId, addressId: result.rows[0].id });
    return result.rows[0];
  }

  async updateAddress(addressId: string, userId: string, data: UpdateAddressRequest): Promise<AddressRecord> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.label !== undefined) {
      fields.push(`label = $${paramIndex++}`);
      values.push(data.label);
    }
    if (data.street !== undefined) {
      fields.push(`street = $${paramIndex++}`);
      values.push(data.street);
    }
    if (data.city !== undefined) {
      fields.push(`city = $${paramIndex++}`);
      values.push(data.city);
    }
    if (data.state !== undefined) {
      fields.push(`state = $${paramIndex++}`);
      values.push(data.state);
    }
    if (data.postalCode !== undefined) {
      fields.push(`postal_code = $${paramIndex++}`);
      values.push(data.postalCode);
    }
    if (data.country !== undefined) {
      fields.push(`country = $${paramIndex++}`);
      values.push(data.country);
    }
    if (data.phone !== undefined) {
      fields.push(`phone = $${paramIndex++}`);
      values.push(data.phone);
    }

    if (fields.length === 0) {
      throw new ValidationError('No fields to update');
    }

    fields.push(`updated_at = NOW()`);
    values.push(addressId);
    values.push(userId);

    const result = await pool.query<AddressRecord>(
      `UPDATE addresses SET ${fields.join(', ')}
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Address');
    }

    logger.info('Address updated', { addressId, userId });
    return result.rows[0];
  }

  async deleteAddress(addressId: string, userId: string): Promise<void> {
    const result = await pool.query(
      `DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING is_default`,
      [addressId, userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Address');
    }

    const wasDefault = result.rows[0].is_default;
    if (wasDefault) {
      const next = await pool.query<AddressRecord>(
        `SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (next.rows.length > 0) {
        await pool.query(
          `UPDATE addresses SET is_default = TRUE WHERE id = $1`,
          [next.rows[0].id]
        );
      }
    }

    logger.info('Address deleted', { addressId, userId });
  }

  async setDefaultAddress(addressId: string, userId: string): Promise<AddressRecord> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE addresses SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );

      const result = await client.query<AddressRecord>(
        `UPDATE addresses SET is_default = TRUE, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [addressId, userId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new NotFoundError('Address');
      }

      await client.query('COMMIT');
      logger.info('Default address set', { addressId, userId });
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
      avatarUrl: userRecord.avatar_url || undefined,
      phone: userRecord.phone || undefined,
      createdAt: new Date(userRecord.created_at),
      updatedAt: new Date(userRecord.updated_at),
    };
  }
}
