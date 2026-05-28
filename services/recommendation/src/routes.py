from fastapi import APIRouter, HTTPException, status
from typing import Optional
from uuid import UUID
from .models import (
    ProductView,
    ProductRecommendation,
    RecommendationResponse,
    TrendingProduct,
    SimilarProduct
)
from .recommendation_service import RecommendationService
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
recommendation_service = RecommendationService()


@router.get("/recommendations/personalized")
async def get_personalized_recommendations(
    user_id: UUID,
    limit: int = 10
) -> RecommendationResponse:
    """
    Get personalized product recommendations for a user
    
    Uses collaborative filtering and content-based filtering algorithms
    """
    try:
        recommendations = recommendation_service.get_personalized_recommendations(
            user_id=user_id,
            limit=limit
        )
        
        return RecommendationResponse(
            recommendations=recommendations,
            user_id=user_id
        )
    except Exception as e:
        logger.error(f"Failed to get personalized recommendations: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate recommendations"
        )


@router.get("/recommendations/trending")
async def get_trending_recommendations(
    limit: int = 10
) -> list[TrendingProduct]:
    """
    Get trending products based on recent views and purchases
    
    Uses time decay to weight recent activity higher
    """
    try:
        trending = recommendation_service.get_trending_products(limit=limit)
        return trending
    except Exception as e:
        logger.error(f"Failed to get trending products: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get trending products"
        )


@router.get("/recommendations/similar/{product_id}")
async def get_similar_products(
    product_id: UUID,
    limit: int = 10
) -> list[SimilarProduct]:
    """
    Get products similar to the specified product
    
    Based on pre-calculated similarity scores
    """
    try:
        similar = recommendation_service.get_similar_products(
            product_id=product_id,
            limit=limit
        )
        
        if not similar:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No similar products found"
            )
        
        return similar
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get similar products: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get similar products"
        )


@router.post("/recommendations/track-view", status_code=status.HTTP_201_CREATED)
async def track_product_view(view: ProductView) -> dict:
    """
    Track a product view (internal endpoint)
    
    Used by other services to record when users view products
    """
    try:
        success = recommendation_service.track_view(
            user_id=view.user_id,
            product_id=view.product_id
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to track view"
            )
        
        return {"message": "View tracked successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to track view: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to track view"
        )
