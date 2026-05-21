# Comong AI Service

AI service skeleton for MVP development.

This service starts with only the common application structure. Feature-specific
folders such as `gymnastics`, `taekwondo`, `music`, or `art` should be added
when each feature is implemented.

## Structure

```txt
ai/
  app/
    main.py
    api/       API routers
    core/      configuration, logging, common errors
    schemas/   common request and response schemas
    models/    model integration placeholders
    services/  feature-specific AI logic placeholders
    utils/     shared helper placeholders
  tests/       test placeholders
```

## Current Scope

- Start a FastAPI server.
- Provide a health check endpoint.
- Keep stable folders for later AI feature work.

## Local Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

Health check:

```bash
curl http://localhost:8001/api/v1/health
```
