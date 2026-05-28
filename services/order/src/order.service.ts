import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './database';
import { CreateOrderRequest, OrderResponse, CancelOrderRequest, ShipOrderRequest, DeliverOrderRequest } from './types';
import { 
  ValidationError, 
  NotFoundError, 
  createLogger,
  ConflictError 
} from '@commercesphere/utils';
import { OrderStatus, PaymentStatus, OrderCreatedEvent, OrderCancelledEvent, Address } from '@commercesphere/types';
import { getKafkaProducer } from '@commercesphere/utils';
import { KAFKA_TOPICS } from '@commercesphere/utils';
import { orderSagaOrchestrator } from './saga';

const logger = createLogger({ serviceName: 'order-service' });

export class OrderService {
  constructor(private db: Pool = pool) {}

  async createOrder(data: CreateOrderRequest): Promise<OrderResponse> {

    if (!data.userId) {
      throw new ValidationError('User ID is required');
    }

    if (!data.items || data.items.length === 0) {
      throw new ValidationError('Order must contain at least one item');
    }

    if (!data.shippingAddress) {
      throw new ValidationError('Shipping address is required');
    }


    for (const item of data.items) {
      if (!item.productId) {
        throw new ValidationError('Product ID is required for all items');
      }
      if (!item.quantity || item.quantity <= 0) {
        throw new ValidationError('Quantity must be greater than 0');
      }
      if (!item.unitPrice || item.unitPrice < 0) {
        throw new ValidationError('Unit price must be non-negative');
      }
    }


    const totalAmount = data.items.reduce((sum, item) => {
      return sum + (item.quantity * item.unitPrice);
    }, 0);

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');


      const orderId = uuidv4();
      const orderResult = await client.query(
        `INSERT INTO orders (id, user_id, status, total_amount, payment_status, shipping_address, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING *`,
        [
          orderId,
          data.userId,
          'CREATED' as OrderStatus,
          totalAmount,
          'PENDING' as PaymentStatus,
          JSON.stringify(data.shippingAddress),
        ]
      );

      const order = orderResult.rows[0];


      const orderItems = [];
      for (const item of data.items) {
        const itemId = uuidv4();
        const subtotal = item.quantity * item.unitPrice;
        
        const itemResult = await client.query(
          `INSERT INTO order_items (id, order_id, product_id, variant_id, quantity, unit_price, subtotal, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           RETURNING *`,
          [
            itemId,
            orderId,
            item.productId,
            item.variantId || null,
            item.quantity,
            item.unitPrice,
            subtotal,
          ]
        );

        orderItems.push(itemResult.rows[0]);
      }


      await client.query(
        `INSERT INTO order_saga_state (id, order_id, current_step, completed_steps, compensation_needed, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [uuidv4(), orderId, 'ORDER_CREATED', JSON.stringify(['ORDER_CREATED']), false]
      );

      await client.query('COMMIT');

      logger.info('Order created successfully', {
        orderId,
        userId: data.userId,
        totalAmount,
        itemCount: orderItems.length,
      });


      try {
        const event: OrderCreatedEvent = {
          id: uuidv4(),
          type: 'order.created',
          aggregateId: orderId,
          payload: {
            orderId,
            userId: data.userId,
            items: data.items,
            totalAmount,
            shippingAddress: data.shippingAddress,
          },
          timestamp: new Date(),
          version: 1,
        };

        const producer = getKafkaProducer();
        await producer.publishEvent(KAFKA_TOPICS.ORDERS, event);

        logger.info('Order created event published', {
          orderId,
          eventId: event.id,
        });
      } catch (error) {
        logger.error('Failed to publish order created event', {
          orderId,
          error: error instanceof Error ? error.message : String(error),
        });


      }

      const orderResponse = this.mapToOrderResponse(order, orderItems);



      setImmediate(async () => {
        try {
          await orderSagaOrchestrator.initiateSaga(orderId, data.items);
        } catch (sagaError) {
          logger.error('Saga initiation failed', {
            orderId,
            error: sagaError instanceof Error ? sagaError.message : String(sagaError),
          });

        }
      });

      return orderResponse;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create order', {
        error: error instanceof Error ? error.message : String(error),
        userId: data.userId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrderById(orderId: string, userId?: string): Promise<OrderResponse> {
    const query = userId
      ? 'SELECT * FROM orders WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM orders WHERE id = $1';
    
    const params = userId ? [orderId, userId] : [orderId];
    
    const orderResult = await this.db.query(query, params);

    if (orderResult.rows.length === 0) {
      throw new NotFoundError('Order');
    }

    const order = orderResult.rows[0];


    const itemsResult = await this.db.query(
      'SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at',
      [orderId]
    );

    return this.mapToOrderResponse(order, itemsResult.rows);
  }

  async getUserOrders(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ orders: OrderResponse[]; total: number; page: number; limit: number }> {

    if (page < 1) page = 1;
    if (limit < 1 || limit > 100) limit = 20;

    const offset = (page - 1) * limit;


    const countResult = await this.db.query(
      'SELECT COUNT(*) FROM orders WHERE user_id = $1',
      [userId]
    );
    const total = parseInt(countResult.rows[0].count, 10);


    const ordersResult = await this.db.query(
      `SELECT * FROM orders 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const orders: OrderResponse[] = [];

    for (const order of ordersResult.rows) {
      const itemsResult = await this.db.query(
        'SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at',
        [order.id]
      );

      orders.push(this.mapToOrderResponse(order, itemsResult.rows));
    }

    return {
      orders,
      total,
      page,
      limit,
    };
  }

  async cancelOrder(orderId: string, userId: string, data: CancelOrderRequest): Promise<OrderResponse> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');


      const orderResult = await client.query(
        'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
        [orderId, userId]
      );

      if (orderResult.rows.length === 0) {
        throw new NotFoundError('Order');
      }

      const order = orderResult.rows[0];


      if (order.status === 'CANCELLED') {
        throw new ConflictError('Order is already cancelled');
      }

      if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
        throw new ConflictError('Cannot cancel order that has been shipped or delivered');
      }


