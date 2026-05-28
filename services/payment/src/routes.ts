import { Router, Request, Response, NextFunction } from 'express';
import { PaymentService } from './payment.service';
import { PaymentEventPublisher } from './event-publisher';
import { logger, getCorrelationId } from '@commercesphere/utils';
import { 
  CreatePaymentRequest, 
  RefundRequest, 
  StripeWebhookRequest,
  ErrorResponse 
} from './types';

export function createPaymentRoutes(
  paymentService: PaymentService,
  eventPublisher: PaymentEventPublisher
): Router {
  const router = Router();


  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request: CreatePaymentRequest = req.body;


      if (!request.orderId || !request.userId || !request.amount || !request.paymentMethodId) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Missing required fields: orderId, userId, amount, paymentMethodId',
            timestamp: new Date().toISOString(),
            path: req.path,
            correlationId: getCorrelationId(),
          },
        } as ErrorResponse);
      }

      if (request.amount <= 0) {
        return res.status(400).json({
          error: {
            code: 'INVALID_AMOUNT',
            message: 'Amount must be greater than 0',
            timestamp: new Date().toISOString(),
            path: req.path,
            correlationId: getCorrelationId(),
          },
        } as ErrorResponse);
      }

      logger.info('Creating payment', {
        orderId: request.orderId,
        userId: request.userId,
        amount: request.amount,
        correlationId: getCorrelationId(),
      });

      const payment = await paymentService.createPayment(request);
      

      if (payment.status === 'COMPLETED') {
        await eventPublisher.publishPaymentSuccess(payment);
      } else if (payment.status === 'FAILED') {
        await eventPublisher.publishPaymentFailed(
          payment,
          payment.gateway_response?.error || 'Payment processing failed'
        );
      }

      res.status(201).json({
        id: payment.id,
        orderId: payment.order_id,
        userId: payment.user_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        createdAt: payment.created_at,
      });
    } catch (error) {
      next(error);
    }
  });


  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      logger.info('Fetching payment', {
        paymentId: id,
        correlationId: getCorrelationId(),
      });

      const payment = await paymentService.getPaymentById(id);

      if (!payment) {
        return res.status(404).json({
          error: {
            code: 'PAYMENT_NOT_FOUND',
            message: `Payment not found: ${id}`,
            timestamp: new Date().toISOString(),
            path: req.path,
            correlationId: getCorrelationId(),
          },
        } as ErrorResponse);
      }

      res.json({
        id: payment.id,
        orderId: payment.order_id,
        userId: payment.user_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        paymentMethod: payment.payment_method,
        gatewayTransactionId: payment.gateway_transaction_id,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at,
      });
    } catch (error) {
      next(error);
    }
  });


  router.post('/:id/refund', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const request: RefundRequest = req.body;

      logger.info('Creating refund', {
        paymentId: id,
        amount: request.amount,
        reason: request.reason,
        correlationId: getCorrelationId(),
      });

      const payment = await paymentService.getPaymentById(id);

      if (!payment) {
        return res.status(404).json({
          error: {
            code: 'PAYMENT_NOT_FOUND',
            message: `Payment not found: ${id}`,
            timestamp: new Date().toISOString(),
            path: req.path,
            correlationId: getCorrelationId(),
          },
        } as ErrorResponse);
      }

      const refund = await paymentService.createRefund(id, request);

      res.status(201).json({
        id: refund.id,
        paymentId: refund.payment_id,
        amount: refund.amount,
        reason: refund.reason,
        status: refund.status,
        createdAt: refund.created_at,
      });
    } catch (error) {
      next(error);
    }
  });


  router.post(
    '/webhook',
    async (req: StripeWebhookRequest, res: Response, next: NextFunction) => {
      try {
        const signature = req.headers['stripe-signature'] as string;

        if (!signature) {
          return res.status(400).json({
            error: {
              code: 'MISSING_SIGNATURE',
              message: 'Missing Stripe signature header',
              timestamp: new Date().toISOString(),
              path: req.path,
            },
          } as ErrorResponse);
        }


        const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));

        logger.info('Processing Stripe webhook', {
          signature: signature.substring(0, 20) + '...',
        });

        await paymentService.handleStripeWebhook(signature, payload);

        res.json({ received: true });
      } catch (error) {
        logger.error('Webhook processing failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        

        if (error instanceof Error && error.message.includes('signature')) {
          return res.status(400).json({
            error: {
              code: 'INVALID_SIGNATURE',
              message: 'Webhook signature verification failed',
              timestamp: new Date().toISOString(),
              path: req.path,
            },
          } as ErrorResponse);
        }
        
        next(error);
      }
    }
  );

  return router;
}
