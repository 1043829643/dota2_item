from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from scripts.fetch.fetch_opendota_public_items import (
    ALL_DRAFT_GAME_MODE,
    COHORT_IMMORTAL_DIVINE,
    COHORT_PURE_IMMORTAL,
    BACKPACK_ITEM_FIELDS,
    FINAL_ITEM_FIELDS,
    MAIN_ITEM_FIELDS,
    OPENDOTA_HIGHEST_AVG_BUCKET,
    RANKED_LOBBY_TYPE,
    REQUESTED_IMMORTAL_RANK,
    _candidate_sql,
    _connect,
    _normalise_match,
    _rank_cohort,
    parse_args,
)


ROOT = Path(__file__).resolve().parents[1]


def test_public_item_normalizer_preserves_fixed_main_and_backpack_slots() -> None:
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
                "backpack_1": 0,
                "backpack_2": 5,
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
        {
            1: "item_blink",
            2: "item_boots",
            3: "item_bkb",
            4: "item_neutral",
            5: "item_ghost",
        },
        {60: "7.41"},
    )
    assert MAIN_ITEM_FIELDS == tuple(f"item_{index}" for index in range(6))
    assert FINAL_ITEM_FIELDS == MAIN_ITEM_FIELDS  # v3 callers keep their public alias.
    assert BACKPACK_ITEM_FIELDS == tuple(f"backpack_{index}" for index in range(3))
    assert counters["players"] == 1
    assert rows[0]["f"] == ["item_blink", "item_boots", None, None, None, None]
    assert rows[0]["b"] == ["item_bkb", None, "item_ghost"]
    assert "item_neutral" not in rows[0]["f"] + rows[0]["b"]
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


def test_highest_rank_query_is_ranked_all_draft_and_has_rank_coverage() -> None:
    args = parse_args([])
    sql = _candidate_sql(None, args, 100)
    assert f"avg_rank_tier = {OPENDOTA_HIGHEST_AVG_BUCKET}" in sql
    assert f"num_rank_tier >= {args.min_ranked_players}" in sql
    assert f"lobby_type = {RANKED_LOBBY_TYPE}" in sql
    assert f"game_mode = {ALL_DRAFT_GAME_MODE}" in sql
    assert "duration >= 600" in sql
    assert args.target_matches == 100_000


def test_rank_cohort_classification_is_mutually_exclusive() -> None:
    all_immortal = {"players": [{"rank_tier": 80} for _ in range(10)]}
    assert _rank_cohort(all_immortal) == (COHORT_PURE_IMMORTAL, "")
    mixed = {"players": [{"rank_tier": 80} for _ in range(9)] + [{"rank_tier": 75}]}
    assert _rank_cohort(mixed) == (COHORT_IMMORTAL_DIVINE, "")
    mixed_low_divine = {
        "players": [{"rank_tier": 80}] + [{"rank_tier": 70} for _ in range(9)]
    }
    assert _rank_cohort(mixed_low_divine) == (COHORT_IMMORTAL_DIVINE, "")
    all_divine = {"players": [{"rank_tier": 75} for _ in range(10)]}
    cohort, reason = _rank_cohort(all_divine)
    assert cohort is None and "75" in reason
    lower = {"players": [{"rank_tier": 80} for _ in range(9)] + [{"rank_tier": 69}]}
    cohort, reason = _rank_cohort(lower)
    assert cohort is None and "69" in reason
    invalid_gap = {
        "players": [{"rank_tier": 80} for _ in range(9)] + [{"rank_tier": 76}]
    }
    assert _rank_cohort(invalid_gap)[0] is None
    missing = {"players": [{"rank_tier": 80} for _ in range(9)] + [{"rank_tier": None}]}
    cohort, reason = _rank_cohort(missing)
    assert cohort is None and "missing=1" in reason
    short = {"players": [{"rank_tier": 80} for _ in range(9)]}
    cohort, reason = _rank_cohort(short)
    assert cohort is None and "missing=1" in reason


