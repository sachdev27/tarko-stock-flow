import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://localhost/tarko_inventory')
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'dev-secret-key-change-in-prod')
    JWT_ACCESS_TOKEN_EXPIRES = 86400  # 24 hours
