from fastapi import APIRouter

from app.api.v1.gymnastics_daniel import router as daniel_router
from app.api.v1.gymnastics_normalize import router as normalize_router
from app.api.v1.gymnastics_summary import router as summary_router
from app.api.v1.gymnastics_top import router as top_router

router = APIRouter(prefix="/gymnastics", tags=["gymnastics"])
router.include_router(normalize_router)
router.include_router(top_router)
router.include_router(daniel_router)
router.include_router(summary_router)
