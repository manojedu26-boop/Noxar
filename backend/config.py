import os
import logging
from pathlib import Path
from dotenv import load_dotenv

# Setup professional logging format
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("noxar-backend")

class Settings:
    def __init__(self):
        # Load environment variables using absolute paths to prevent resolution drift
        root_env = Path(__file__).parent.parent / ".env"
        if root_env.exists():
            load_dotenv(dotenv_path=root_env, override=True)
            
        backend_env = Path(__file__).parent / ".env"
        if backend_env.exists():
            load_dotenv(dotenv_path=backend_env, override=False)

        # API Keys
        self.gemini_api_key = os.environ.get("GEMINI_API_KEY")
        self.openai_api_key = os.environ.get("OPENAI_API_KEY")
        self.anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY")
        
        # Hyperparameters for mathematical determinism and low latency
        self.default_temperature = 0.0
        self.fast_model = "gemini-2.5-flash"
        self.reasoning_model = "o3-mini"
        
        # Verify critical configuration status
        if not self.gemini_api_key:
            logger.warning("GEMINI_API_KEY is not set in environment variables.")
        if not self.openai_api_key:
            logger.warning("OPENAI_API_KEY is not set in environment variables.")

settings = Settings()
