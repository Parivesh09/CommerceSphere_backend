import { Router, Request, Response, NextFunction } from 'express';
import * as cartService from './cart.service';
import { AppError } from '@commercesphere/utils';
import type { AddToCartRequest, UpdateCartItemRequest } from './types';

const router = Router();

function getUserId(req: Request): string {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError(401, 'User ID is required');
  }
  return userId;
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const cart = await cartService.getCart(userId);
    res.json(cart);
  } catch (error) {
    next(error);
  }
});

router.post('/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const data: AddToCartRequest = req.body;

    if (!data.productId || !data.quantity || data.quantity < 1) {
      throw new AppError(400, 'productId and positive quantity are required');
    }

    const cart = await cartService.addToCart(userId, data);
    res.status(201).json({ cart, message: 'Item added to cart' });
  } catch (error) {
    next(error);
  }
});

router.put('/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const data: UpdateCartItemRequest = req.body;

    if (!data.productId || data.quantity === undefined || data.quantity < 0) {
      throw new AppError(400, 'productId and valid quantity are required');
    }

    if (data.quantity === 0) {
      const cart = await cartService.removeFromCart(userId, {
        productId: data.productId,
        variantId: data.variantId,
      });
      return res.json({ cart, message: 'Item removed from cart' });
    }

    const cart = await cartService.updateCartItem(userId, data);
    res.json({ cart, message: 'Cart item updated' });
  } catch (error) {
    next(error);
  }
});

router.delete('/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { productId, variantId } = req.body;

    if (!productId) {
      throw new AppError(400, 'productId is required');
    }

    const cart = await cartService.removeFromCart(userId, { productId, variantId });
    res.json({ cart, message: 'Item removed from cart' });
  } catch (error) {
    next(error);
  }
});

router.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const cart = await cartService.clearCart(userId);
    res.json({ cart, message: 'Cart cleared' });
  } catch (error) {
    next(error);
  }
});

router.post('/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      throw new AppError(400, 'items array is required');
    }

    const cart = await cartService.syncCart(userId, items);
    res.json({ cart, message: 'Cart synced successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
