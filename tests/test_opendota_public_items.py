from __future__ import annotations

import json
from pathlib import Path

from scripts.fetch.fetch_opendota_public_items import (
    FINAL_ITEM_FIELDS,
    _normalise_match,
)


ROOT = Path(__file__).resolve().parents[1]


def test_public_item_normalizer_keeps_only_final_six_slots() -> None:
    match = {
        "match_id": 123,
        "start_time": 1_750_000_000,
        "duration": 2400,
        "radiant_win": True,
        "patch": 60,
        "leagueid": 0,
        "players": [
            {
                "account_id": 999,
                "personaname": "must not be exported",
                "player_slot": 0,
                "hero_id": 2,
                "leaver_status": 0,
                "item_0": 1,
                "item_1": 2,
                "item_2": 0,
                "item_3": 0,
                "item_4": 0,
                "item_5": 0,
                "backpack_0": 3,
                "item_neutral": 4,
                "level": 20,
                "net_worth": 18000,
            }
        ],
    }
    rows, counters = _normalise_match(
        match,
        {"match_id": 123, "avg_rank_tier": 75},
        {2: "axe"},
        {1: "item_blink", 2: "item_boots", 3: "item_bkb", 4: "item_neutral"},
        {60: "7.41"},
    )
    assert FINAL_ITEM_FIELDS == tuple(f"item_{index}" for index in range(6))
    assert counters["players"] == 1
    assert rows[0]["f"] == ["item_blink", "item_boots"]
    assert rows[0]["n"] == "匿名公开局玩家"
    assert "account_id" not in rows[0]
    assert rows[0]["r"] is None
    assert rows[0]["src"] == "opendota"


def test_public_item_normalizer_excludes_leavers_and_league_matches() -> None:
    base = {
        "match_id": 456,
        "start_time": 1_750_000_000,
        "duration": 1800,
        "radiant_win": False,
        "patch": 60,
        "players": [{"player_slot": 128, "hero_id": 2, "leaver_status": 2}],
    }
    rows, counters = _normalise_match(
        {**base, "leagueid": 0},
        {"match_id": 456, "avg_rank_tier": 80},
        {2: "axe"},
        {},
        {60: "7.41"},
    )
    assert rows == []
    assert counters["leavers"] == 1

    rows, _ = _normalise_match(
        {**base, "leagueid": 999, "players": [{"player_slot": 128, "hero_id": 2}]},
        {"match_id": 456},
        {2: "axe"},
        {},
        {60: "7.41"},
    )
    assert rows == []


def test_checked_in_public_sample_is_anonymous_and_deduplicated() -> None:
    payload = json.loads(
        (ROOT / "data" / "opendota_public_items.json").read_text(encoding="utf-8")
    )
    assert payload["schema"] == "opendota-public-items-v1"
    assert payload["meta"]["sampled"] is True
    assert payload["meta"]["min_rank"] == 70
    assert payload["meta"]["position_available"] is False
    assert payload["records"]
    keys = {(row["m"], row["sl"]) for row in payload["records"]}
    assert len(keys) == len(payload["records"])
    assert all(row["n"] == "匿名公开局玩家" for row in payload["records"])
    assert all("account_id" not in row and "steamid" not in row for row in payload["records"])
    assert all(isinstance(row.get("f"), list) and len(row["f"]) <= 6 for row in payload["records"])