def test_old_strict_database_migrates_only_valid_mixed_rejections(tmp_path: Path) -> None:
    path = tmp_path / "old.sqlite3"
    connection = sqlite3.connect(path)
    connection.execute(
        """
        CREATE TABLE matches (
          match_id INTEGER PRIMARY KEY, match_seq_num INTEGER, radiant_win INTEGER,
          start_time INTEGER NOT NULL, date TEXT, duration INTEGER NOT NULL,
          lobby_type INTEGER NOT NULL, game_mode INTEGER NOT NULL,
          avg_rank_tier REAL NOT NULL, num_rank_tier INTEGER NOT NULL, cluster INTEGER,
          patch TEXT, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT, updated_at TEXT
        )
        """
    )
    base = (1_750_000_000, 1800, 7, 22, 75, 10)
    connection.execute(
        "INSERT INTO matches(match_id,start_time,duration,lobby_type,game_mode,avg_rank_tier,num_rank_tier,status) VALUES(?,?,?,?,?,?,?,'accepted')",
        (1, *base),
    )
    errors = {
        2: "not all players are Immortal (visible=10, missing=0, ranks={75: 1, 80: 9})",
        3: "not all players are Immortal (visible=9, missing=1, ranks={75: 1, 80: 8})",
        4: "match does not have ten eligible players (kept=9, leavers=1, unknown_heroes=0)",
    }
    for match_id, error in errors.items():
        connection.execute(
            "INSERT INTO matches(match_id,start_time,duration,lobby_type,game_mode,avg_rank_tier,num_rank_tier,status,attempts,last_error) VALUES(?,?,?,?,?,?,?,'rejected',1,?)",
            (match_id, *base, error),
        )
    connection.commit()
    connection.close()

    migrated = _connect(path)
    rows = {
        row["match_id"]: (
            row["status"],
            row["cohort"],
            row["last_error"],
            row["inventory_version"],
        )
        for row in migrated.execute(
            "SELECT match_id,status,cohort,last_error,inventory_version FROM matches"
        )
    }
    # Historical six-slot rows remain accepted locally, but version 1 keeps
    # their unknown backpack state out of the v4 browser export until backfill.
    assert rows[1] == ("accepted", COHORT_PURE_IMMORTAL, None, 1)
    assert rows[2] == ("pending", None, None, 2)
    assert rows[3][0] == "rejected"
    assert rows[4][0] == "rejected"
    migrated.close()
    # The migration is idempotent and must not reclassify unrelated rejections.
    reopened = _connect(path)
    assert reopened.execute("SELECT status FROM matches WHERE match_id=2").fetchone()[0] == "pending"
    reopened.close()


def test_database_rejects_accepted_match_with_empty_final_inventory(
    tmp_path: Path,
) -> None:
    path = tmp_path / "empty-inventory.sqlite3"
    connection = _connect(path)
    connection.execute(
        """
        INSERT INTO matches(
          match_id,start_time,duration,lobby_type,game_mode,avg_rank_tier,
          num_rank_tier,cohort,status
        ) VALUES(1,1750000000,1800,7,22,75,10,?,'accepted')
        """,
        (COHORT_PURE_IMMORTAL,),
    )
    connection.execute(
        "INSERT INTO players(match_id,player_slot,hero,hero_id,win,rank_tier) "
        "VALUES(1,0,'axe',2,1,80)"
    )
    connection.commit()
    connection.close()

    migrated = _connect(path)
    row = migrated.execute(
        "SELECT status,cohort,last_error FROM matches WHERE match_id=1"
    ).fetchone()
    assert row["status"] == "rejected"
    assert row["cohort"] is None
    assert "empty final inventories" in row["last_error"]
    assert migrated.execute(
        "SELECT count(*) FROM players WHERE match_id=1"
    ).fetchone()[0] == 0
    migrated.close()


def test_database_schema_and_quality_rule_include_backpack_slots(tmp_path: Path) -> None:
    path = tmp_path / "backpack-inventory.sqlite3"
    connection = _connect(path)
    columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(players)")
    }
    assert set(BACKPACK_ITEM_FIELDS) <= columns
    connection.execute(
        """
        INSERT INTO matches(
          match_id,start_time,duration,lobby_type,game_mode,avg_rank_tier,
          num_rank_tier,cohort,status,inventory_version
        ) VALUES(1,1750000000,1800,7,22,75,10,?,'accepted',2)
        """,
        (COHORT_PURE_IMMORTAL,),
    )
    connection.execute(
        "INSERT INTO players(match_id,player_slot,hero,hero_id,win,rank_tier,backpack_0) "
        "VALUES(1,0,'axe',2,1,80,'item_blink')"
    )
    connection.commit()
    connection.close()

    reopened = _connect(path)
    row = reopened.execute(
        "SELECT status,cohort FROM matches WHERE match_id=1"
    ).fetchone()
    assert tuple(row) == ("accepted", COHORT_PURE_IMMORTAL)
    assert reopened.execute(
        "SELECT backpack_0 FROM players WHERE match_id=1"
    ).fetchone()[0] == "item_blink"
    reopened.close()


