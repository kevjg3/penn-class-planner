from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./penn_planner.db"
    pcr_base_url: str = "https://penncoursereview.com/api/base"
    default_semester: str = "2026C"  # Fall 2026
    cors_origins: list[str] = ["*"]
    cache_ttl_seconds: int = 3600

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
