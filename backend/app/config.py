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
    # Open API interface dedicated exclusively to LGD group discussion multi-agent roleplay
    LGD_LLM_API_KEY: Optional[str] = None
    LGD_LLM_BASE_URL: str = "https://api.openai.com/v1"
    LGD_LLM_MODEL: str = "gpt-4o-mini"
    LGD_CONTEXT_WINDOW_LIMIT: int = 6

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
