from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    port: int = 3008
    database_url: str
    redis_url: str
    kafka_brokers: str
    kafka_group_id: str = "recommendation-service"
    log_level: str = "info"
    cache_ttl: int = 3600  # 1 hour in seconds
    
    @property
    def kafka_broker_list(self) -> List[str]:
        return self.kafka_brokers.split(',')
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
