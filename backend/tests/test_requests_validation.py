from __future__ import annotations

import pytest
from pydantic import ValidationError

from m1.domain import CreateEventRequest, JoinEventRequest


def test_create_event_request_rejects_blank_title():
    """イベントタイトルが空白のみの場合は弾く。"""

    with pytest.raises(ValidationError):
        CreateEventRequest(title="   ", entries=["A"])


def test_create_event_request_filters_blank_entries_and_requires_one():
    """採点対象は空白行を除外し、結果が空なら弾く。"""

    req = CreateEventRequest(title="t", entries=[" A ", "", "  ", "B"])
    assert req.entries == ["A", "B"]

    with pytest.raises(ValidationError):
        CreateEventRequest(title="t", entries=[" ", "\n\t "])


def test_join_event_request_rejects_blank_name():
    """参加者名が空白のみの場合は弾く。"""

    with pytest.raises(ValidationError):
        JoinEventRequest(name="  ")
