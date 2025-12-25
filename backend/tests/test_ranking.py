from __future__ import annotations

from m1.domain import Entry, Participant
from m1.ranking import compute_overall, compute_per_participant


def test_compute_overall_competition_ranking():
    """合計点の同点を(1,1,3)の順位ルールで同順位にする。"""

    entries = [
        Entry(id="a", name="A"),
        Entry(id="b", name="B"),
        Entry(id="c", name="C"),
    ]
    scores_by_participant = {
        "p1": {"a": 10, "b": 5},
        "p2": {"a": 0, "b": 5, "c": 0},
    }

    overall = compute_overall(entries, scores_by_participant)
    # totals: a=10, b=10, c=0 -> ranks: 1,1,3
    assert [r.total_score for r in overall] == [10, 10, 0]
    assert {r.entry_id: r.rank for r in overall} == {"a": 1, "b": 1, "c": 3}


def test_compute_per_participant_ranking_defaults_to_zero():
    """未入力の採点は0点として順位計算する。"""

    entries = [Entry(id="a", name="A"), Entry(id="b", name="B")]
    participants = [Participant(id="p1", name="X", participant_key="k")]
    scores_by_participant = {"p1": {"a": 3}}

    per = compute_per_participant(entries, participants, scores_by_participant)
    assert len(per) == 1
    rows = per[0].rankings
    assert [r.entry_id for r in rows] == ["a", "b"]
    assert [r.score for r in rows] == [3, 0]
    assert [r.rank for r in rows] == [1, 2]
