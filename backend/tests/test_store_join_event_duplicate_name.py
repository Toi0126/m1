from __future__ import annotations

import pytest

from m1.store import InMemoryStore


def test_join_event_rejects_duplicate_participant_name_within_event():
    """同一イベント内で同名の参加者がいる場合は参加を弾く。"""

    store = InMemoryStore.create()
    event = store.create_event("t", ["A"])

    store.join_event(event.id, "  たろう  ")

    with pytest.raises(ValueError):
        store.join_event(event.id, "たろう")


def test_join_event_allows_same_name_in_different_events():
    """別イベントなら同名参加者でも参加できる。"""

    store = InMemoryStore.create()
    event1 = store.create_event("t1", ["A"])
    event2 = store.create_event("t2", ["A"])

    store.join_event(event1.id, "たろう")
    store.join_event(event2.id, "たろう")
