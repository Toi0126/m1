from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator


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

    @field_validator("title", mode="before")
    @classmethod
    def _strip_title(cls, v: object) -> str:
        if not isinstance(v, str):
            raise TypeError("title must be a string")
        s = v.strip()
        if not s:
            raise ValueError("title must not be blank")
        return s

    @field_validator("entries", mode="before")
    @classmethod
    def _normalize_entries(cls, v: object) -> list[str]:
        if not isinstance(v, list):
            raise TypeError("entries must be a list")
        normalized: list[str] = []
        for item in v:
            if not isinstance(item, str):
                raise TypeError("entries items must be strings")
            s = item.strip()
            if s:
                normalized.append(s)
        if not normalized:
            raise ValueError("entries must contain at least one non-blank item")
        return normalized


class CreateEventResponse(BaseModel):
    event_id: str


class JoinEventRequest(BaseModel):
    name: str = Field(min_length=1, max_length=30)

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, v: object) -> str:
        if not isinstance(v, str):
            raise TypeError("name must be a string")
        s = v.strip()
        if not s:
            raise ValueError("name must not be blank")
        return s


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
