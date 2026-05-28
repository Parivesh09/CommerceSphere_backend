import { NotificationType, NotificationTemplate, NotificationContext } from './types';

export const notificationTemplates: Record<NotificationType, NotificationTemplate> = {
  ORDER_CREATED: {
    email: {
      subject: 'Order Confirmation - Order #{{orderId}}',
      body: `
        <h2>Thank you for your order!</h2>
        <p>Your order #{{orderId}} has been confirmed and is being processed.</p>
        <p><strong>Order Total:</strong> $\{{amount}}</p>
        <p>We'll send you another email when your order ships.</p>
        <p>Thank you for shopping with CommerceSphere!</p>
      `,
    },
    sms: 'Your order #{{orderId}} has been confirmed. Total: ${{amount}}. Thank you for shopping with CommerceSphere!',
    push: {
      title: 'Order Confirmed',
      body: 'Your order #{{orderId}} has been confirmed. Total: ${{amount}}',
    },
  },
  
  PAYMENT_SUCCESS: {
    email: {
      subject: 'Payment Received - Order #{{orderId}}',
      body: `
        <h2>Payment Successful</h2>
        <p>We've received your payment for order #{{orderId}}.</p>
        <p><strong>Amount Paid:</strong> $\{{amount}}</p>
        <p>Your order is now being prepared for shipment.</p>
      `,
    },
    sms: 'Payment of ${{amount}} received for order #{{orderId}}. Your order is being prepared for shipment.',
    push: {
      title: 'Payment Successful',
      body: 'Payment of ${{amount}} received for order #{{orderId}}',
    },
  },
  
  ORDER_SHIPPED: {
    email: {
      subject: 'Your Order Has Shipped - Order #{{orderId}}',
      body: `
        <h2>Your Order is On Its Way!</h2>
        <p>Great news! Your order #{{orderId}} has been shipped.</p>
        <p><strong>Tracking Number:</strong> {{trackingNumber}}</p>
        <p>You can track your package using the tracking number above.</p>
        <p>Expected delivery: 3-5 business days</p>
      `,
    },
    sms: 'Your order #{{orderId}} has shipped! Tracking: {{trackingNumber}}',
    push: {
      title: 'Order Shipped',
      body: 'Your order #{{orderId}} is on its way! Track: {{trackingNumber}}',
    },
  },
  
  ORDER_DELIVERED: {
    email: {
      subject: 'Order Delivered - Order #{{orderId}}',
      body: `
        <h2>Your Order Has Been Delivered</h2>
        <p>Your order #{{orderId}} has been successfully delivered.</p>
        <p>We hope you enjoy your purchase!</p>
        <p>If you have any questions or concerns, please don't hesitate to contact us.</p>
      `,
    },
    sms: 'Your order #{{orderId}} has been delivered. Enjoy your purchase!',
    push: {
      title: 'Order Delivered',
      body: 'Your order #{{orderId}} has been delivered',
    },
  },
  
  ORDER_CANCELLED: {
    email: {
      subject: 'Order Cancelled - Order #{{orderId}}',
      body: `
        <h2>Order Cancellation Confirmation</h2>
        <p>Your order #{{orderId}} has been cancelled as requested.</p>
        <p>If you were charged, a refund will be processed within 5-7 business days.</p>
        <p>If you have any questions, please contact our support team.</p>
      `,
    },
    sms: 'Your order #{{orderId}} has been cancelled. Refund will be processed within 5-7 business days.',
    push: {
      title: 'Order Cancelled',
      body: 'Your order #{{orderId}} has been cancelled',
    },
  },
  
  PASSWORD_RESET: {
    email: {
      subject: 'Password Reset Request',
      body: `
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your password.</p>
        <p>Use the following token to reset your password: <strong>{{resetToken}}</strong></p>
        <p>This token will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    },
    sms: 'Your password reset token: {{resetToken}}. Expires in 1 hour.',
    push: {
      title: 'Password Reset',
      body: 'Password reset requested. Check your email for instructions.',
    },
  },
};

export function renderTemplate(
  template: string,
  context: NotificationContext
): string {
  let rendered = template;
  
  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{{${key}}}`;
    rendered = rendered.replace(new RegExp(placeholder, 'g'), String(value));
  }
  
  return rendered;
}
