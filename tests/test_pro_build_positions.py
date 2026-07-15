from collections import Counter

from scripts.fetch.fetch_pro_builds import (
    STEAM64_ACCOUNT_BASE,
    _apply_opendota_lane_fallback,
    _assign_positions,
    _deduplicate_rows,
    _load_replay_item_mapping,
    _mapped_inventory,
    _parse_opendota_lane_roles,
    _parse_opendota_ability_route,
    _team_lane_shapes,
)


def test_replay_inventory_names_use_local_versioned_aliases() -> None:
    valid = {
        "item_blink", "item_black_king_bar", "item_power_treads",
        "item_branches", "item_ultimate_scepter", "item_tpscroll",
    }
    unresolved = Counter()
    mapped = _mapped_inventory(
        ["BlinkDagger", "Black_King_Bar", "PowerTreads", "IronwoodBranch",
         "UltimateScepter", "TeleportScroll_1"],
        _load_replay_item_mapping(valid),
        valid,
        unresolved,
    )
    assert mapped == [
        "item_blink", "item_black_king_bar", "item_power_treads",
        "item_branches", "item_ultimate_scepter",
    ]
    assert not unresolved


def test_players_are_deduplicated_by_match_and_slot_not_steamid() -> None:
    rows = _deduplicate_rows(
        [
            (10, 3, 111, "axe"),
            (10, 3, 222, "axe"),
            (10, 4, 333, "sven"),
        ],
        table="players",
        columns=("match_id", "slot", "steamid", "hero_name"),
    )
    assert len(rows) == 2
    assert {(row[0], row[1]) for row in rows} == {(10, 3), (10, 4)}


def test_combat_rows_are_deduplicated_after_fetch_by_match_and_log_index() -> None:
    rows = _deduplicate_rows(
        [
            (10, 100, 7, "DOTA_COMBATLOG_ITEM", "item_blink"),
            (10, 100, 7, "DOTA_COMBATLOG_ITEM", "item_blink"),
            (10, 101, 8, "DOTA_COMBATLOG_ITEM", "item_bkb"),
        ],
        table="combat_logs",
        columns=("match_id", "time", "log_index", "type", "inflictor"),
    )
    assert len(rows) == 2


def _rows(lanes):
    return [
        (19785, "Team", str(index), f"p{index}", hits, lane)
        for index, (hits, lane) in enumerate(zip((50, 40, 30, 20, 10), lanes), 1)
    ]


def test_incomplete_lanes_are_detected_before_hits_fallback() -> None:
    rows = _rows((1, None, 2, 3, 3))
    assert _team_lane_shapes(rows)[(19785, "team")] == (1, 1, 2)
    roles, stats = _assign_positions(rows)
    assert stats["teams_hits_fallback"] == 1
    assert {value["method"] for value in roles.values()} == {"hits"}


def test_null_league_or_team_rows_are_ignored() -> None:
    rows = _rows((1, 1, 2, 3, 3)) + [
        (None, "Team", "missing-league", "x", 1, 1),
        (19785, None, "missing-team", "x", 1, 1),
    ]
    assert _team_lane_shapes(rows) == {(19785, "team"): (2, 1, 2)}


def test_complete_212_lanes_use_lane_and_cs_assignment() -> None:
    rows = _rows((1, 1, 2, 3, 3))
    roles, stats = _assign_positions(rows)
    assert stats["teams_lane_212"] == 1
    assert stats["teams_lanes"] == 1
    assert {value["method"] for value in roles.values()} == {"lanes"}
    assert roles[(19785, "team", "1")]["position"] == 1
    assert roles[(19785, "team", "2")]["position"] == 5
    assert roles[(19785, "team", "3")]["position"] == 2
    assert roles[(19785, "team", "4")]["position"] == 3
    assert roles[(19785, "team", "5")]["position"] == 4


def _rich_rows(lanes):
    return [
        {
            "match_id": 100,
            "league_id": 19785,
            "team_name": "id:42",
            "steamid": str(index),
            "nickname": f"p{index}",
            "hits": hits,
            "lane_role": lane,
            "lane_source": "dwd" if lane is not None else "missing",
            "hits_source": "dwd_hits_5m",
        }
        for index, (hits, lane) in enumerate(
            zip((50, 40, 30, 20, 10), lanes), 1
        )
    ]


def test_opendota_lanes_are_adopted_only_when_they_recover_212() -> None:
    rows = _rich_rows((1, None, 2, 3, 3))
    recovered, stats = _apply_opendota_lane_fallback(
        rows,
        {100: {"1": 1, "2": 1, "3": 2, "4": 3, "5": 3}},
    )
    assert stats["recovered_212_teams"] == 1
    assert stats["adopted_lane_rows"] == 5
    roles, assign_stats = _assign_positions(recovered)
    assert assign_stats["teams_lanes_opendota"] == 1
    assert {value["method"] for value in roles.values()} == {"lanes_opendota"}


def test_opendota_lanes_do_not_replace_dwd_when_212_is_not_recovered() -> None:
    rows = _rich_rows((1, None, 2, 3, 3))
    unchanged, stats = _apply_opendota_lane_fallback(
        rows,
        {100: {"1": 1, "2": 2, "3": 2, "4": 3, "5": 3}},
    )
    assert stats["recovered_212_teams"] == 0
    assert [row["lane_role"] for row in unchanged] == [1, None, 2, 3, 3]
    roles, assign_stats = _assign_positions(unchanged)
    assert assign_stats["teams_hits_fallback"] == 1
    assert {value["method"] for value in roles.values()} == {"hits"}


def test_top_five_with_missing_hits_is_not_assigned() -> None:
    rows = _rich_rows((1, 1, 2, 3, 3))
    rows[2]["hits"] = None
    rows[2]["hits_source"] = "missing"
    roles, stats = _assign_positions(rows)
    assert not roles
    assert stats["teams_missing_hits"] == 1


def test_opendota_account_ids_are_converted_to_steam64() -> None:
    roles = _parse_opendota_lane_roles(
        {
            "players": [
                {"account_id": 111620041, "lane_role": 1},
                {"account_id": 210053851, "lane_role": 2},
                {"account_id": None, "lane_role": 3},
                {"account_id": 5, "lane_role": 4},
            ]
        }
    )
    assert roles == {
        str(STEAM64_ACCOUNT_BASE + 111620041): 1,
        str(STEAM64_ACCOUNT_BASE + 210053851): 2,
    }


def test_opendota_ability_ids_become_ordered_rank_rows() -> None:
    route = _parse_opendota_ability_route(
        {
            "players": [
                {"hero_id": 106, "ability_upgrades_arr": [5605, 5604, 5605, 730]},
                {"hero_id": 1, "ability_upgrades_arr": [5003]},
            ]
        },
        106,
        {
            5605: "ember_spirit_flame_guard",
            5604: "ember_spirit_searing_chains",
            730: "special_bonus_attributes",
        },
    )
    assert route == [
        [1, "ember_spirit_flame_guard", 1],
        [2, "ember_spirit_searing_chains", 1],
        [3, "ember_spirit_flame_guard", 2],
        [4, "special_bonus_attributes", 1],
    ]
