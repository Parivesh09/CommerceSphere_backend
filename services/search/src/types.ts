export interface SearchQuery {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'created_desc';
}

export interface SearchResult {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  inventoryQuantity: number;
  status: string;
  createdAt: string;
  score?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AutocompleteResult {
  suggestions: string[];
}

export interface ProductDocument {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  inventoryQuantity: number;
  status: string;
  createdAt: string;
}
