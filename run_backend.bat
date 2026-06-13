@echo off
title NOXAR Backend Data Engine
echo Starting NOXAR Diagnostic Backend Server...
cd /d C:\Users\Milana\Noxar1
.\venv\Scripts\python.exe -m uvicorn main:app --port 8000
pause
