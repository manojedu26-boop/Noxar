import logging
from google import genai
import openai
from config import settings

logger = logging.getLogger("noxar-backend.clients")

class ClientPoolManager:
    def __init__(self):
        self._genai_client = None
        self._openai_client = None

    @property
    def genai_client(self) -> genai.Client:
        """Lazily initialize and pool the Google GenAI SDK client."""
        if self._genai_client is None:
            if not settings.gemini_api_key:
                logger.error("GenAI client requested but GEMINI_API_KEY is missing.")
            try:
                self._genai_client = genai.Client(api_key=settings.gemini_api_key)
                logger.info("GenAI Client successfully instantiated and pooled.")
            except Exception as e:
                logger.error(f"Failed to initialize GenAI Client: {e}")
                raise e
        return self._genai_client

    @property
    def openai_client(self) -> openai.AsyncOpenAI:
        """Lazily initialize and pool the AsyncOpenAI client."""
        if self._openai_client is None:
            if not settings.openai_api_key:
                logger.error("OpenAI client requested but OPENAI_API_KEY is missing.")
            try:
                self._openai_client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
                logger.info("AsyncOpenAI Client successfully instantiated and pooled.")
            except Exception as e:
                logger.error(f"Failed to initialize AsyncOpenAI Client: {e}")
                raise e
        return self._openai_client

client_pool = ClientPoolManager()