def test_checked_in_public_manifest_has_separate_rank_cohorts() -> None:
    payload = json.loads(
        (ROOT / "data" / "opendota_public_items.json").read_text(encoding="utf-8")
    )
    assert payload["schema"] == "opendota-public-items-manifest-v4"
    assert payload["meta"]["sampled"] is True
    assert payload["meta"]["requested_rank"] == REQUESTED_IMMORTAL_RANK
    assert payload["meta"]["opendota_avg_rank_tier"] == OPENDOTA_HIGHEST_AVG_BUCKET
    assert payload["meta"]["required_visible_rank_players"] == 10
    assert "required_immortal_players" not in payload["meta"]
    assert set(payload["meta"]["cohorts"]) == {
        COHORT_PURE_IMMORTAL,
        COHORT_IMMORTAL_DIVINE,
    }
    assert payload["meta"]["matches"] == sum(
        cohort["matches"] for cohort in payload["meta"]["cohorts"].values()
    )
    assert payload["meta"]["records"] == sum(
        cohort["records"] for cohort in payload["meta"]["cohorts"].values()
    )
    assert payload["meta"]["min_ranked_players"] >= 5
    assert payload["meta"]["lobby_type"] == RANKED_LOBBY_TYPE
    assert payload["meta"]["game_mode"] == ALL_DRAFT_GAME_MODE
    assert payload["meta"]["target_matches"] == 100_000
    assert payload["meta"]["position_available"] is False
    assert payload["meta"]["includes_backpack"] is True
    assert payload["meta"]["includes_neutral_items"] is False
    assert payload["meta"]["main_inventory_fields"] == list(MAIN_ITEM_FIELDS)
    assert payload["meta"]["backpack_fields"] == list(BACKPACK_ITEM_FIELDS)
    assert payload["meta"]["final_inventory_fields"] == list(
        MAIN_ITEM_FIELDS + BACKPACK_ITEM_FIELDS
    )
    assert payload["meta"]["empty_item_index"] == -1
    assert payload["meta"]["backpack_backfill_pending"] >= 0
    assert payload["meta"]["backpack_complete"] is (
        payload["meta"]["backpack_backfill_pending"] == 0
    )
    assert payload["heroes"]
    match_cohorts: dict[int, set[int]] = {}
    for hero, summary in payload["heroes"].items():
        assert set(summary["cohorts"]) == {
            COHORT_PURE_IMMORTAL,
            COHORT_IMMORTAL_DIVINE,
        }
        assert summary["matches"] == sum(
            cohort["matches"] for cohort in summary["cohorts"].values()
        )
        assert summary["records"] == sum(
            cohort["records"] for cohort in summary["cohorts"].values()
        )
        shard_path = ROOT / summary["url"]
        shard = json.loads(shard_path.read_text(encoding="utf-8"))
        assert shard["schema"] == "opendota-public-hero-v4"
        assert shard["hero"] == hero
        assert shard["record_fields"][9:] == [
            "main_slots",
            "backpack_slots",
            "cohort_code",
        ]
        assert shard["main_inventory_fields"] == list(MAIN_ITEM_FIELDS)
        assert shard["backpack_fields"] == list(BACKPACK_ITEM_FIELDS)
        assert shard["empty_item_index"] == -1
        keys = {(row[0], row[3]) for row in shard["records"]}
        assert len(keys) == len(shard["records"])
        assert all(
            len(row) == 12
            and len(row[9]) == 6
            and len(row[10]) == 3
            and row[11] in {0, 1}
            for row in shard["records"]
        )
        item_count = len(shard["dictionaries"]["item"])
        assert all(
            all(index == -1 or 0 <= index < item_count for index in row[9] + row[10])
            for row in shard["records"]
        )
        assert shard["meta"]["cohorts"][COHORT_PURE_IMMORTAL]["records"] == sum(
            row[11] == 0 for row in shard["records"]
        )
        assert shard["meta"]["cohorts"][COHORT_IMMORTAL_DIVINE]["records"] == sum(
            row[11] == 1 for row in shard["records"]
        )
        for row in shard["records"]:
            match_cohorts.setdefault(int(row[0]), set()).add(int(row[11]))
        assert "account_id" not in shard and "steamid" not in shard
    assert all(len(cohorts) == 1 for cohorts in match_cohorts.values())
