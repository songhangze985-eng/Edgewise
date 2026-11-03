from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "Edgewise API"
    REDIS_URL: str = "redis://localhost:6379/0"
    JWT_SECRET: str = "edgewise-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    RESEARCH_HASH_SECRET: Optional[str] = None

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
