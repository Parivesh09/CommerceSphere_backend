import { pool } from './database';
import { Product, ProductVariant, Category, ProductImage, InventoryReservation, CreateProductRequest, UpdateProductRequest, CreateCategoryRequest, UpdateCategoryRequest, CreateVariantRequest, UpdateVariantRequest, ProductListQuery } from './types';
import { createLogger } from '@commercesphere/utils';
import { Pool, PoolClient } from 'pg';

const logger = createLogger({ serviceName: 'product-service' });

export class ProductRepository {
  private pool: Pool;

  constructor(dbPool?: Pool) {
    this.pool = dbPool || pool;
  }

  async createCategory(data: CreateCategoryRequest): Promise<Category> {
    const result = await pool.query(
      `INSERT INTO categories (name, slug, parent_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, slug, parent_id as "parentId", created_at as "createdAt"`,
      [data.name, data.slug, data.parentId || null]
    );
    return result.rows[0];
  }

  async getCategoryById(id: string): Promise<Category | null> {
    const result = await pool.query(
      `SELECT id, name, slug, parent_id as "parentId", created_at as "createdAt"
       FROM categories WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async getCategoryBySlug(slug: string): Promise<Category | null> {
    const result = await pool.query(
      `SELECT id, name, slug, parent_id as "parentId", created_at as "createdAt"
       FROM categories WHERE slug = $1`,
      [slug]
    );
    return result.rows[0] || null;
  }

  async listCategories(): Promise<Category[]> {
    const result = await pool.query(
      `SELECT id, name, slug, parent_id as "parentId", created_at as "createdAt"
       FROM categories ORDER BY name ASC`
    );
    return result.rows;
  }

  async updateCategory(id: string, data: UpdateCategoryRequest): Promise<Category | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(data.name);
    }
    if (data.slug !== undefined) {
      fields.push(`slug = $${paramCount++}`);
      values.push(data.slug);
    }
    if (data.parentId !== undefined) {
      fields.push(`parent_id = $${paramCount++}`);
      values.push(data.parentId);
    }

    if (fields.length === 0) {
      return this.getCategoryById(id);
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE categories SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, name, slug, parent_id as "parentId", created_at as "createdAt"`,
      values
    );
    return result.rows[0] || null;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM categories WHERE id = $1', [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }


  async createProduct(data: CreateProductRequest): Promise<Product> {
    const result = await pool.query(
      `INSERT INTO products (title, description, price, category_id, inventory_quantity, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, description, price, category_id as "categoryId", 
                 inventory_quantity as "inventoryQuantity", status, 
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [data.title, data.description, data.price, data.categoryId, data.inventoryQuantity, data.status || 'active']
    );
    
    const product = result.rows[0];
    product.images = [];
    product.variants = [];
    return product;
  }

  async getProductById(id: string): Promise<Product | null> {
    const result = await pool.query(
      `SELECT id, title, description, price, category_id as "categoryId", 
              inventory_quantity as "inventoryQuantity", status, 
              created_at as "createdAt", updated_at as "updatedAt"
       FROM products WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const product = result.rows[0];
    

    const imagesResult = await pool.query(
      `SELECT id, product_id as "productId", url, display_order as "displayOrder", 
              created_at as "createdAt"
       FROM product_images WHERE product_id = $1 ORDER BY display_order ASC`,
      [id]
    );
    product.images = imagesResult.rows;


    const variantsResult = await pool.query(
      `SELECT id, product_id as "productId", sku, attributes, price, 
              inventory_quantity as "inventoryQuantity", created_at as "createdAt"
       FROM product_variants WHERE product_id = $1`,
      [id]
    );
    product.variants = variantsResult.rows;

    return product;
  }

  async listProducts(query: ProductListQuery): Promise<{ products: Product[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (query.categoryId) {
      conditions.push(`category_id = $${paramCount++}`);
      values.push(query.categoryId);
    }
    if (query.status) {
      conditions.push(`status = $${paramCount++}`);
      values.push(query.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';


    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM products ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);


    values.push(limit, offset);
    const result = await pool.query(
      `SELECT id, title, description, price, category_id as "categoryId", 
              inventory_quantity as "inventoryQuantity", status, 
              created_at as "createdAt", updated_at as "updatedAt"
       FROM products ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );

    const products = result.rows.map(p => ({ ...p, images: [], variants: [] }));

    return { products, total };
  }

  async updateProduct(id: string, data: UpdateProductRequest): Promise<Product | null> {
    const fields: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramCount = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${paramCount++}`);
      values.push(data.title);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(data.description);
    }
    if (data.price !== undefined) {
      fields.push(`price = $${paramCount++}`);
      values.push(data.price);
    }
    if (data.categoryId !== undefined) {
      fields.push(`category_id = $${paramCount++}`);
      values.push(data.categoryId);
    }
    if (data.inventoryQuantity !== undefined) {
      fields.push(`inventory_quantity = $${paramCount++}`);
      values.push(data.inventoryQuantity);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
    }

    if (fields.length === 1) {
      return this.getProductById(id);
    }

    values.push(id);
    await pool.query(
      `UPDATE products SET ${fields.join(', ')}
       WHERE id = $${paramCount}`,
      values
    );

    return this.getProductById(id);
  }

  async deleteProduct(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM products WHERE id = $1', [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }


  async createVariant(data: CreateVariantRequest): Promise<ProductVariant> {
    const result = await pool.query(
      `INSERT INTO product_variants (product_id, sku, attributes, price, inventory_quantity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, product_id as "productId", sku, attributes, price, 
                 inventory_quantity as "inventoryQuantity", created_at as "createdAt"`,
      [data.productId, data.sku, JSON.stringify(data.attributes), data.price || null, data.inventoryQuantity]
    );
    return result.rows[0];
  }

  async getVariantById(id: string): Promise<ProductVariant | null> {
    const result = await pool.query(
      `SELECT id, product_id as "productId", sku, attributes, price, 
              inventory_quantity as "inventoryQuantity", created_at as "createdAt"
       FROM product_variants WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async listVariantsByProduct(productId: string): Promise<ProductVariant[]> {
    const result = await pool.query(
      `SELECT id, product_id as "productId", sku, attributes, price, 
              inventory_quantity as "inventoryQuantity", created_at as "createdAt"
       FROM product_variants WHERE product_id = $1`,
      [productId]
    );
    return result.rows;
  }

  async updateVariant(id: string, data: UpdateVariantRequest): Promise<ProductVariant | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.sku !== undefined) {
      fields.push(`sku = $${paramCount++}`);
      values.push(data.sku);
    }
    if (data.attributes !== undefined) {
      fields.push(`attributes = $${paramCount++}`);
      values.push(JSON.stringify(data.attributes));
    }
    if (data.price !== undefined) {
      fields.push(`price = $${paramCount++}`);
      values.push(data.price);
    }
    if (data.inventoryQuantity !== undefined) {
      fields.push(`inventory_quantity = $${paramCount++}`);
      values.push(data.inventoryQuantity);
    }

    if (fields.length === 0) {
      return this.getVariantById(id);
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE product_variants SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, product_id as "productId", sku, attributes, price, 
                 inventory_quantity as "inventoryQuantity", created_at as "createdAt"`,
      values
    );
    return result.rows[0] || null;
  }

  async deleteVariant(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM product_variants WHERE id = $1', [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }


  async createImage(productId: string, url: string, displayOrder: number): Promise<ProductImage> {
    const result = await pool.query(
      `INSERT INTO product_images (product_id, url, display_order)
       VALUES ($1, $2, $3)
       RETURNING id, product_id as "productId", url, display_order as "displayOrder", 
                 created_at as "createdAt"`,
      [productId, url, displayOrder]
    );
    return result.rows[0];
  }

  async getImageById(id: string): Promise<ProductImage | null> {
    const result = await pool.query(
      `SELECT id, product_id as "productId", url, display_order as "displayOrder", 
              created_at as "createdAt"
       FROM product_images WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async listImagesByProduct(productId: string): Promise<ProductImage[]> {
    const result = await pool.query(
      `SELECT id, product_id as "productId", url, display_order as "displayOrder", 
              created_at as "createdAt"
       FROM product_images WHERE product_id = $1 ORDER BY display_order ASC`,
      [productId]
    );
    return result.rows;
  }

  async updateImageOrder(id: string, displayOrder: number): Promise<ProductImage | null> {
    const result = await pool.query(
      `UPDATE product_images SET display_order = $1
       WHERE id = $2
       RETURNING id, product_id as "productId", url, display_order as "displayOrder", 
                 created_at as "createdAt"`,
      [displayOrder, id]
    );
    return result.rows[0] || null;
  }

  async deleteImage(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM product_images WHERE id = $1', [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getNextImageDisplayOrder(productId: string): Promise<number> {
    const result = await pool.query(
      `SELECT COALESCE(MAX(display_order), -1) + 1 as next_order
       FROM product_images WHERE product_id = $1`,
      [productId]
    );
    return result.rows[0].next_order;
  }


  async reserveInventory(
    orderId: string,
    items: Array<{ productId: string; variantId?: string; quantity: number }>
  ): Promise<InventoryReservation[]> {
    const client = await pool.connect();
    const reservations: InventoryReservation[] = [];
    
    try {
      await client.query('BEGIN');


      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      for (const item of items) {

        if (item.variantId) {

          const variantResult = await client.query(
            `UPDATE product_variants 
             SET inventory_quantity = inventory_quantity - $1
             WHERE id = $2 AND inventory_quantity >= $1
             RETURNING inventory_quantity`,
            [item.quantity, item.variantId]
          );

          if (variantResult.rowCount === 0) {
            throw new Error(`Insufficient inventory for variant ${item.variantId}`);
          }
        } else {

          const productResult = await client.query(
            `UPDATE products 
             SET inventory_quantity = inventory_quantity - $1
             WHERE id = $2 AND inventory_quantity >= $1
             RETURNING inventory_quantity`,
            [item.quantity, item.productId]
          );

          if (productResult.rowCount === 0) {
            throw new Error(`Insufficient inventory for product ${item.productId}`);
          }
        }


        const reservationResult = await client.query(
          `INSERT INTO inventory_reservations 
           (product_id, variant_id, order_id, quantity, status, expires_at)
           VALUES ($1, $2, $3, $4, 'reserved', $5)
           RETURNING id, product_id as "productId", variant_id as "variantId", 
                     order_id as "orderId", quantity, status, 
                     expires_at as "expiresAt", created_at as "createdAt"`,
          [item.productId, item.variantId || null, orderId, item.quantity, expiresAt]
        );

        reservations.push(reservationResult.rows[0]);
      }

      await client.query('COMMIT');
      logger.info('Inventory reserved successfully', { orderId, itemCount: items.length });
      return reservations;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to reserve inventory', { orderId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async releaseReservation(orderId: string): Promise<boolean> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');


      const reservationsResult = await client.query(
        `SELECT id, product_id, variant_id, quantity, status
         FROM inventory_reservations
         WHERE order_id = $1 AND status = 'reserved'`,
        [orderId]
      );

      if (reservationsResult.rows.length === 0) {
        await client.query('COMMIT');
        return false;
      }


      for (const reservation of reservationsResult.rows) {
        if (reservation.variant_id) {
          await client.query(
            `UPDATE product_variants 
             SET inventory_quantity = inventory_quantity + $1
             WHERE id = $2`,
            [reservation.quantity, reservation.variant_id]
          );
        } else {
          await client.query(
            `UPDATE products 
             SET inventory_quantity = inventory_quantity + $1
             WHERE id = $2`,
            [reservation.quantity, reservation.product_id]
          );
        }
      }


      await client.query(
        `UPDATE inventory_reservations 
         SET status = 'released'
         WHERE order_id = $1 AND status = 'reserved'`,
        [orderId]
      );

      await client.query('COMMIT');
      logger.info('Reservation released successfully', { orderId });
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to release reservation', { orderId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async convertReservationToPermanent(orderId: string): Promise<boolean> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');


      const result = await client.query(
        `UPDATE inventory_reservations 
         SET status = 'completed'
         WHERE order_id = $1 AND status = 'reserved'`,
        [orderId]
      );

      await client.query('COMMIT');
      
      if (result.rowCount === 0) {
        logger.warn('No reservations found to convert', { orderId });
        return false;
      }

      logger.info('Reservation converted to permanent', { orderId });
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to convert reservation', { orderId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async expireOldReservations(): Promise<number> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');


      const expiredResult = await client.query(
        `SELECT id, product_id, variant_id, order_id, quantity
         FROM inventory_reservations
         WHERE status = 'reserved' AND expires_at < NOW()`
      );

      if (expiredResult.rows.length === 0) {
        await client.query('COMMIT');
        return 0;
      }


      for (const reservation of expiredResult.rows) {
        if (reservation.variant_id) {
          await client.query(
            `UPDATE product_variants 
             SET inventory_quantity = inventory_quantity + $1
             WHERE id = $2`,
            [reservation.quantity, reservation.variant_id]
          );
        } else {
          await client.query(
            `UPDATE products 
             SET inventory_quantity = inventory_quantity + $1
             WHERE id = $2`,
            [reservation.quantity, reservation.product_id]
          );
        }
      }


      await client.query(
        `UPDATE inventory_reservations 
         SET status = 'released'
         WHERE status = 'reserved' AND expires_at < NOW()`
      );

      await client.query('COMMIT');
      
      const count = expiredResult.rows.length;
      logger.info('Expired reservations released', { count });
      return count;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to expire old reservations', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  async getReservationsByOrder(orderId: string): Promise<InventoryReservation[]> {
    const result = await pool.query(
      `SELECT id, product_id as "productId", variant_id as "variantId", 
              order_id as "orderId", quantity, status, 
              expires_at as "expiresAt", created_at as "createdAt"
       FROM inventory_reservations
       WHERE order_id = $1`,
      [orderId]
    );
    return result.rows;
  }
}

export const productRepository = new ProductRepository();
