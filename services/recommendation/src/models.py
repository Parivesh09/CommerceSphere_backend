from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from uuid import UUID


class ProductView(BaseModel):
    user_id: UUID
    product_id: UUID
    viewed_at: Optional[datetime] = None


class ProductPurchase(BaseModel):
    user_id: UUID
    product_id: UUID
    purchased_at: Optional[datetime] = None


class ProductRecommendation(BaseModel):
    product_id: UUID
    score: float
    reason: str


class RecommendationResponse(BaseModel):
    recommendations: List[ProductRecommendation]
    user_id: Optional[UUID] = None


class TrendingProduct(BaseModel):
    product_id: UUID
    trending_score: float
    views: int
    purchases: int


class SimilarProduct(BaseModel):
    product_id: UUID
    similarity_score: float
