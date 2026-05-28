import logging
from typing import List, Dict, Set, Tuple
from uuid import UUID
from datetime import datetime, timedelta
from collections import defaultdict
import math
from psycopg2.extras import RealDictCursor
from .database import get_db_connection
from .redis_client import get_cached, set_cached
from .models import ProductRecommendation, TrendingProduct, SimilarProduct

logger = logging.getLogger(__name__)


class RecommendationService:
    """Service for generating product recommendations"""
    
    def __init__(self):
        self.cache_ttl = 3600  # 1 hour
    
    def track_view(self, user_id: UUID, product_id: UUID) -> bool:
        """Track a product view"""
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO user_product_views (user_id, product_id, viewed_at)
                        VALUES (%s, %s, NOW())
                    """, (str(user_id), str(product_id)))
            logger.info(f"Tracked view: user={user_id}, product={product_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to track view: {e}")
            return False
    
    def get_personalized_recommendations(
        self, 
        user_id: UUID, 
        limit: int = 10
    ) -> List[ProductRecommendation]:
        """Get personalized recommendations for a user"""
        # Check cache
        cache_key = f"recommendations:{user_id}"
        cached = get_cached(cache_key)
        if cached:
            logger.info(f"Returning cached recommendations for user {user_id}")
            return [ProductRecommendation(**rec) for rec in cached]
        
        recommendations = []
        
        # Get collaborative filtering recommendations
        collab_recs = self._collaborative_filtering(user_id, limit)
        recommendations.extend(collab_recs)
        
        # Get content-based recommendations
        content_recs = self._content_based_filtering(user_id, limit)
        recommendations.extend(content_recs)
        
        # Deduplicate and sort by score
        seen = set()
        unique_recs = []
        for rec in sorted(recommendations, key=lambda x: x.score, reverse=True):
            if rec.product_id not in seen:
                seen.add(rec.product_id)
                unique_recs.append(rec)
                if len(unique_recs) >= limit:
                    break
        
        # If not enough recommendations, add trending products
        if len(unique_recs) < limit:
            trending = self.get_trending_products(limit - len(unique_recs))
            for trend in trending:
                if trend.product_id not in seen:
                    unique_recs.append(ProductRecommendation(
                        product_id=trend.product_id,
                        score=trend.trending_score,
                        reason="trending"
                    ))
        
        # Cache results
        set_cached(cache_key, [rec.dict() for rec in unique_recs], self.cache_ttl)
        
        return unique_recs
    
    def _collaborative_filtering(
        self, 
        user_id: UUID, 
        limit: int
    ) -> List[ProductRecommendation]:
        """Generate recommendations using collaborative filtering"""
        try:
            with get_db_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    # User-based collaborative filtering
                    # Find similar users based on purchase history
                    cur.execute("""
                        WITH user_products AS (
                            SELECT product_id
                            FROM user_purchases
                            WHERE user_id = %s
                        ),
                        similar_users AS (
                            SELECT up.user_id, COUNT(*) as common_products
                            FROM user_purchases up
                            WHERE up.product_id IN (SELECT product_id FROM user_products)
                              AND up.user_id != %s
                            GROUP BY up.user_id
                            HAVING COUNT(*) > 0
                            ORDER BY common_products DESC
                            LIMIT 10
                        )
                        SELECT 
                            up.product_id,
                            COUNT(*) as purchase_count
                        FROM user_purchases up
                        JOIN similar_users su ON up.user_id = su.user_id
                        WHERE up.product_id NOT IN (SELECT product_id FROM user_products)
                        GROUP BY up.product_id
                        ORDER BY purchase_count DESC
                        LIMIT %s
                    """, (str(user_id), str(user_id), limit))
                    
                    results = cur.fetchall()
                    
                    recommendations = []
                    for row in results:
                        recommendations.append(ProductRecommendation(
                            product_id=UUID(row['product_id']),
                            score=float(row['purchase_count']) / 10.0,  # Normalize score
                            reason="collaborative_filtering"
                        ))
                    
                    return recommendations
        except Exception as e:
            logger.error(f"Collaborative filtering error: {e}")
            return []
    
    def _content_based_filtering(
        self, 
        user_id: UUID, 
        limit: int
    ) -> List[ProductRecommendation]:
        """Generate recommendations using content-based filtering"""
        try:
            with get_db_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    # Get recently viewed products
                    cur.execute("""
                        SELECT DISTINCT product_id
                        FROM user_product_views
                        WHERE user_id = %s
                        ORDER BY viewed_at DESC
                        LIMIT 5
                    """, (str(user_id),))
                    
                    viewed_products = [row['product_id'] for row in cur.fetchall()]
                    
                    if not viewed_products:
                        return []
                    
                    # Get similar products based on similarity scores
                    recommendations = []
                    for product_id in viewed_products:
                        cur.execute("""
                            SELECT product_id_2 as product_id, similarity_score
                            FROM product_similarity
                            WHERE product_id_1 = %s
                            ORDER BY similarity_score DESC
                            LIMIT %s
                        """, (product_id, limit))
                        
                        for row in cur.fetchall():
                            recommendations.append(ProductRecommendation(
                                product_id=UUID(row['product_id']),
                                score=float(row['similarity_score']),
                                reason="content_based"
                            ))
                    
                    return recommendations
        except Exception as e:
            logger.error(f"Content-based filtering error: {e}")
            return []
    
    def get_trending_products(self, limit: int = 10) -> List[TrendingProduct]:
        """Get trending products with time decay"""
        # Check cache
        cache_key = "trending:products"
        cached = get_cached(cache_key)
        if cached:
            logger.info("Returning cached trending products")
            return [TrendingProduct(**prod) for prod in cached]
        
        try:
            with get_db_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    # Calculate trending score with time decay
                    # Recent activity weighted higher
                    cur.execute("""
                        WITH recent_views AS (
                            SELECT 
                                product_id,
                                COUNT(*) as view_count,
                                MAX(viewed_at) as last_viewed
                            FROM user_product_views
                            WHERE viewed_at > NOW() - INTERVAL '7 days'
                            GROUP BY product_id
                        ),
                        recent_purchases AS (
                            SELECT 
                                product_id,
                                COUNT(*) as purchase_count
                            FROM user_purchases
                            WHERE purchased_at > NOW() - INTERVAL '7 days'
                            GROUP BY product_id
                        )
                        SELECT 
                            COALESCE(v.product_id, p.product_id) as product_id,
                            COALESCE(v.view_count, 0) as views,
                            COALESCE(p.purchase_count, 0) as purchases,
                            (COALESCE(v.view_count, 0) * 0.3 + 
                             COALESCE(p.purchase_count, 0) * 0.7) *
                            EXP(-EXTRACT(EPOCH FROM (NOW() - COALESCE(v.last_viewed, NOW() - INTERVAL '7 days'))) / 86400.0)
                            as trending_score
                        FROM recent_views v
                        FULL OUTER JOIN recent_purchases p ON v.product_id = p.product_id
                        ORDER BY trending_score DESC
                        LIMIT %s
                    """, (limit,))
                    
                    results = cur.fetchall()
                    
                    trending = []
                    for row in results:
                        trending.append(TrendingProduct(
                            product_id=UUID(row['product_id']),
                            trending_score=float(row['trending_score']),
                            views=int(row['views']),
                            purchases=int(row['purchases'])
                        ))
                    
                    # Cache results
                    set_cached(cache_key, [t.dict() for t in trending], self.cache_ttl)
                    
                    return trending
        except Exception as e:
            logger.error(f"Failed to get trending products: {e}")
            return []
    
    def get_similar_products(
        self, 
        product_id: UUID, 
        limit: int = 10
    ) -> List[SimilarProduct]:
        """Get similar products based on similarity scores"""
        # Check cache
        cache_key = f"similar:{product_id}"
        cached = get_cached(cache_key)
        if cached:
            logger.info(f"Returning cached similar products for {product_id}")
            return [SimilarProduct(**prod) for prod in cached]
        
        try:
            with get_db_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("""
                        SELECT product_id_2 as product_id, similarity_score
                        FROM product_similarity
                        WHERE product_id_1 = %s
                        ORDER BY similarity_score DESC
                        LIMIT %s
                    """, (str(product_id), limit))
                    
                    results = cur.fetchall()
                    
                    similar = []
                    for row in results:
                        similar.append(SimilarProduct(
                            product_id=UUID(row['product_id']),
                            similarity_score=float(row['similarity_score'])
                        ))
                    
                    # Cache results
                    set_cached(cache_key, [s.dict() for s in similar], self.cache_ttl)
                    
                    return similar
        except Exception as e:
            logger.error(f"Failed to get similar products: {e}")
            return []
    
    def record_purchase(self, user_id: UUID, product_id: UUID) -> bool:
        """Record a product purchase"""
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO user_purchases (user_id, product_id, purchased_at)
                        VALUES (%s, %s, NOW())
                    """, (str(user_id), str(product_id)))
            
            # Invalidate user's recommendation cache
            cache_key = f"recommendations:{user_id}"
            set_cached(cache_key, None, 0)
            
            logger.info(f"Recorded purchase: user={user_id}, product={product_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to record purchase: {e}")
            return False
