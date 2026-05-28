export type NotificationType = 
  | 'ORDER_CREATED'
  | 'PAYMENT_SUCCESS'
  | 'ORDER_SHIPPED'
  | 'ORDER_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'PASSWORD_RESET';

export type NotificationChannel = 'email' | 'sms' | 'push';

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  subject?: string;
  content: string;
  status: NotificationStatus;
  retryCount: number;
  sentAt?: Date;
  createdAt: Date;
}

export interface NotificationPreferences {
  id: string;
  userId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationTemplate {
  email?: {
    subject: string;
    body: string;
  };
  sms?: string;
  push?: {
    title: string;
    body: string;
  };
}

export interface NotificationContext {
  orderId?: string;
  amount?: number;
  trackingNumber?: string;
  resetToken?: string;
  [key: string]: any;
}
