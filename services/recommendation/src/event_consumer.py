import json
import logging
from typing import Dict, Any
from kafka import KafkaConsumer
from uuid import UUID
from .config import settings
from .recommendation_service import RecommendationService

logger = logging.getLogger(__name__)


class EventConsumer:
    """Kafka event consumer for recommendation service"""
    
    def __init__(self):
        self.consumer = None
        self.recommendation_service = RecommendationService()
        self.running = False
    
    def start(self):
        """Start consuming events"""
        try:
            self.consumer = KafkaConsumer(
                'orders',
                'products',
                bootstrap_servers=settings.kafka_broker_list,
                group_id=settings.kafka_group_id,
                value_deserializer=lambda m: json.loads(m.decode('utf-8')),
                auto_offset_reset='earliest',
                enable_auto_commit=True
            )
            
            logger.info("Event consumer started")
            self.running = True
            
            for message in self.consumer:
                if not self.running:
                    break
                
                try:
                    self._process_event(message.topic, message.value)
                except Exception as e:
                    logger.error(f"Failed to process event: {e}")
        
        except Exception as e:
            logger.error(f"Event consumer error: {e}")
            raise
    
    def _process_event(self, topic: str, event: Dict[str, Any]):
        """Process an event based on its type"""
        event_type = event.get('type')
        payload = event.get('payload', {})
        
        logger.info(f"Processing event: {event_type} from topic: {topic}")
        
        if event_type == 'product.viewed':
            self._handle_product_viewed(payload)
        elif event_type == 'order.completed':
            self._handle_order_completed(payload)
        else:
            logger.debug(f"Ignoring event type: {event_type}")
    
    def _handle_product_viewed(self, payload: Dict[str, Any]):
        """Handle product viewed event"""
        try:
            user_id = UUID(payload.get('userId'))
            product_id = UUID(payload.get('productId'))
            
            self.recommendation_service.track_view(user_id, product_id)
            logger.info(f"Processed product.viewed: user={user_id}, product={product_id}")
        except Exception as e:
            logger.error(f"Failed to handle product.viewed event: {e}")
    
    def _handle_order_completed(self, payload: Dict[str, Any]):
        """Handle order completed event"""
        try:
            user_id = UUID(payload.get('userId'))
            items = payload.get('items', [])
            
            for item in items:
                product_id = UUID(item.get('productId'))
                self.recommendation_service.record_purchase(user_id, product_id)
            
            logger.info(f"Processed order.completed: user={user_id}, items={len(items)}")
        except Exception as e:
            logger.error(f"Failed to handle order.completed event: {e}")
    
    def stop(self):
        """Stop consuming events"""
        self.running = False
        if self.consumer:
            self.consumer.close()
            logger.info("Event consumer stopped")
