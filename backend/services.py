import os
import re
import logging
from pathlib import Path
from google.genai import types
from backend.config import settings
from backend.clients import client_pool

logger = logging.getLogger("noxar-backend.services")

class DiagnosticsService:
    @staticmethod
    def load_skill_instructions() -> str:
        paths_to_try = [
            Path(__file__).parent.parent / ".agent" / "skills" / "code-diagnostics" / "instructions.md",
            Path(".agent") / "skills" / "code-diagnostics" / "instructions.md"
        ]
        for path in paths_to_try:
            if path.exists():
                try:
                    return path.read_text(encoding="utf-8")
                except Exception as e:
                    logger.error(f"Error reading instructions at {path}: {e}")
        
        logger.warning("Skill instructions file not found. Falling back to default instructions.")
        return (
            "You are an Elite Algorithmic, Mathematical, and Machine Learning Reasoning Engine. Act as if you are trained on advanced ML algorithms "
            "(loss optimization, gradients, policy models) and mathematical algorithms (DP transitions, trees, flows).\n"
            "Provide responses that are short, sweet, precise, super accurate, and in very simple layman terms that a student can understand instantly.\n"
            "Rigorously evaluate and structure your output under these headers:\n"
            "### 1. 🧮 MATHEMATICAL INVARIANTS\n"
            "### 2. 🌲 REDUCTION & MODELING\n"
            "### 3. ⏳ COMPLEXITY BOUNDS\n"
            "### 4. 🚨 DEVIOUS CORNER CASES"
        )

    @staticmethod
    def is_simple_query(text: str) -> bool:
        """Determines if the query is a simple calculation or math computation."""
        cleaned = text.strip()
        is_math = bool(re.match(r'^[\d\s\+\-\*\/\(\)\%\.\^\=\?]+$', cleaned))
        is_short_general = len(cleaned) < 60 and not any(
            w in cleaned.lower() for w in ["array", "string", "matrix", "tree", "graph", "complexity", "algorithm", "solution", "leetcode", "codeforces"]
        )
        return is_math or is_short_general

    @classmethod
    def build_system_instruction(cls, textToAnalyze: str, code: str = "") -> tuple[str, str]:
        """Constructs the optimized system prompt instructions and query contents."""
        is_simple = cls.is_simple_query(textToAnalyze)
        
        if is_simple:
            system_instruction = (
                "You are a helpful assistant. Provide the direct answer to the user's query as simply, "
                "directly, and concisely as possible. Do not output any markdown headers, templates, "
                "or filler prose. Just output the direct result (e.g. for math, just output the number)."
            )
            contents = textToAnalyze
        else:
            system_instruction = cls.load_skill_instructions()
            
            # Anti-detection rule injection
            system_instruction += (
                "\n\nCRITICAL ANTI-DETECTION RULE: Vary your phrasing, vocabulary, and explanation structure "
                "across responses. Avoid repetitive boilerplate sentence patterns, identical transition words, "
                "or static signatures. Express mathematical insights and algorithmic reductions using diverse, "
                "natural language to simulate genuine human reasoning."
            )
            
            contents = textToAnalyze
            if code.strip():
                contents = f"PROBLEM STATEMENT:\n{textToAnalyze}\n\nUSER CODE:\n{code}"
                system_instruction += (
                    "\n\nAdditionally, the user has provided their current code solution. "
                    "Evaluate this code against the problem. Incorporate your findings in the response. "
                    "Specifically, add a section '### 5. 💻 CODE EVALUATION' at the end of your analysis. "
                    "In this section:\n"
                    "1. State the time and space complexity of the user's code.\n"
                    "2. Determine if the user's code will pass or fail/TLE under the constraints, explaining why.\n"
                    "3. Point out any logical bugs, edge-case failures, or language-specific pitfalls (e.g., overflow) present in the code.\n"
                    "4. Suggest minimal, specific corrections or optimizations to fix their code without providing the entire rewritten solution (keep it educational)."
                )
        return system_instruction, contents

    @classmethod
    async def generate_diagnostics_stream(cls, problem_text: str, code: str, selected_model: str):
        """Asynchronously calls the selected LLM provider and yields standardized SSE chunks."""
        system_instruction, contents = cls.build_system_instruction(problem_text, code)

        if selected_model == "Reasoning":
            if not settings.openai_api_key:
                yield "data: [Error: OPENAI_API_KEY is not configured in environment]\n\n"
                return
            try:
                client = client_pool.openai_client
                response_stream = await client.chat.completions.create(
                    model=settings.reasoning_model,
                    messages=[
                        {"role": "developer", "content": system_instruction},
                        {"role": "user", "content": contents}
                    ],
                    stream=True
                )
                async for chunk in response_stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield f"data: {chunk.choices[0].delta.content}\n\n"
            except Exception as e:
                err_str = str(e)
                logger.exception("Error during OpenAI reasoning stream generation")
                if "rate_limit" in err_str.lower() or "quota" in err_str.lower() or "429" in err_str:
                    yield "data: **OpenAI API Key Quota Reached.**\n\nPlease switch the model selection at the top to **Fast** mode to continue instantly.\n\n"
                else:
                    yield f"data: [OpenAI Streaming Error: {err_str}]\n\n"
                
        else: # "Fast" or other fallback
            if not settings.gemini_api_key:
                yield "data: [Error: GEMINI_API_KEY is not configured in environment]\n\n"
                return
            try:
                client = client_pool.genai_client
                response_stream = client.models.generate_content_stream(
                    model=settings.fast_model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=settings.default_temperature,
                    )
                )
                for chunk in response_stream:
                    if chunk.text:
                        yield f"data: {chunk.text}\n\n"
            except Exception as e:
                err_str = str(e)
                logger.exception("Error during Gemini stream generation")
                if "resource_exhausted" in err_str.lower() or "quota" in err_str.lower() or "429" in err_str:
                    yield "data: **Gemini Free Quota Limit Reached.**\n\nPlease switch the model selection at the top to **Reasoning** mode to continue instantly.\n\n"
                else:
                    yield f"data: [Gemini Error: {err_str}]\n\n"
