export interface CartItem {
  id: string;
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  updatedAt?: string;
}

export interface AddToCartRequest {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
}

export interface UpdateCartItemRequest {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice?: number;
}

export interface RemoveFromCartRequest {
  productId: string;
  variantId?: string;
}
