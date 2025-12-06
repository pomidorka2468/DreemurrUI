@echo off
REM Launch Dreemurr UI backend
cd /d "C:\edu\Dreemurr UI"
call venv\Scripts\activate.bat
uvicorn static.lib.main:app --host 0.0.0.0 --reload --port 8000
