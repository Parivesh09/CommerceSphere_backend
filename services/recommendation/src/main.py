from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import threading
from contextlib import asynccontextmanager
from .config import settings
from .database import init_db_pool, init_schema, close_db_pool
from .redis_client import init_redis, close_redis
from .routes import router
from .event_consumer import EventConsumer

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Event consumer instance
event_consumer = None
consumer_thread = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global event_consumer, consumer_thread
    
    # Startup
    logger.info("Starting Recommendation Service...")
    
    try:
        # Initialize database
        init_db_pool()
        init_schema()
        
        # Initialize Redis
        init_redis()
        
        # Start event consumer in background thread
        event_consumer = EventConsumer()
        consumer_thread = threading.Thread(target=event_consumer.start, daemon=True)
        consumer_thread.start()
        
        logger.info(f"Recommendation Service started on port {settings.port}")
        
        yield
        
    finally:
        # Shutdown
        logger.info("Shutting down Recommendation Service...")
        
        if event_consumer:
            event_consumer.stop()
        
        close_redis()
        close_db_pool()
        
        logger.info("Recommendation Service stopped")


# Create FastAPI app
app = FastAPI(
    title="Recommendation Service",
    description="Product recommendation service for CommerceSphere",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(router, prefix="/api")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "recommendation-service"
    }


@app.get("/ready")
async def readiness_check():
    """Readiness check endpoint"""
    return {
        "status": "ready",
        "service": "recommendation-service"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=True
    )
