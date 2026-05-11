import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # LLM Settings
    TYPHOON_API_KEY = os.getenv("OPEN_TYPHOON_API_KEY")
    TYPHOON_BASE_URL = 'https://api.opentyphoon.ai/v1'
    LLM_MODEL = "typhoon-v2.5-30b-a3b-instruct"

    # Supabase Settings
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

    # TTS Settings
    TTS_MODEL_NAME = "VIZINTZOR/MMS-TTS-THAI-FEMALEV2"

    # Embedding Settings
    EMBEDDING_MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'

    # App Settings
    PORT = 5500
    DEBUG = True

    @classmethod
    def validate(cls):
        missing = []
        if not cls.TYPHOON_API_KEY: missing.append("OPEN_TYPHOON_API_KEY")
        if not cls.SUPABASE_URL: missing.append("SUPABASE_URL")
        if not cls.SUPABASE_KEY: missing.append("SUPABASE_KEY")
        
        if missing:
            print(f"❌ Missing environment variables: {', '.join(missing)}")
            return False
        return True
