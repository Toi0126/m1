from __future__ import annotations

from collections import defaultdict

from .domain import Entry, OverallRow, Participant, ParticipantResult, RankingRow


def dense_rank_desc(pairs: list[tuple[str, int]]) -> dict[str, int]:
    """スコア降順のDense Rankingを返す。

    同点は同順位、次順位は1つだけ進む（例: 1,1,2）。
    """

    sorted_pairs = sorted(pairs, key=lambda x: (-x[1], x[0]))
    ranks: dict[str, int] = {}
    last_score: int | None = None
    current_rank = 0

    for entry_id, score in sorted_pairs:
        if last_score is None or score != last_score:
            current_rank += 1
            last_score = score
        ranks[entry_id] = current_rank

    return ranks


def compute_per_participant(
    entries: list[Entry],
    participants: list[Participant],
    scores_by_participant: dict[str, dict[str, int]],
) -> list[ParticipantResult]:
    results: list[ParticipantResult] = []
    entry_name = {e.id: e.name for e in entries}

    for participant in sorted(participants, key=lambda p: p.name):
        score_map = scores_by_participant.get(participant.id, {})
        pairs = [(e.id, int(score_map.get(e.id, 0))) for e in entries]
        ranks = dense_rank_desc(pairs)
        rows = [
            RankingRow(
                entry_id=eid,
                entry_name=entry_name[eid],
                score=score,
                rank=ranks[eid],
            )
            for eid, score in sorted(pairs, key=lambda x: (-x[1], x[0]))
        ]
        results.append(
            ParticipantResult(
                participant_id=participant.id,
                participant_name=participant.name,
                rankings=rows,
            )
        )

    return results


def compute_overall(entries: list[Entry], scores_by_participant: dict[str, dict[str, int]]) -> list[OverallRow]:
    totals: dict[str, int] = defaultdict(int)
    for _pid, score_map in scores_by_participant.items():
        for entry_id, score in score_map.items():
            totals[entry_id] += int(score)

    pairs = [(e.id, int(totals.get(e.id, 0))) for e in entries]
    ranks = dense_rank_desc(pairs)
    entry_name = {e.id: e.name for e in entries}

    rows = [
        OverallRow(
            entry_id=eid,
            entry_name=entry_name[eid],
            total_score=total,
            rank=ranks[eid],
        )
        for eid, total in sorted(pairs, key=lambda x: (-x[1], x[0]))
    ]
    return rows
