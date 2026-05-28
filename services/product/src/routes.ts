import { Router, Request, Response } from 'express';
import { productRepository } from './repository';
import { cacheService } from './cache';
import { eventPublisher } from './events';
import { storageService } from './storage';
import { createLogger, AppError } from '@commercesphere/utils';
import { config } from './config';
import { 
  CreateProductRequest, 
  UpdateProductRequest, 
  CreateCategoryRequest, 
  UpdateCategoryRequest, 
  CreateVariantRequest, 
  UpdateVariantRequest, 
  ProductListQuery,
  GenerateUploadUrlRequest,
  ConfirmImageUploadRequest,
  UpdateImageOrderRequest,
  ReserveInventoryRequest,
  ReleaseReservationRequest,
  ConvertReservationRequest
} from './types';
import crypto from 'crypto';

const logger = createLogger({ serviceName: 'product-service' });
const router = Router();


async function checkAndPublishLowStock(
  productId: string,
  newQuantity: number,
  variantId?: string
): Promise<void> {
  const threshold = config.inventory.lowStockThreshold;
  if (newQuantity <= threshold && newQuantity > 0) {
    await eventPublisher.publishInventoryLowStock(
      productId,
      newQuantity,
      threshold,
      variantId
    );
    logger.info('Low stock event published', { productId, variantId, currentQuantity: newQuantity, threshold });
  }
}


router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'product-service' });
});


