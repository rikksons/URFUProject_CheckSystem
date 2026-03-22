from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    BOT_TOKEN: str
    ADMIN_ID: int
    
    SPREADSHEET_ID: str
    SHEET_ID: int
    CREDENTIALS_PATH: str = "credentials.json"
    
    PHOTOS_DIR: str = "photos"
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()