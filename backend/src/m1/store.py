from __future__ import annotations

import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol

import boto3
from boto3.dynamodb.conditions import Key

from .domain import Entry, Event, Participant, ScoreItem, new_id


class Store(Protocol):
    def create_event(self, title: str, entry_names: list[str]) -> Event: ...

    def get_event(self, event_id: str) -> Event | None: ...

    def join_event(self, event_id: str, participant_name: str) -> Participant: ...

    def get_participant(self, event_id: str, participant_id: str) -> Participant | None: ...

    def list_participants(self, event_id: str) -> list[Participant]: ...

    def put_scores(
        self, event_id: str, participant_id: str, participant_key: str, scores: list[ScoreItem]
    ) -> None: ...

    def list_scores_by_participant(self, event_id: str) -> dict[str, dict[str, int]]: ...


@dataclass
class InMemoryStore(Store):
    events: dict[str, Event]
    participants: dict[tuple[str, str], Participant]
    scores: dict[tuple[str, str, str], int]

    @classmethod
    def create(cls) -> "InMemoryStore":
        return cls(events={}, participants={}, scores={})

    def create_event(self, title: str, entry_names: list[str]) -> Event:
        event_id = new_id("evt")
        entries = [
            Entry(id=new_id("ent"), name=name.strip()) for name in entry_names if name.strip()
        ]
        if not entries:
            raise ValueError("entry_names must contain at least one non-blank item")
        event = Event(id=event_id, title=title.strip(), entries=entries, created_at=_now())
        self.events[event_id] = event
        return event

    def get_event(self, event_id: str) -> Event | None:
        return self.events.get(event_id)

    def join_event(self, event_id: str, participant_name: str) -> Participant:
        participant = Participant(
            id=new_id("p"),
            name=participant_name.strip(),
            participant_key=new_id("k"),
        )
        self.participants[(event_id, participant.id)] = participant
        return participant

    def get_participant(self, event_id: str, participant_id: str) -> Participant | None:
        return self.participants.get((event_id, participant_id))

    def list_participants(self, event_id: str) -> list[Participant]:
        return [p for (eid, _), p in self.participants.items() if eid == event_id]

    def put_scores(
        self, event_id: str, participant_id: str, participant_key: str, scores: list[ScoreItem]
    ) -> None:
        participant = self.get_participant(event_id, participant_id)
        if participant is None:
            raise KeyError("participant not found")
        if participant.participant_key != participant_key:
            raise PermissionError("invalid participant key")

        for item in scores:
            self.scores[(event_id, participant_id, item.entry_id)] = int(item.score)

    def list_scores_by_participant(self, event_id: str) -> dict[str, dict[str, int]]:
        result: dict[str, dict[str, int]] = defaultdict(dict)
        for (eid, pid, entry_id), score in self.scores.items():
            if eid != event_id:
                continue
            result[pid][entry_id] = int(score)
        return dict(result)


@dataclass
class DynamoDBStore(Store):
    table_name: str

    @classmethod
    def from_env(cls) -> "DynamoDBStore":
        table_name = os.environ.get("DDB_TABLE_NAME", "")
        if not table_name:
            raise RuntimeError("DDB_TABLE_NAME is required for dynamodb store")
        return cls(table_name=table_name)

    @property
    def _table(self):
        ddb = boto3.resource("dynamodb")
        return ddb.Table(self.table_name)

    def create_event(self, title: str, entry_names: list[str]) -> Event:
        event_id = new_id("evt")
        entries = [
            Entry(id=new_id("ent"), name=name.strip()) for name in entry_names if name.strip()
        ]
        if not entries:
            raise ValueError("entry_names must contain at least one non-blank item")
        event = Event(id=event_id, title=title.strip(), entries=entries, created_at=_now())

        self._table.put_item(
            Item={
                "pk": f"EVENT#{event_id}",
                "sk": "META",
                "title": event.title,
                "created_at": event.created_at.isoformat(),
                "entries": [e.model_dump() for e in entries],
            }
        )
        return event

    def get_event(self, event_id: str) -> Event | None:
        resp = self._table.get_item(Key={"pk": f"EVENT#{event_id}", "sk": "META"})
        item = resp.get("Item")
        if not item:
            return None
        return Event(
            id=event_id,
            title=item["title"],
            entries=[Entry(**e) for e in item.get("entries", [])],
            created_at=datetime.fromisoformat(item["created_at"]),
        )

    def join_event(self, event_id: str, participant_name: str) -> Participant:
        participant = Participant(
            id=new_id("p"),
            name=participant_name.strip(),
            participant_key=new_id("k"),
        )
        self._table.put_item(
            Item={
                "pk": f"EVENT#{event_id}",
                "sk": f"PARTICIPANT#{participant.id}",
                "name": participant.name,
                "participant_key": participant.participant_key,
            }
        )
        return participant

    def get_participant(self, event_id: str, participant_id: str) -> Participant | None:
        resp = self._table.get_item(
            Key={"pk": f"EVENT#{event_id}", "sk": f"PARTICIPANT#{participant_id}"}
        )
        item = resp.get("Item")
        if not item:
            return None
        return Participant(
            id=participant_id, name=item["name"], participant_key=item["participant_key"]
        )

    def list_participants(self, event_id: str) -> list[Participant]:
        resp = self._table.query(
            KeyConditionExpression=Key("pk").eq(f"EVENT#{event_id}")
            & Key("sk").begins_with("PARTICIPANT#")
        )
        items = resp.get("Items", [])
        participants: list[Participant] = []
        for it in items:
            pid = it["sk"].split("#", 1)[1]
            participants.append(
                Participant(id=pid, name=it["name"], participant_key=it["participant_key"])
            )
        return participants

    def put_scores(
        self, event_id: str, participant_id: str, participant_key: str, scores: list[ScoreItem]
    ) -> None:
        participant = self.get_participant(event_id, participant_id)
        if participant is None:
            raise KeyError("participant not found")
        if participant.participant_key != participant_key:
            raise PermissionError("invalid participant key")

        with self._table.batch_writer() as batch:
            for item in scores:
                batch.put_item(
                    Item={
                        "pk": f"EVENT#{event_id}",
                        "sk": f"SCORE#{participant_id}#{item.entry_id}",
                        "score": int(item.score),
                    }
                )

    def list_scores_by_participant(self, event_id: str) -> dict[str, dict[str, int]]:
        resp = self._table.query(
            KeyConditionExpression=Key("pk").eq(f"EVENT#{event_id}")
            & Key("sk").begins_with("SCORE#")
        )
        items = resp.get("Items", [])
        result: dict[str, dict[str, int]] = defaultdict(dict)
        for it in items:
            # sk: SCORE#{participant_id}#{entry_id}
            _score, participant_id, entry_id = it["sk"].split("#", 2)
            result[participant_id][entry_id] = int(it.get("score", 0))
        return dict(result)


def build_store() -> Store:
    kind = os.environ.get("STORE_BACKEND", "inmemory").strip().lower()
    if kind == "dynamodb":
        return DynamoDBStore.from_env()
    return InMemoryStore.create()


def _now() -> datetime:
    return datetime.now(timezone.utc)
