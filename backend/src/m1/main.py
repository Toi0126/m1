from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from mangum import Mangum

from .domain import (
    CreateEventRequest,
    CreateEventResponse,
    JoinEventRequest,
    JoinEventResponse,
    PutScoresRequest,
    ResultsResponse,
)
from .ranking import compute_overall, compute_per_participant
from .store import build_store


def _load_dotenv(repo_root: Path) -> None:
    env_path = repo_root / "config" / ".env"
    if not env_path.exists():
        return
    try:
        from dotenv import load_dotenv

        load_dotenv(dotenv_path=env_path, override=False)
    except ImportError:
        # python-dotenv is an optional convenience; env vars may be set by runtime.
        return


def create_app() -> FastAPI:
    app = FastAPI(title="M1 Scoring")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    repo_root = Path(__file__).resolve().parents[3]
    _load_dotenv(repo_root)

    store = build_store()
    web_dir = Path(os.environ.get("WEB_DIR", str(repo_root / "web"))).resolve()

    # このMVPでは static/ を置かないので、同じ web/ をそのまま配信
    app.mount("/static", StaticFiles(directory=str(web_dir)), name="static")

    @app.get("/")
    def index():
        index_path = web_dir / "index.html"
        if not index_path.exists():
            raise HTTPException(status_code=500, detail="index.html not found")
        return FileResponse(str(index_path))

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.post("/api/events", response_model=CreateEventResponse)
    def create_event(req: CreateEventRequest):
        event = store.create_event(req.title, req.entries)
        return CreateEventResponse(event_id=event.id)

    @app.get("/api/events/{event_id}")
    def get_event(event_id: str):
        event = store.get_event(event_id)
        if event is None:
            raise HTTPException(status_code=404, detail="event not found")
        return event

    @app.post("/api/events/{event_id}/join", response_model=JoinEventResponse)
    def join_event(event_id: str, req: JoinEventRequest):
        event = store.get_event(event_id)
        if event is None:
            raise HTTPException(status_code=404, detail="event not found")
        participant = store.join_event(event_id, req.name)
        return JoinEventResponse(
            participant_id=participant.id, participant_key=participant.participant_key
        )

    @app.put("/api/events/{event_id}/participants/{participant_id}/scores")
    def put_scores(
        event_id: str,
        participant_id: str,
        req: PutScoresRequest,
        x_participant_key: str | None = Header(default=None, alias="X-Participant-Key"),
    ):
        if not x_participant_key:
            raise HTTPException(status_code=401, detail="X-Participant-Key is required")
        event = store.get_event(event_id)
        if event is None:
            raise HTTPException(status_code=404, detail="event not found")
        try:
            store.put_scores(event_id, participant_id, x_participant_key, req.scores)
        except PermissionError:
            raise HTTPException(status_code=403, detail="invalid participant key")
        except KeyError:
            raise HTTPException(status_code=404, detail="participant not found")
        return {"ok": True}

    @app.get("/api/events/{event_id}/results", response_model=ResultsResponse)
    def results(event_id: str):
        event = store.get_event(event_id)
        if event is None:
            raise HTTPException(status_code=404, detail="event not found")
        participants = store.list_participants(event_id)
        scores_by_participant = store.list_scores_by_participant(event_id)

        overall = compute_overall(event.entries, scores_by_participant)
        per_participant = compute_per_participant(
            event.entries, participants, scores_by_participant
        )

        return ResultsResponse(
            event_id=event.id,
            event_title=event.title,
            overall=overall,
            per_participant=per_participant,
        )

    return app


app = create_app()
handler = Mangum(app)
