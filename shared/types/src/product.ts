export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  categoryId: string;
  inventoryQuantity: number;
  status: 'active' | 'inactive' | 'out_of_stock';
  images: ProductImage[];
  variants?: ProductVariant[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  attributes: Record<string, string>;
  price?: number;
  inventoryQuantity: number;
  createdAt: Date;
}

export interface ProductImage {
  id: string;
  productId: string;
  url: string;
  displayOrder: number;
  createdAt: Date;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string;
  createdAt: Date;
}
