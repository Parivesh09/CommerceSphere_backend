import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool
from contextlib import contextmanager
from .config import settings
import logging

logger = logging.getLogger(__name__)

# Connection pool
pool = None


def init_db_pool():
    """Initialize database connection pool"""
    global pool
    try:
        pool = SimpleConnectionPool(
            minconn=1,
            maxconn=10,
            dsn=settings.database_url
        )
        logger.info("Database connection pool initialized")
    except Exception as e:
        logger.error(f"Failed to initialize database pool: {e}")
        raise


@contextmanager
def get_db_connection():
    """Get database connection from pool"""
    conn = None
    try:
        conn = pool.getconn()
        yield conn
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database error: {e}")
        raise
    finally:
        if conn:
            pool.putconn(conn)


def init_schema():
    """Initialize database schema"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Create user_product_views table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_product_views (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL,
                    product_id UUID NOT NULL,
                    viewed_at TIMESTAMP DEFAULT NOW()
                );
                
                CREATE INDEX IF NOT EXISTS idx_user_views 
                ON user_product_views (user_id, viewed_at);
                
                CREATE INDEX IF NOT EXISTS idx_product_views 
                ON user_product_views (product_id, viewed_at);
            """)
            
            # Create user_purchases table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_purchases (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL,
                    product_id UUID NOT NULL,
                    purchased_at TIMESTAMP DEFAULT NOW()
                );
                
                CREATE INDEX IF NOT EXISTS idx_user_purchases 
                ON user_purchases (user_id, purchased_at);
                
                CREATE INDEX IF NOT EXISTS idx_product_purchases 
                ON user_purchases (product_id, purchased_at);
            """)
            
            # Create product_similarity table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS product_similarity (
                    product_id_1 UUID NOT NULL,
                    product_id_2 UUID NOT NULL,
                    similarity_score FLOAT NOT NULL,
                    PRIMARY KEY (product_id_1, product_id_2)
                );
                
                CREATE INDEX IF NOT EXISTS idx_similarity_score 
                ON product_similarity (product_id_1, similarity_score DESC);
            """)
            
            logger.info("Database schema initialized")


def close_db_pool():
    """Close database connection pool"""
    global pool
    if pool:
        pool.closeall()
        logger.info("Database connection pool closed")
