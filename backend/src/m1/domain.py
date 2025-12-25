from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


class Entry(BaseModel):
    id: str
    name: str


class Event(BaseModel):
    id: str
    title: str
    entries: list[Entry]
    created_at: datetime


class Participant(BaseModel):
    id: str
    name: str
    participant_key: str


class ScoreItem(BaseModel):
    entry_id: str
    score: int = Field(ge=0, le=100)


class CreateEventRequest(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    entries: list[str] = Field(min_length=1, max_length=50)


class CreateEventResponse(BaseModel):
    event_id: str


class JoinEventRequest(BaseModel):
    name: str = Field(min_length=1, max_length=30)


class JoinEventResponse(BaseModel):
    participant_id: str
    participant_key: str


class PutScoresRequest(BaseModel):
    scores: list[ScoreItem]


class RankingRow(BaseModel):
    entry_id: str
    entry_name: str
    score: int
    rank: int


class ParticipantResult(BaseModel):
    participant_id: str
    participant_name: str
    rankings: list[RankingRow]


class OverallRow(BaseModel):
    entry_id: str
    entry_name: str
    total_score: int
    rank: int


class ResultsResponse(BaseModel):
    event_id: str
    event_title: str
    overall: list[OverallRow]
    per_participant: list[ParticipantResult]


class StoreBackend(BaseModel):
    kind: Literal["inmemory", "dynamodb"]
