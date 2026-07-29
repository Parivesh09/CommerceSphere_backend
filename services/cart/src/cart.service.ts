import { pool } from './database';
import { AppError, createLogger } from '@commercesphere/utils';
import type {
  Cart,
  CartItem,
  AddToCartRequest,
  UpdateCartItemRequest,
  RemoveFromCartRequest,
} from './types';

const logger = createLogger({ serviceName: 'cart-service' });

const TAX_RATE = 0.08;
const SHIPPING_COST = 5.99;

async function getOrCreateCart(userId: string): Promise<string> {
  const existing = await pool.query(
    'SELECT id FROM carts WHERE user_id = $1',
    [userId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const result = await pool.query(
    'INSERT INTO carts (user_id) VALUES ($1) RETURNING id',
    [userId]
  );
  return result.rows[0].id;
}

async function getCartItems(cartId: string): Promise<CartItem[]> {
  const result = await pool.query(
    'SELECT id, product_id AS "productId", variant_id AS "variantId", quantity FROM cart_items WHERE cart_id = $1 ORDER BY created_at',
    [cartId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    variantId: row.variantId || undefined,
    quantity: row.quantity,
    unitPrice: 0,
  }));
}

function computeTotals(items: CartItem[]): {
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
} {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  const shipping = items.length > 0 ? SHIPPING_COST : 0;
  const total = Math.round((subtotal + tax + shipping) * 100) / 100;
  return { subtotal, tax, shipping, total };
}

export async function getCart(userId: string): Promise<Cart> {
  const cartId = await getOrCreateCart(userId);

  const cartResult = await pool.query(
    'SELECT id, user_id AS "userId", updated_at AS "updatedAt" FROM carts WHERE id = $1',
    [cartId]
  );

  if (cartResult.rows.length === 0) {
    throw new AppError(404, 'Cart not found');
  }

  const items = await getCartItems(cartId);

  const { subtotal, tax, shipping, total } = computeTotals(items);

  return {
    id: cartResult.rows[0].id,
    userId: cartResult.rows[0].userId,
    items,
    subtotal,
    tax,
    shipping,
    total,
    updatedAt: cartResult.rows[0].updatedAt,
  };
}

export async function addToCart(
  userId: string,
  data: AddToCartRequest
): Promise<Cart> {
  const cartId = await getOrCreateCart(userId);

  const existing = await pool.query(
    `SELECT id, quantity FROM cart_items
     WHERE cart_id = $1 AND product_id = $2 AND (variant_id = $3 OR (variant_id IS NULL AND $3 IS NULL))`,
    [cartId, data.productId, data.variantId || null]
  );

  if (existing.rows.length > 0) {
    await pool.query(
      'UPDATE cart_items SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
      [data.quantity, existing.rows[0].id]
    );
  } else {
    await pool.query(
      `INSERT INTO cart_items (cart_id, product_id, variant_id, quantity)
       VALUES ($1, $2, $3, $4)`,
      [cartId, data.productId, data.variantId || null, data.quantity]
    );
  }

  await pool.query('UPDATE carts SET updated_at = NOW() WHERE id = $1', [cartId]);

  logger.info('Item added to cart', { userId, productId: data.productId });
  return getCart(userId);
}

export async function updateCartItem(
  userId: string,
  data: UpdateCartItemRequest
): Promise<Cart> {
  const cartId = await getOrCreateCart(userId);

  const result = await pool.query(
    `UPDATE cart_items SET quantity = $1, updated_at = NOW()
     WHERE cart_id = $2 AND product_id = $3 AND (variant_id = $4 OR (variant_id IS NULL AND $4 IS NULL))
     RETURNING id`,
    [data.quantity, cartId, data.productId, data.variantId || null]
  );

  if (result.rows.length === 0) {
    throw new AppError(404, 'Cart item not found');
  }

  await pool.query('UPDATE carts SET updated_at = NOW() WHERE id = $1', [cartId]);

  logger.info('Cart item updated', { userId, productId: data.productId, quantity: data.quantity });
  return getCart(userId);
}

export async function removeFromCart(
  userId: string,
  data: RemoveFromCartRequest
): Promise<Cart> {
  const cartId = await getOrCreateCart(userId);

  const result = await pool.query(
    `DELETE FROM cart_items
     WHERE cart_id = $1 AND product_id = $2 AND (variant_id = $3 OR (variant_id IS NULL AND $3 IS NULL))
     RETURNING id`,
    [cartId, data.productId, data.variantId || null]
  );

  if (result.rows.length === 0) {
    throw new AppError(404, 'Cart item not found');
  }

  await pool.query('UPDATE carts SET updated_at = NOW() WHERE id = $1', [cartId]);

  logger.info('Item removed from cart', { userId, productId: data.productId });
  return getCart(userId);
}

export async function clearCart(userId: string): Promise<Cart> {
  const cartId = await getOrCreateCart(userId);

  await pool.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
  await pool.query('UPDATE carts SET updated_at = NOW() WHERE id = $1', [cartId]);

  logger.info('Cart cleared', { userId });
  return getCart(userId);
}

export async function syncCart(
  userId: string,
  items: AddToCartRequest[]
): Promise<Cart> {
  const cartId = await getOrCreateCart(userId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of items) {
      const existing = await client.query(
        `SELECT id, quantity FROM cart_items
         WHERE cart_id = $1 AND product_id = $2 AND (variant_id = $3 OR (variant_id IS NULL AND $3 IS NULL))`,
        [cartId, item.productId, item.variantId || null]
      );

      if (existing.rows.length > 0) {
        await client.query(
          'UPDATE cart_items SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
          [item.quantity, existing.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO cart_items (cart_id, product_id, variant_id, quantity)
           VALUES ($1, $2, $3, $4)`,
          [cartId, item.productId, item.variantId || null, item.quantity]
        );
      }
    }

    await client.query('UPDATE carts SET updated_at = NOW() WHERE id = $1', [cartId]);
    await client.query('COMMIT');

    logger.info('Cart synced', { userId, itemCount: items.length });
    return getCart(userId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
