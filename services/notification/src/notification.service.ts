import { v4 as uuidv4 } from 'uuid';
import { pool } from './database';
import { createLogger } from '@commercesphere/utils';
import {
  Notification,
  NotificationPreferences,
  NotificationType,
  NotificationChannel,
  NotificationContext,
} from './types';
import { notificationTemplates, renderTemplate } from './templates';
import { sendEmail } from './channels/email';
import { sendSms } from './channels/sms';
import { sendPushNotification } from './channels/push';

const logger = createLogger({ serviceName: 'notification-service' });

const MAX_RETRIES = 3;
const RETRY_DELAYS = [60000, 300000, 900000]; // 1 min, 5 min, 15 min

export class NotificationService {
  async createNotification(
    userId: string,
    type: NotificationType,
    context: NotificationContext
  ): Promise<void> {
    try {

      const preferences = await this.getOrCreateUserPreferences(userId);
      

      const template = notificationTemplates[type];
      
      if (!template) {
        logger.error('No template found for notification type', { type });
        return;
      }
      

      const notifications: Promise<void>[] = [];
      
      if (preferences.emailEnabled && template.email) {
        notifications.push(
          this.sendNotification(userId, type, 'email', context, template.email.subject, template.email.body)
        );
      }
      
      if (preferences.smsEnabled && template.sms) {
        notifications.push(
          this.sendNotification(userId, type, 'sms', context, undefined, template.sms)
        );
      }
      
      if (preferences.pushEnabled && template.push) {
        notifications.push(
          this.sendNotification(userId, type, 'push', context, template.push.title, template.push.body)
        );
      }
      
      await Promise.allSettled(notifications);
      
      logger.info('Notifications created', {
        userId,
        type,
        channels: [
          preferences.emailEnabled && 'email',
          preferences.smsEnabled && 'sms',
          preferences.pushEnabled && 'push',
        ].filter(Boolean),
      });
    } catch (error) {
      logger.error('Failed to create notifications', {
        userId,
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
  
  private async sendNotification(
    userId: string,
    type: NotificationType,
    channel: NotificationChannel,
    context: NotificationContext,
    subject: string | undefined,
    content: string
  ): Promise<void> {
    const notificationId = uuidv4();
    
    try {

      const renderedSubject = subject ? renderTemplate(subject, context) : undefined;
      const renderedContent = renderTemplate(content, context);
      

      await pool.query(
        `INSERT INTO notifications (id, user_id, type, channel, subject, content, status, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [notificationId, userId, type, channel, renderedSubject, renderedContent, 'PENDING', 0]
      );
      

      await this.sendWithRetry(notificationId, userId, channel, renderedSubject, renderedContent, context);
      
    } catch (error) {
      logger.error('Failed to send notification', {
        notificationId,
        userId,
        type,
        channel,
        error: error instanceof Error ? error.message : String(error),
      });
      

      await pool.query(
        `UPDATE notifications SET status = $1 WHERE id = $2`,
        ['FAILED', notificationId]
      );
    }
  }
  
  private async sendWithRetry(
    notificationId: string,
    userId: string,
    channel: NotificationChannel,
    subject: string | undefined,
    content: string,
    context: NotificationContext
  ): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {

        const userEmail = `user-${userId}@example.com`; // Placeholder
        const userPhone = `+1234567890`; // Placeholder
        const userPushToken = `push-token-${userId}`; // Placeholder
        

        switch (channel) {
          case 'email':
            if (subject) {
              await sendEmail({
                to: userEmail,
                subject,
                html: content,
              });
            }
            break;
            
          case 'sms':
            await sendSms({
              to: userPhone,
              body: content,
            });
            break;
            
          case 'push':
            if (subject) {
              await sendPushNotification({
                token: userPushToken,
                title: subject,
                body: content,
                data: {
                  notificationId,
                  ...Object.fromEntries(
                    Object.entries(context).map(([k, v]) => [k, String(v)])
                  ),
                },
              });
            }
            break;
        }
        

        await pool.query(
          `UPDATE notifications 
           SET status = $1, sent_at = NOW(), retry_count = $2 
           WHERE id = $3`,
          ['SENT', attempt, notificationId]
        );
        
        logger.info('Notification sent successfully', {
          notificationId,
          userId,
          channel,
          attempt,
        });
        
        return; // Success
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        logger.error('Failed to send notification', {
          notificationId,
          userId,
          channel,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES + 1,
          error: lastError.message,
        });
        

        await pool.query(
          `UPDATE notifications SET retry_count = $1 WHERE id = $2`,
          [attempt + 1, notificationId]
        );
        

        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt] || 900000;
          logger.info('Retrying notification', {
            notificationId,
            nextAttempt: attempt + 2,
            delayMs: delay,
          });
          await this.sleep(delay);
        }
      }
    }
    

    await pool.query(
      `UPDATE notifications SET status = $1 WHERE id = $2`,
      ['FAILED', notificationId]
    );
    
    logger.error('Notification failed after all retries', {
      notificationId,
      userId,
      channel,
      error: lastError?.message,
    });
    
    throw lastError || new Error('Failed to send notification');
  }
  
  async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    return this.getOrCreateUserPreferences(userId);
  }
  
  private async getOrCreateUserPreferences(userId: string): Promise<NotificationPreferences> {
    const result = await pool.query(
      `SELECT * FROM notification_preferences WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {

      const defaultPrefs = {
        id: uuidv4(),
        userId,
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      await pool.query(
        `INSERT INTO notification_preferences (id, user_id, email_enabled, sms_enabled, push_enabled)
         VALUES ($1, $2, $3, $4, $5)`,
        [defaultPrefs.id, userId, defaultPrefs.emailEnabled, defaultPrefs.smsEnabled, defaultPrefs.pushEnabled]
      );
      
      return defaultPrefs;
    }
    
    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      emailEnabled: row.email_enabled,
      smsEnabled: row.sms_enabled,
      pushEnabled: row.push_enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  
  async updateUserPreferences(
    userId: string,
    preferences: Partial<Pick<NotificationPreferences, 'emailEnabled' | 'smsEnabled' | 'pushEnabled'>>
  ): Promise<NotificationPreferences> {
    await this.getOrCreateUserPreferences(userId);
    
    const updates: string[] = [];
    const values: (boolean | string)[] = [];
    let paramIndex = 1;
    
    if (preferences.emailEnabled !== undefined) {
      updates.push(`email_enabled = $${paramIndex++}`);
      values.push(preferences.emailEnabled);
    }
    
    if (preferences.smsEnabled !== undefined) {
      updates.push(`sms_enabled = $${paramIndex++}`);
      values.push(preferences.smsEnabled);
    }
    
    if (preferences.pushEnabled !== undefined) {
      updates.push(`push_enabled = $${paramIndex++}`);
      values.push(preferences.pushEnabled);
    }
    
    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(userId);
      
      await pool.query(
        `UPDATE notification_preferences 
         SET ${updates.join(', ')} 
         WHERE user_id = $${paramIndex}`,
        values
      );
    }
    
    return this.getUserPreferences(userId);
  }
  
  async getNotificationHistory(userId: string, limit: number = 50): Promise<Notification[]> {
    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      channel: row.channel,
      subject: row.subject,
      content: row.content,
      status: row.status,
      retryCount: row.retry_count,
      sentAt: row.sent_at,
      createdAt: row.created_at,
    }));
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const notificationService = new NotificationService();