router.post('/categories', async (req: Request, res: Response) => {
  try {
    const data: CreateCategoryRequest = req.body;
    

    if (!data.name || !data.slug) {
      throw new AppError(400, 'Name and slug are required');
    }


    const existing = await productRepository.getCategoryBySlug(data.slug);
    if (existing) {
      throw new AppError(409, 'Category with this slug already exists');
    }

    const category = await productRepository.createCategory(data);
    logger.info('Category created', { categoryId: category.id });
    
    res.status(201).json(category);
  } catch (error) {
    logger.error('Error creating category', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.get('/categories', async (req: Request, res: Response) => {
  try {
    const categories = await productRepository.listCategories();
    res.json(categories);
  } catch (error) {
    logger.error('Error listing categories', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/categories/:id', async (req: Request, res: Response) => {
  try {
    const category = await productRepository.getCategoryById(req.params.id);
    if (!category) {
      throw new AppError(404, 'Category not found');
    }
    res.json(category);
  } catch (error) {
    logger.error('Error getting category', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.put('/categories/:id', async (req: Request, res: Response) => {
  try {
    const data: UpdateCategoryRequest = req.body;
    const category = await productRepository.updateCategory(req.params.id, data);
    
    if (!category) {
      throw new AppError(404, 'Category not found');
    }
    
    logger.info('Category updated', { categoryId: category.id });
    res.json(category);
  } catch (error) {
    logger.error('Error updating category', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await productRepository.deleteCategory(req.params.id);
    if (!deleted) {
      throw new AppError(404, 'Category not found');
    }
    
    logger.info('Category deleted', { categoryId: req.params.id });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting category', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});


router.post('/products', async (req: Request, res: Response) => {
  try {
    const data: CreateProductRequest = req.body;
    

    if (!data.title || data.price === undefined || !data.categoryId) {
      throw new AppError(400, 'Title, price, and categoryId are required');
    }


    const category = await productRepository.getCategoryById(data.categoryId);
    if (!category) {
      throw new AppError(404, 'Category not found');
    }

    const product = await productRepository.createProduct(data);
    

    await cacheService.setProduct(product);
    

    await cacheService.invalidateProductLists();
    

    await eventPublisher.publishProductCreated(
      product.id,
      product.title,
      product.price,
      product.categoryId
    );
    
    logger.info('Product created', { productId: product.id });
    res.status(201).json(product);
  } catch (error) {
    logger.error('Error creating product', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.get('/products', async (req: Request, res: Response) => {
  try {
    const query: ProductListQuery = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      categoryId: req.query.categoryId as string,
      status: req.query.status as string,
    };


    const queryHash = crypto
      .createHash('md5')
      .update(JSON.stringify(query))
      .digest('hex');
    const cacheKey = `products:page:${query.page}:filter:${queryHash}`;


    const cached = await cacheService.getProductList(cacheKey);
    if (cached) {
      return res.json(cached);
    }


    const result = await productRepository.listProducts(query);
    

    await cacheService.setProductList(cacheKey, result);
    
    res.json(result);
  } catch (error) {
    logger.error('Error listing products', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/products/:id', async (req: Request, res: Response) => {
  try {

    const cached = await cacheService.getProduct(req.params.id);
    if (cached) {
      return res.json(cached);
    }


    const product = await productRepository.getProductById(req.params.id);
    if (!product) {
      throw new AppError(404, 'Product not found');
    }


    await cacheService.setProduct(product);
    
    res.json(product);
  } catch (error) {
    logger.error('Error getting product', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.put('/products/:id', async (req: Request, res: Response) => {
  try {
    const data: UpdateProductRequest = req.body;
    

    const currentProduct = await productRepository.getProductById(req.params.id);
    if (!currentProduct) {
      throw new AppError(404, 'Product not found');
    }

    const product = await productRepository.updateProduct(req.params.id, data);
    if (!product) {
      throw new AppError(404, 'Product not found');
    }


    await cacheService.invalidateProduct(product.id);
    await cacheService.invalidateProductLists();


    await eventPublisher.publishProductUpdated(product.id, data);


    if (data.inventoryQuantity !== undefined && data.inventoryQuantity !== currentProduct.inventoryQuantity) {
      await eventPublisher.publishInventoryUpdated(
        product.id,
        currentProduct.inventoryQuantity,
        data.inventoryQuantity
      );


      await checkAndPublishLowStock(product.id, data.inventoryQuantity);
    }

    logger.info('Product updated', { productId: product.id });
    res.json(product);
  } catch (error) {
    logger.error('Error updating product', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.delete('/products/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await productRepository.deleteProduct(req.params.id);
    if (!deleted) {
      throw new AppError(404, 'Product not found');
    }


    await cacheService.invalidateProduct(req.params.id);
    await cacheService.invalidateProductLists();


    await eventPublisher.publishProductDeleted(req.params.id);

    logger.info('Product deleted', { productId: req.params.id });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting product', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});


router.post('/products/:productId/variants', async (req: Request, res: Response) => {
  try {
    const data: CreateVariantRequest = {
      ...req.body,
      productId: req.params.productId,
    };


    if (!data.sku || data.inventoryQuantity === undefined) {
      throw new AppError(400, 'SKU and inventoryQuantity are required');
    }


    const product = await productRepository.getProductById(data.productId);
    if (!product) {
      throw new AppError(404, 'Product not found');
    }

    const variant = await productRepository.createVariant(data);


    await cacheService.invalidateProduct(data.productId);

    logger.info('Variant created', { variantId: variant.id, productId: data.productId });
    res.status(201).json(variant);
  } catch (error) {
    logger.error('Error creating variant', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.get('/products/:productId/variants', async (req: Request, res: Response) => {
  try {
    const variants = await productRepository.listVariantsByProduct(req.params.productId);
    res.json(variants);
  } catch (error) {
    logger.error('Error listing variants', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/variants/:id', async (req: Request, res: Response) => {
  try {
    const variant = await productRepository.getVariantById(req.params.id);
    if (!variant) {
      throw new AppError(404, 'Variant not found');
    }
    res.json(variant);
  } catch (error) {
    logger.error('Error getting variant', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.put('/variants/:id', async (req: Request, res: Response) => {
  try {
    const data: UpdateVariantRequest = req.body;
    

    const currentVariant = await productRepository.getVariantById(req.params.id);
    if (!currentVariant) {
      throw new AppError(404, 'Variant not found');
    }

    const variant = await productRepository.updateVariant(req.params.id, data);
    if (!variant) {
      throw new AppError(404, 'Variant not found');
    }


    await cacheService.invalidateProduct(variant.productId);


    if (data.inventoryQuantity !== undefined && data.inventoryQuantity !== currentVariant.inventoryQuantity) {
      await eventPublisher.publishInventoryUpdated(
        variant.productId,
        currentVariant.inventoryQuantity,
        data.inventoryQuantity,
        variant.id
      );


      await checkAndPublishLowStock(variant.productId, data.inventoryQuantity, variant.id);
    }

    logger.info('Variant updated', { variantId: variant.id });
    res.json(variant);
  } catch (error) {
    logger.error('Error updating variant', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.delete('/variants/:id', async (req: Request, res: Response) => {
  try {
    const variant = await productRepository.getVariantById(req.params.id);
    if (!variant) {
      throw new AppError(404, 'Variant not found');
    }

    const deleted = await productRepository.deleteVariant(req.params.id);
    if (!deleted) {
      throw new AppError(404, 'Variant not found');
    }


    await cacheService.invalidateProduct(variant.productId);

    logger.info('Variant deleted', { variantId: req.params.id });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting variant', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});


router.post('/products/:productId/images/upload-url', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const data: GenerateUploadUrlRequest = req.body;


    if (!data.fileExtension) {
      throw new AppError(400, 'fileExtension is required');
    }


    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError(404, 'Product not found');
    }


    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const ext = data.fileExtension.toLowerCase().replace('.', '');
    if (!allowedExtensions.includes(ext)) {
      throw new AppError(400, `Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`);
    }


    const { uploadUrl, key } = await storageService.generateUploadUrl(productId, ext);

    logger.info('Generated image upload URL', { productId, key });
    res.json({ uploadUrl, key });
  } catch (error) {
    logger.error('Error generating upload URL', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.post('/products/:productId/images', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const data: ConfirmImageUploadRequest = req.body;


    if (!data.key) {
      throw new AppError(400, 'key is required');
    }


    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError(404, 'Product not found');
    }


    const imageUrl = storageService.getImageUrl(data.key);


    const displayOrder = data.displayOrder !== undefined 
      ? data.displayOrder 
      : await productRepository.getNextImageDisplayOrder(productId);


    const image = await productRepository.createImage(productId, imageUrl, displayOrder);


    await cacheService.invalidateProduct(productId);

    logger.info('Image added to product', { productId, imageId: image.id });
    res.status(201).json(image);
  } catch (error) {
    logger.error('Error confirming image upload', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.get('/products/:productId/images', async (req: Request, res: Response) => {
  try {
    const images = await productRepository.listImagesByProduct(req.params.productId);
    res.json(images);
  } catch (error) {
    logger.error('Error listing images', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/images/:id/order', async (req: Request, res: Response) => {
  try {
    const data: UpdateImageOrderRequest = req.body;

    if (data.displayOrder === undefined) {
      throw new AppError(400, 'displayOrder is required');
    }


    const currentImage = await productRepository.getImageById(req.params.id);
    if (!currentImage) {
      throw new AppError(404, 'Image not found');
    }

    const image = await productRepository.updateImageOrder(req.params.id, data.displayOrder);
    if (!image) {
      throw new AppError(404, 'Image not found');
    }


    await cacheService.invalidateProduct(image.productId);

    logger.info('Image order updated', { imageId: image.id, displayOrder: data.displayOrder });
    res.json(image);
  } catch (error) {
    logger.error('Error updating image order', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.delete('/images/:id', async (req: Request, res: Response) => {
  try {

    const image = await productRepository.getImageById(req.params.id);
    if (!image) {
      throw new AppError(404, 'Image not found');
    }


    const key = storageService.extractKeyFromUrl(image.url);
    

    if (key) {
      try {
        await storageService.deleteImage(key);
      } catch (storageError) {
        logger.error('Error deleting image from storage', { key, error: storageError });

      }
    }


    const deleted = await productRepository.deleteImage(req.params.id);
    if (!deleted) {
      throw new AppError(404, 'Image not found');
    }


    await cacheService.invalidateProduct(image.productId);

    logger.info('Image deleted', { imageId: req.params.id, productId: image.productId });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting image', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});


router.post('/inventory/reserve', async (req: Request, res: Response) => {
  try {
    const data: ReserveInventoryRequest = req.body;


    if (!data.orderId || !data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new AppError(400, 'orderId and items array are required');
    }


    for (const item of data.items) {
      if (!item.productId || item.quantity === undefined || item.quantity <= 0) {
        throw new AppError(400, 'Each item must have productId and positive quantity');
      }
    }


    const reservations = await productRepository.reserveInventory(data.orderId, data.items);


    for (const reservation of reservations) {

      if (reservation.variantId) {
        const variant = await productRepository.getVariantById(reservation.variantId);
        if (variant) {
          await checkAndPublishLowStock(reservation.productId, variant.inventoryQuantity, reservation.variantId);
        }
      } else {
        const product = await productRepository.getProductById(reservation.productId);
        if (product) {
          await checkAndPublishLowStock(reservation.productId, product.inventoryQuantity);
        }
      }
    }

    logger.info('Inventory reserved', { orderId: data.orderId, reservationCount: reservations.length });
    res.status(201).json({ 
      success: true, 
      reservations,
      message: 'Inventory reserved successfully'
    });
  } catch (error) {
    logger.error('Error reserving inventory', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else if (error instanceof Error && error.message.includes('Insufficient inventory')) {
      res.status(422).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.post('/inventory/release', async (req: Request, res: Response) => {
  try {
    const data: ReleaseReservationRequest = req.body;


    if (!data.orderId) {
      throw new AppError(400, 'orderId is required');
    }


    const released = await productRepository.releaseReservation(data.orderId);

    if (!released) {
      throw new AppError(404, 'No active reservations found for this order');
    }

    logger.info('Reservation released', { orderId: data.orderId });
    res.json({ 
      success: true, 
      message: 'Reservation released successfully'
    });
  } catch (error) {
    logger.error('Error releasing reservation', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.post('/inventory/convert', async (req: Request, res: Response) => {
  try {
    const data: ConvertReservationRequest = req.body;


    if (!data.orderId) {
      throw new AppError(400, 'orderId is required');
    }


    const converted = await productRepository.convertReservationToPermanent(data.orderId);

    if (!converted) {
      throw new AppError(404, 'No active reservations found for this order');
    }

    logger.info('Reservation converted to permanent', { orderId: data.orderId });
    res.json({ 
      success: true, 
      message: 'Reservation converted to permanent deduction'
    });
  } catch (error) {
    logger.error('Error converting reservation', { error });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.get('/inventory/reservations/:orderId', async (req: Request, res: Response) => {
  try {
    const reservations = await productRepository.getReservationsByOrder(req.params.orderId);
    res.json(reservations);
  } catch (error) {
    logger.error('Error getting reservations', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
