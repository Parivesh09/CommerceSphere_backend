import { Router, Request, Response, NextFunction } from 'express';
import { OrderService } from './order.service';
import { CreateOrderRequest, CancelOrderRequest, ShipOrderRequest, DeliverOrderRequest } from './types';
import { ValidationError } from '@commercesphere/utils';

const router = Router();
const orderService = new OrderService();


router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data: CreateOrderRequest = req.body;
    const order = await orderService.createOrder(data);
    res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
});


router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.query.userId as string;
    
    if (!userId) {
      throw new ValidationError('userId query parameter is required');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await orderService.getUserOrders(userId, page, limit);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});


router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id;
    const userId = req.query.userId as string;

    const order = await orderService.getOrderById(orderId, userId);
    res.status(200).json({ order });
  } catch (error) {
    next(error);
  }
});


router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id;
    const userId = req.body.userId;

    if (!userId) {
      throw new ValidationError('userId is required in request body');
    }

    const data: CancelOrderRequest = {
      reason: req.body.reason,
    };

    const order = await orderService.cancelOrder(orderId, userId, data);
    res.status(200).json({ order });
  } catch (error) {
    next(error);
  }
});


router.put('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    if (!status) {
      throw new ValidationError('status is required');
    }

    await orderService.updateOrderStatus(orderId, status);
    res.status(200).json({ message: 'Order status updated successfully' });
  } catch (error) {
    next(error);
  }
});


router.post('/:id/ship', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id;
    const data: ShipOrderRequest = {
      trackingNumber: req.body.trackingNumber,
      carrier: req.body.carrier,
    };

    const order = await orderService.shipOrder(orderId, data);
    res.status(200).json({ order });
  } catch (error) {
    next(error);
  }
});


router.post('/:id/deliver', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id;
    const data: DeliverOrderRequest = {
      deliveredAt: req.body.deliveredAt ? new Date(req.body.deliveredAt) : undefined,
    };

    const order = await orderService.deliverOrder(orderId, data);
    res.status(200).json({ order });
  } catch (error) {
    next(error);
  }
});

export default router;
