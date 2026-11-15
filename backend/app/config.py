# backend/app/config.py

import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///jugnu.db")
    SESSION_COOKIE_SECURE = os.getenv("JUGNU_SECURE_COOKIES", "0") == "1"
    MAX_CONTENT_LENGTH = 512 * 1024
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev')
    DEBUG = os.getenv('FLASK_DEBUG', '0') == '1'

    @staticmethod
    def validate():
        """Validate required configuration"""
        required_vars = ['GEMINI_API_KEY']
        missing = [var for var in required_vars if not getattr(Config, var)]
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")
