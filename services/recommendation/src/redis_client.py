import redis
import json
import logging
from typing import Optional, Any
from .config import settings

logger = logging.getLogger(__name__)

# Redis client
redis_client = None


def init_redis():
    """Initialize Redis client"""
    global redis_client
    try:
        redis_client = redis.from_url(
            settings.redis_url,
            decode_responses=True
        )
        redis_client.ping()
        logger.info("Redis client initialized")
    except Exception as e:
        logger.error(f"Failed to initialize Redis: {e}")
        raise


def get_cached(key: str) -> Optional[Any]:
    """Get value from cache"""
    try:
        value = redis_client.get(key)
        if value:
            return json.loads(value)
        return None
    except Exception as e:
        logger.error(f"Redis get error: {e}")
        return None


def set_cached(key: str, value: Any, ttl: int = None) -> bool:
    """Set value in cache with TTL"""
    try:
        ttl = ttl or settings.cache_ttl
        redis_client.setex(
            key,
            ttl,
            json.dumps(value)
        )
        return True
    except Exception as e:
        logger.error(f"Redis set error: {e}")
        return False


def delete_cached(key: str) -> bool:
    """Delete value from cache"""
    try:
        redis_client.delete(key)
        return True
    except Exception as e:
        logger.error(f"Redis delete error: {e}")
        return False


def close_redis():
    """Close Redis connection"""
    global redis_client
    if redis_client:
        redis_client.close()
        logger.info("Redis connection closed")
