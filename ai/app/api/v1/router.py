from fastapi import APIRouter

from app.api.v1 import dialogue, gymnastics, health, report, taekwondo

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(gymnastics.router)
api_router.include_router(taekwondo.router)
api_router.include_router(dialogue.router)
api_router.include_router(report.router)
