import os
import asyncio
import time
import random
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from google import genai
from google.genai import types
from google.genai.errors import APIError
from dotenv import load_dotenv

# Try importing openai and anthropic safely
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

try:
    from anthropic import Anthropic
except ImportError:
    Anthropic = None

# Load environment variables from .env files using absolute paths
# 1. Load root .env (contains primary credentials, override to ensure they are loaded)
root_env = Path(__file__).parent.parent / ".env"
if root_env.exists():
    load_dotenv(dotenv_path=root_env, override=True)

# 2. Load backend/.env second as fallback/module configuration (do not override)
backend_env = Path(__file__).parent / ".env"
if backend_env.exists():
    load_dotenv(dotenv_path=backend_env, override=False)








app = FastAPI(title="NOXAR Edge Agent Backend")

# Setup CORS to allow Chrome Extension requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For extensions, allowing chrome-extension:// origins
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DiagnoseRequest(BaseModel):
    problem_text: str
    code: str = ""
    selectedModel: str = "Fast"


# Helper to load skill instructions
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
                print(f"Error reading instructions at {path}: {e}")
    
    # Fallback default instructions if file not found
    print("Warning: Skill instructions file not found. Using built-in default instructions.")
    return (
        "You are an elite Competitive Programming Reasoning Engine optimized for Codeforces Div.1 and CodeChef advanced tracks.\n"
        "Skip all generic filler prose, pleasantries, or basic explanations. Dive straight into rigorous mathematical and logical analysis.\n"
        "Rigorously evaluate and structure your output under these headers:\n"
        "### 1. 🧮 MATHEMATICAL INVARIANTS\n"
        "### 2. 🌲 REDUCTION & MODELING\n"
        "### 3. ⏳ COMPLEXITY BOUNDS\n"
        "### 4. 🚨 DEVIOUS CORNER CASES"
    )

# Initialize the GenAI client. It reads GEMINI_API_KEY environment variable.
# We initialize it lazily inside the route or at startup.
try:
    client = genai.Client()
except Exception as e:
    print(f"GenAI Client initialization warning: {e}. Ensure GEMINI_API_KEY environment variable is set.")
    client = None

@app.post("/diagnose")
async def diagnose(request: DiagnoseRequest):
    if not request.problem_text.strip():
        raise HTTPException(status_code=400, detail="Problem text cannot be empty.")
    
    # Inject randomized delay to simulate natural human reading/clipboard delays
    await asyncio.sleep(random.uniform(1.5, 3.2))
    
    # Reload instructions dynamically to capture updates
    system_instruction = load_skill_instructions()
    
    # Add anti-detection prompt variation rule
    system_instruction += (
        "\n\nCRITICAL ANTI-DETECTION RULE: Vary your phrasing, vocabulary, and explanation structure "
        "across responses. Avoid repetitive boilerplate sentence patterns, identical transition words, "
        "or static signatures. Express mathematical insights and algorithmic reductions using diverse, "
        "natural language to simulate genuine human reasoning."
    )
    
    contents = request.problem_text
    if request.code.strip():
        contents = f"PROBLEM STATEMENT:\n{request.problem_text}\n\nUSER CODE:\n{request.code}"
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
    
    def stream_generator():
        selected_model = request.selectedModel
        if selected_model == "Reasoning":
            openai_key = os.environ.get("OPENAI_API_KEY")
            anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
            
            if openai_key:
                if OpenAI is None:
                    yield "\n\n[Error: 'openai' package is not installed or failed to import.]"
                    return
                try:
                    openai_client = OpenAI(api_key=openai_key)
                    try:
                        response_stream = openai_client.chat.completions.create(
                            model="o1-mini",
                            messages=[
                                {"role": "system", "content": system_instruction},
                                {"role": "user", "content": contents}
                            ],
                            stream=True
                        )
                        for chunk in response_stream:
                            if chunk.choices and chunk.choices[0].delta.content:
                                yield chunk.choices[0].delta.content
                    except Exception as e_inner:
                        # Fallback for systems that reject system messages or temperature for o1-mini
                        combined_content = f"SYSTEM INSTRUCTIONS:\n{system_instruction}\n\nINPUT PROBLEM/CODE:\n{contents}"
                        response_stream = openai_client.chat.completions.create(
                            model="o1-mini",
                            messages=[
                                {"role": "user", "content": combined_content}
                            ],
                            stream=True
                        )
                        for chunk in response_stream:
                            if chunk.choices and chunk.choices[0].delta.content:
                                yield chunk.choices[0].delta.content
                except Exception as e:
                    yield f"\n\n[OpenAI Streaming Error: {str(e)}]"
            elif anthropic_key:
                if Anthropic is None:
                    yield "\n\n[Error: 'anthropic' package is not installed or failed to import.]"
                    return
                try:
                    anthropic_client = Anthropic(api_key=anthropic_key)
                    response_stream = anthropic_client.messages.create(
                        model="claude-3-5-sonnet-20241022",
                        max_tokens=4000,
                        system=system_instruction,
                        messages=[
                            {"role": "user", "content": contents}
                        ],
                        stream=True
                    )
                    for event in response_stream:
                        if event.type == "content_block_delta" and event.delta.text:
                            yield event.delta.text
                except Exception as e:
                    yield f"\n\n[Anthropic Streaming Error: {str(e)}]"
            else:
                yield (
                    "### 🚨 CONFIGURATION ERROR\n\n"
                    "**Reasoning mode** requires either an **OpenAI** or **Anthropic** API key to be set.\n\n"
                    "Please configure at least one of the following in your `backend/.env` or root `.env` file:\n"
                    "- `OPENAI_API_KEY` (runs `o1-mini` reasoning model)\n"
                    "- `ANTHROPIC_API_KEY` (runs `claude-3-5-sonnet` model)\n"
                )
        else: # "Fast" or other
            # Ensure client is initialized
            global client
            if client is None:
                try:
                    client = genai.Client()
                except Exception as e:
                    yield f"\n\n[Gemini Client Init Error: {str(e)}. Please set GEMINI_API_KEY env variable.]"
                    return
            try:
                response_stream = client.models.generate_content_stream(
                    model="gemini-2.5-flash",
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.1,
                    )
                )
                for chunk in response_stream:
                    if chunk.text:
                        yield chunk.text
            except APIError as e:
                yield f"\n\n[Gemini API Error: {str(e)}]"
            except Exception as e:
                yield f"\n\n[Internal Streaming Error: {str(e)}]"

    return StreamingResponse(stream_generator(), media_type="text/plain")

@app.get("/health")
async def health():
    instructions_found = (
        (Path(__file__).parent.parent / ".agent" / "skills" / "code-diagnostics" / "instructions.md").exists() or
        (Path(".agent") / "skills" / "code-diagnostics" / "instructions.md").exists()
    )
    api_key_set = "GEMINI_API_KEY" in os.environ
    return {
        "status": "healthy",
        "instructions_found": instructions_found,
        "api_key_configured": api_key_set
    }
