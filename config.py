import os

class Config:
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "AQ.Ab8RN6ImyneB7NeFhIxzl9NYl6oJv-RqdG2OmfkRdOMzOHNRSQ")
    MODEL_NAME = "gemini-3.5-flash-lite"
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024