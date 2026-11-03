from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

# Insecure placeholder — production boot refuses this value.
INSECURE_JWT_SECRET = "edgewise-secret-key-change-in-production"


class Settings(BaseSettings):
    APP_NAME: str = "Edgewise API"
    APP_ENV: str = "development"
    REDIS_URL: str = "redis://localhost:6379/0"
    JWT_SECRET: str = INSECURE_JWT_SECRET
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    RESEARCH_HASH_SECRET: Optional[str] = None

    model_config = SettingsConfigDict(env_file=".env")

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.strip().lower() in {"production", "prod"}

    def require_secure_jwt(self) -> None:
        secret = (self.JWT_SECRET or "").strip()
        if not secret or secret == INSECURE_JWT_SECRET:
            if self.is_production:
                raise RuntimeError(
                    "JWT_SECRET must be set to a strong random value when APP_ENV=production. "
                    "Copy .env.example to backend/.env and replace the placeholder."
                )


settings = Settings()
