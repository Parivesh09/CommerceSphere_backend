import { Product, ProductVariant, Category, ProductImage } from '@commercesphere/types';

export interface CreateProductRequest {
  title: string;
  description: string;
  price: number;
  categoryId: string;
  inventoryQuantity: number;
  status?: 'active' | 'inactive' | 'out_of_stock';
}

export interface UpdateProductRequest {
  title?: string;
  description?: string;
  price?: number;
  categoryId?: string;
  inventoryQuantity?: number;
  status?: 'active' | 'inactive' | 'out_of_stock';
}

export interface CreateCategoryRequest {
  name: string;
  slug: string;
  parentId?: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  slug?: string;
  parentId?: string;
}

export interface CreateVariantRequest {
  productId: string;
  sku: string;
  attributes: Record<string, string>;
  price?: number;
  inventoryQuantity: number;
}

export interface UpdateVariantRequest {
  sku?: string;
  attributes?: Record<string, string>;
  price?: number;
  inventoryQuantity?: number;
}

export interface ProductListQuery {
  page?: number;
  limit?: number;
  categoryId?: string;
  status?: string;
}

export interface GenerateUploadUrlRequest {
  fileExtension: string;
}

export interface ConfirmImageUploadRequest {
  key: string;
  displayOrder?: number;
}

export interface UpdateImageOrderRequest {
  displayOrder: number;
}

export interface InventoryReservation {
  id: string;
  productId: string;
  variantId?: string;
  orderId: string;
  quantity: number;
  status: 'reserved' | 'completed' | 'released';
  expiresAt: Date;
  createdAt: Date;
}

export interface ReserveInventoryRequest {
  orderId: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
  }>;
}

export interface ReleaseReservationRequest {
  orderId: string;
}

export interface ConvertReservationRequest {
  orderId: string;
}

export { Product, ProductVariant, Category, ProductImage };