      const updateResult = await client.query(
        `UPDATE orders 
         SET status = $1, updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`,
        ['CANCELLED', orderId]
      );

      const updatedOrder = updateResult.rows[0];


      await client.query(
        `UPDATE order_saga_state 
         SET current_step = $1, compensation_needed = $2, updated_at = NOW() 
         WHERE order_id = $3`,
        ['ORDER_CANCELLED', true, orderId]
      );

      await client.query('COMMIT');

      logger.info('Order cancelled successfully', {
        orderId,
        userId,
        reason: data.reason,
      });


      try {
        const event: OrderCancelledEvent = {
          id: uuidv4(),
          type: 'order.cancelled',
          aggregateId: orderId,
          payload: {
            orderId,
            reason: data.reason || 'User requested cancellation',
          },
          timestamp: new Date(),
          version: 1,
        };

        const producer = getKafkaProducer();
        await producer.publishEvent(KAFKA_TOPICS.ORDERS, event);

        logger.info('Order cancelled event published', {
          orderId,
          eventId: event.id,
        });
      } catch (error) {
        logger.error('Failed to publish order cancelled event', {
          orderId,
          error: error instanceof Error ? error.message : String(error),
        });

      }


      const itemsResult = await client.query(
        'SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at',
        [orderId]
      );

