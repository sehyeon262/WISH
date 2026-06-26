import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """서버 시작 시 태극 1장 채점 자산을 메모리에 사전 로드한다.

    cold start 제거가 목적. 자산 로드 실패해도 서버는 계속 동작하며, 첫 채점
    요청 시 lazy 로딩으로 fallback 한다 (개발/테스트 환경 친화).

    관련 이슈: S14P31E103-341
    """
    try:
        from app.models.taegeuk1.loader import load_all_models
        from app.services.taekwondo.scoring.resources import preload_resources

        logger.info("태극 1장 채점 자산 사전 로드 시작")
        load_all_models()
        preload_resources()
        logger.info("태극 1장 채점 자산 사전 로드 완료")
    except Exception as exc:  # noqa: BLE001 — 자산 누락은 경고만, 서버는 계속
        logger.warning(
            "태극 1장 사전 로드 실패 (lazy 로딩으로 fallback): %s", exc
        )

    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()
