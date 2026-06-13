🎨 The Core Concept: What is NOXAR?
NOXAR is an Autonomous Diagnostic & Edge-Case Engine delivered via a lightweight Google Chrome Extension for programmers practicing on LeetCode and Codeforces.

It does not cheat, it does not write the full code solution for them, and it doesn't touch live interview environments. Instead, it serves as an instantaneous, high-fidelity data validation auditor. When a student is stuck on a problem because their code hits a blind error or a "Time Limit Exceeded" penalty, NOXAR extracts the problem's mathematical parameters and exposes the exact hidden inputs they failed to account for, alongside the required algorithmic Big-O constraint.

# NOXAR Edge Agent - System Architecture Blueprint

## Core Objective
Build a lightweight micro-SaaS infrastructure that provides deterministic competitive programming diagnostics (unseen input edge cases and Big-O runtime complexities) based on a problem statement string.

## Infrastructure Blueprint

### Component 1: Backend Core (Python / FastAPI)
- File: `main.py`
- Framework: FastAPI with Uvicorn server management.
- Endpoint: `POST /diagnose` accepting a JSON body `{"problem_text": "string"}`.
- Integration: Processes incoming text using an optimization system prompt directed to the Gemini API layer.

### Component 2: Frontend Integration (Chrome Extension)
- Files: `manifest.json`, `content.js`, `popup.html`, `popup.js`
- Action: Reads text selection from active tab, forwards text to local backend endpoint, and pipes markdown response cleanly to the popup window surface.

## Ordered Task List
1. Initialize python local virtual environment and install fastapi, uvicorn, and google-genai libraries.
2. Build the `main.py` server file integrating secure model authentication calls.
3. Generate a local client simulation script to test endpoint responses with sample problem data.
4. Assemble the Google Chrome Extension infrastructure templates.
