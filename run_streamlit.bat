@echo off
REM Legacy Streamlit prototype (opens http://localhost:8501)
cd /d "%~dp0"
python -m streamlit run app.py
pause