      return this.mapToOrderResponse(updatedOrder, itemsResult.rows);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to cancel order', {
        error: error instanceof Error ? error.message : String(error),
        orderId,
        userId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
    const result = await this.db.query(
      `UPDATE orders 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [status, orderId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Order');
    }

    logger.info('Order status updated', {
      orderId,
      newStatus: status,
    });


    try {
      const event = {
        id: uuidv4(),
        type: `order.${status.toLowerCase()}` as unknown,
        aggregateId: orderId,
        payload: {
          orderId,
          status,
        },
        timestamp: new Date(),
        version: 1,
      };

      const producer = getKafkaProducer();
      await producer.publishEvent(KAFKA_TOPICS.ORDERS, event);

      logger.info('Order status change event published', {
        orderId,
        status,
        eventId: event.id,
      });
    } catch (error) {
      logger.error('Failed to publish order status change event', {
        orderId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async shipOrder(orderId: string, data: { trackingNumber?: string; carrier?: string }): Promise<OrderResponse> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');


      const orderResult = await client.query(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        throw new NotFoundError('Order');
      }

      const order = orderResult.rows[0];


      if (order.status !== 'PAID' && order.status !== 'PROCESSING') {
        throw new ConflictError('Order must be paid or processing to be shipped');
      }


      const updateResult = await client.query(
        `UPDATE orders 
         SET status = $1, updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`,
        ['SHIPPED', orderId]
      );

      const updatedOrder = updateResult.rows[0];

      await client.query('COMMIT');

      logger.info('Order shipped successfully', {
        orderId,
        trackingNumber: data.trackingNumber,
        carrier: data.carrier,
      });


      try {
        const event = {
          id: uuidv4(),
          type: 'order.shipped' as const,
          aggregateId: orderId,
          payload: {
            orderId,
            trackingNumber: data.trackingNumber,
            carrier: data.carrier,
          },
          timestamp: new Date(),
          version: 1,
        };

        const producer = getKafkaProducer();
        await producer.publishEvent(KAFKA_TOPICS.ORDERS, event);

        logger.info('Order shipped event published', {
          orderId,
          eventId: event.id,
        });
      } catch (error) {
        logger.error('Failed to publish order shipped event', {
          orderId,
          error: error instanceof Error ? error.message : String(error),
        });

      }


      const itemsResult = await client.query(
        'SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at',
        [orderId]
      );

      return this.mapToOrderResponse(updatedOrder, itemsResult.rows);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to ship order', {
        error: error instanceof Error ? error.message : String(error),
        orderId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async deliverOrder(orderId: string, data: { deliveredAt?: Date }): Promise<OrderResponse> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');


      const orderResult = await client.query(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        throw new NotFoundError('Order');
      }

      const order = orderResult.rows[0];


      if (order.status !== 'SHIPPED') {
        throw new ConflictError('Order must be shipped to be delivered');
      }


      const updateResult = await client.query(
        `UPDATE orders 
         SET status = $1, updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`,
        ['DELIVERED', orderId]
      );

      const updatedOrder = updateResult.rows[0];

      await client.query('COMMIT');

      logger.info('Order delivered successfully', {
        orderId,
        deliveredAt: data.deliveredAt || new Date(),
      });


      try {
        const event = {
          id: uuidv4(),
          type: 'order.delivered' as const,
          aggregateId: orderId,
          payload: {
            orderId,
            deliveredAt: data.deliveredAt || new Date(),
          },
          timestamp: new Date(),
          version: 1,
        };

        const producer = getKafkaProducer();
        await producer.publishEvent(KAFKA_TOPICS.ORDERS, event);

        logger.info('Order delivered event published', {
          orderId,
          eventId: event.id,
        });
      } catch (error) {
        logger.error('Failed to publish order delivered event', {
          orderId,
          error: error instanceof Error ? error.message : String(error),
        });

      }


      const itemsResult = await client.query(
        'SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at',
        [orderId]
      );

      return this.mapToOrderResponse(updatedOrder, itemsResult.rows);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to deliver order', {
        error: error instanceof Error ? error.message : String(error),
        orderId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  private mapToOrderResponse(order: Record<string, unknown>, items: Record<string, unknown>[]): OrderResponse {
    return {
      id: order.id as string,
      userId: order.user_id as string,
      status: order.status as OrderStatus,
      totalAmount: parseFloat(order.total_amount as string),
      paymentStatus: order.payment_status as PaymentStatus,
      shippingAddress: order.shipping_address as Address,
      items: items.map(item => ({
        id: item.id as string,
        productId: item.product_id as string,
        variantId: item.variant_id as string | undefined,
        quantity: item.quantity as number,
        unitPrice: parseFloat(item.unit_price as string),
        subtotal: parseFloat(item.subtotal as string),
      })),
      createdAt: order.created_at as Date,
      updatedAt: order.updated_at as Date,
    };
  }
}
