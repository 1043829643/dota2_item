"""Build the static professional item-build dataset from StarRocks.

The generated site is static and never connects to StarRocks in a browser.
Credentials are read from environment variables and are not persisted:

    STARROCKS_HOST
    STARROCKS_PORT       (default: 9030)
    STARROCKS_USER
    STARROCKS_PASSWORD

Output:
    data/pro_builds.json         compact index used by all filters
    data/pro_builds_detail.json  snapshots, skill builds, draft and match events
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pymysql


ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get("PRO_BUILDS_OUT", ROOT / "data" / "pro_builds.json"))
DETAIL_OUT = Path(
    os.environ.get(
        "PRO_BUILDS_DETAIL_OUT", ROOT / "data" / "pro_builds_detail.json"
    )
)
MATCH_BATCH_SIZE = 400


def _env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None or value == "":
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def _connect():
    return pymysql.connect(
        host=_env("STARROCKS_HOST"),
        port=int(_env("STARROCKS_PORT", "9030")),
        user=_env("STARROCKS_USER"),
        password=_env("STARROCKS_PASSWORD"),
        connect_timeout=15,
        read_timeout=600,
        charset="utf8mb4",
    )


def _str_date(value) -> str:
    if isinstance(value, (date, datetime)):
        return value.strftime("%Y-%m-%d")
    return str(value or "")[:10]


def _display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def _date_bounds() -> tuple[str, str]:
    """Return the explicitly bounded export window used by every fact query."""
    today = datetime.now().date()
    date_to = os.environ.get("PRO_BUILDS_DATE_TO", today.isoformat())
    date_from = os.environ.get(
        "PRO_BUILDS_DATE_FROM", (today - timedelta(days=365)).isoformat()
    )
    try:
        start = date.fromisoformat(date_from)
        end = date.fromisoformat(date_to)
    except ValueError as exc:
        raise SystemExit(f"Invalid PRO_BUILDS_DATE_FROM/TO: {exc}") from exc
    if start > end:
        raise SystemExit("PRO_BUILDS_DATE_FROM must not be after PRO_BUILDS_DATE_TO")
    return start.isoformat(), end.isoformat()


def _batches(values, size: int = MATCH_BATCH_SIZE):
    values = list(values)
    for offset in range(0, len(values), size):
        yield values[offset:offset + size]


def _id_sql(values) -> str:
    """Render already-normalized numeric match IDs for an IN predicate."""
    return ",".join(str(int(value)) for value in values)


def _varchar_id_sql(values) -> str:
    """Render numeric match IDs as varchar literals without implicit casts."""
    return ",".join(f"'{int(value)}'" for value in values)


def _varchar_sql(values) -> str:
    """Render trusted dimension values as escaped varchar literals."""
    return ",".join(f"'{str(value).replace(chr(39), chr(39) * 2)}'" for value in values)


def _partition_batches(match_ids, partition_date_by_match: dict[int, str]):
    """Yield one physical dt partition and one bounded match-ID batch at a time."""
    grouped: dict[str, list[int]] = defaultdict(list)
    for match_id in match_ids:
        partition_date = partition_date_by_match.get(int(match_id))
        if partition_date:
            grouped[partition_date].append(int(match_id))
    for partition_date in sorted(grouped):
        for batch in _batches(sorted(grouped[partition_date])):
            yield partition_date, batch


def _load_item_ids() -> set[str]:
    sys.path.insert(0, str(ROOT))
    from builders.hero_lab import _load_items, _versions

    return {row["id"] for row in _load_items(_versions()[-1])}


def _parse_items(raw) -> list[str]:
    if isinstance(raw, list):
        return [str(v) for v in raw]
    try:
        data = json.loads(raw or "[]")
        return [str(v) for v in data] if isinstance(data, list) else []
    except (TypeError, ValueError, json.JSONDecodeError):
        return []


def _team_key(value) -> str:
    return " ".join(str(value or "").split()).casefold()


def _hero_name(value) -> str:
    return str(value or "").replace("npc_dota_hero_", "")


def _round_number(value, digits: int = 1):
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def _avg(values: list[int]) -> float | None:
    return sum(values) / len(values) if values else None


def _assign_positions(raw_rows: list[tuple]) -> tuple[dict, dict]:
    """Aggregate per-match lane/CS rows and assign Dota positions 1–5.

    This intentionally never uses ``players.slot``. Standard 2-1-2 lanes are
    resolved by lane_role and within-lane average CS. Irregular lanes fall back
    to descending average CS, matching the league-import algorithm supplied by
    the user.
    """
    teams: dict[tuple[int, str], dict[str, dict]] = defaultdict(dict)
    for league_id, team_name, steamid, nickname, hits, lane_role in raw_rows:
        if league_id is None or not team_name or steamid is None:
            continue
        team = (int(league_id), _team_key(team_name))
        steam = str(steamid)
        player = teams[team].setdefault(
            steam,
            {"count": 0, "hits": [], "lanes": Counter(), "names": Counter()},
        )
        player["count"] += 1
        if hits is not None:
            try:
                player["hits"].append(int(hits))
            except (TypeError, ValueError):
                pass
        if lane_role is not None:
            try:
                player["lanes"][int(lane_role)] += 1
            except (TypeError, ValueError):
                pass
        if nickname:
            player["names"][str(nickname)] += 1

    roles: dict[tuple[int, str, str], dict] = {}
    stats = Counter()
    for (league_id, team_name), player_map in teams.items():
        players = []
        for steam, agg in player_map.items():
            avg_hits = _avg(agg["hits"])
            lane_role = None
            lane_share = 0.0
            if agg["lanes"]:
                lane_role, lane_count = sorted(
                    agg["lanes"].items(), key=lambda row: (-row[1], row[0])
                )[0]
                lane_share = lane_count / sum(agg["lanes"].values())
            players.append(
                {
                    "steam": steam,
                    "count": agg["count"],
                    "avg_hits": avg_hits,
                    "lane": lane_role,
                    "lane_share": lane_share,
                }
            )
        players.sort(
            key=lambda p: (
                -p["count"],
                -(p["avg_hits"] if p["avg_hits"] is not None else -1),
                p["steam"],
            )
        )
        top5 = players[:5]
        if len(top5) < 5:
            stats["teams_under_five"] += 1
            continue
        if any(player["avg_hits"] is None for player in top5):
            stats["teams_missing_hits"] += 1
            continue

        adv = [p for p in top5 if p["lane"] == 1]
        mid = [p for p in top5 if p["lane"] == 2]
        hard = [p for p in top5 if p["lane"] == 3]
        assigned: list[tuple[dict, int]] = []
        if len(adv) == 2 and len(mid) == 1 and len(hard) == 2:
            adv.sort(key=lambda p: (-p["avg_hits"], p["steam"]))
            hard.sort(key=lambda p: (-p["avg_hits"], p["steam"]))
            assigned = [(adv[0], 1), (mid[0], 2), (hard[0], 3), (hard[1], 4), (adv[1], 5)]
            method = "lanes"
            confidence = sum(p["lane_share"] for p in top5) / 5
            stats["teams_lane_212"] += 1
        else:
            ordered = sorted(top5, key=lambda p: (-p["avg_hits"], p["steam"]))
            assigned = list(zip(ordered, (1, 2, 3, 4, 5)))
            method = "hits"
            confidence = 0.5
            stats["teams_hits_fallback"] += 1

        for player, position in assigned:
            roles[(league_id, team_name, player["steam"])] = {
                "position": position,
                "method": method,
                "confidence": round(confidence, 3),
                "games": player["count"],
                "avg_hits": round(player["avg_hits"], 2),
                "lane_role": player["lane"],
            }
    stats["teams_total"] = len(teams)
    stats["players_assigned"] = len(roles)
    return roles, dict(stats)


def _load_positions(
    cur, league_by_match: dict[int, int], partition_date_by_match: dict[int, str]
) -> tuple[dict, dict, dict]:
    """Load only scoped matches; partitioned fallback reads always prune by dt."""
    primary_rows = []
    scoped_ids = sorted(league_by_match)
    for batch in _batches(scoped_ids):
        cur.execute(
            f"""
            SELECT mo.league_id,
                   CASE WHEN mp.team = 2 THEN mo.team_name_1
                        WHEN mp.team = 3 THEN mo.team_name_2 END AS team_name,
                   mp.steamid, mp.name, mp.hits_5m, mp.lane_role
            FROM dwd_dota2.dwd_match_player_positions mp
            INNER JOIN dwd_dota2.dwd_match_overview mo ON mo.match_id = mp.match_id
            WHERE mp.match_id IN ({_id_sql(batch)})
              AND mo.league_id IS NOT NULL
            """
        )
        primary_rows.extend(cur.fetchall())
    primary_leagues = {int(row[0]) for row in primary_rows if row[0] is not None}

    all_leagues = {value for value in league_by_match.values() if value}
    missing_leagues = sorted(all_leagues - primary_leagues)
    fallback_rows = []
    if missing_leagues:
        fallback_match_ids = [
            match_id for match_id, league_id in league_by_match.items()
            if league_id in set(missing_leagues)
        ]
        for partition_date, batch in _partition_batches(
            fallback_match_ids, partition_date_by_match
        ):
            ids = _varchar_id_sql(batch)
            cur.execute(
                f"""
                WITH p AS (
                  SELECT match_id, slot, steamid, persona, team
                  FROM (
                    SELECT match_id, slot, steamid, persona, team,
                           ROW_NUMBER() OVER (
                             PARTITION BY match_id, slot, steamid ORDER BY team DESC
                           ) AS rn
                    FROM dota2_analysis.players
                    WHERE match_id IN ({ids})
                  ) x WHERE rn = 1
                ), i AS (
                  SELECT match_id, radiant_team_tag, dire_team_tag
                  FROM (
                    SELECT match_id, radiant_team_tag, dire_team_tag,
                           ROW_NUMBER() OVER (
                             PARTITION BY match_id ORDER BY end_time DESC
                           ) AS rn
                    FROM dota2_analysis.match_info
                    WHERE match_id IN ({ids})
                  ) x WHERE rn = 1
                ), pi AS (
                  SELECT match_id, slot, lh
                  FROM (
                    SELECT match_id, slot, lh,
                           ROW_NUMBER() OVER (
                             PARTITION BY match_id, time, slot, log_index
                             ORDER BY time ASC
                           ) AS rn
                    FROM dota2_analysis.player_intervals2
                    WHERE dt = '{partition_date}'
                      AND match_id IN ({ids}) AND time = 600
                  ) x WHERE rn = 1
                )
                SELECT p.match_id,
                       CASE WHEN p.team = 2 THEN i.radiant_team_tag
                            WHEN p.team = 3 THEN i.dire_team_tag END AS team_name,
                       p.steamid, p.persona, CAST(pi.lh AS INT) AS hits_10m,
                       NULL AS lane_role
                FROM p INNER JOIN i ON p.match_id = i.match_id
                LEFT JOIN pi ON pi.match_id = p.match_id AND pi.slot = p.slot
                """
            )
            for match_id, team_name, steamid, persona, hits, lane_role in cur:
                league_id = league_by_match.get(int(match_id), 0)
                fallback_rows.append(
                    (league_id, team_name, steamid, persona, hits, lane_role)
                )

    primary_roles, primary_stats = _assign_positions(primary_rows)
    fallback_roles, fallback_stats = _assign_positions(fallback_rows)
    roles = dict(primary_roles)
    roles.update(fallback_roles)

    # Team tags occasionally differ between the overview and match_info tables.
    # A league+player fallback is safe only when that player maps to one team.
    candidates: dict[tuple[int, str], list[dict]] = defaultdict(list)
    for (league_id, _team_name, steam), info in roles.items():
        candidates[(league_id, steam)].append(info)
    unique_by_player = {
        key: values[0] for key, values in candidates.items() if len(values) == 1
    }
    stats = {
        "primary_rows": len(primary_rows),
        "fallback_rows": len(fallback_rows),
        "primary_leagues": len(primary_leagues),
        "fallback_leagues": len(missing_leagues),
        "primary": primary_stats,
        "fallback": fallback_stats,
    }
    return roles, unique_by_player, stats


def main() -> int:
    valid_item_ids = _load_item_ids()
    conn = _connect()
    cur = conn.cursor()
    date_from, date_to = _date_bounds()
    date_to_exclusive = (date.fromisoformat(date_to) + timedelta(days=1)).isoformat()

    print(f"[1/13] Loading bounded match scope ({date_from} .. {date_to})...")
    cur.execute(
        f"""
        SELECT match_id, patch_version, league_id, league_name, match_time
        FROM dota2_analysis.pro_match_list_2
        WHERE patch_version <> 'Unknown'
          AND match_time >= '{date_from}'
          AND match_time < '{date_to_exclusive}'
        ORDER BY match_time, match_id
        """
    )
    scope_by_match = {
        int(match_id): {
            "patch": patch,
            "league_id": int(league_id or 0),
            "league_name": league_name,
            "match_time": match_time,
        }
        for match_id, patch, league_id, league_name, match_time in cur.fetchall()
    }
    if not scope_by_match:
        raise SystemExit("No professional matches found in the requested date range")
    scoped_ids = sorted(scope_by_match)
    league_by_match = {
        match_id: row["league_id"] for match_id, row in scope_by_match.items()
    }
    partition_date_by_match = {
        match_id: _str_date(row["match_time"])
        for match_id, row in scope_by_match.items()
    }

    print("[2/13] Loading deduplicated match and player dimensions...")
    match_infos: dict[int, tuple] = {}
    player_rows: list[tuple] = []
    for batch in _batches(scoped_ids):
        ids = _varchar_id_sql(batch)
        cur.execute(
            f"""
            SELECT match_id, radiant_team_id, radiant_team_tag,
                   dire_team_id, dire_team_tag
            FROM (
              SELECT match_id, radiant_team_id, radiant_team_tag,
                     dire_team_id, dire_team_tag,
                     ROW_NUMBER() OVER (
                       PARTITION BY match_id ORDER BY end_time DESC
                     ) AS rn
              FROM dota2_analysis.match_info
              WHERE match_id IN ({ids})
            ) x WHERE rn = 1
            """
        )
        for match_id, radiant_id, radiant_tag, dire_id, dire_tag in cur:
            match_infos[int(match_id)] = (
                radiant_id, radiant_tag, dire_id, dire_tag
            )
        cur.execute(
            f"""
            SELECT match_id, slot, steamid, hero_name, hero_id,
                   persona, team, win
            FROM (
              SELECT match_id, slot, steamid, hero_name, hero_id,
                     persona, team, win,
                     ROW_NUMBER() OVER (
                       PARTITION BY match_id, slot, steamid ORDER BY team DESC
                     ) AS rn
              FROM dota2_analysis.players
              WHERE match_id IN ({ids})
            ) x WHERE rn = 1
            """
        )
        player_rows.extend(cur.fetchall())

    print("[3/13] Loading canonical names only for scoped players...")
    steamids = sorted({int(row[2]) for row in player_rows if row[2]})
    pro_names = {}
    for batch in _batches(steamids):
        cur.execute(
            f"SELECT steamid, name FROM dota2_analysis.pro_players "
            f"WHERE steamid IN ({_id_sql(batch)})"
        )
        pro_names.update({str(s): n for s, n in cur.fetchall() if n})

    print("[4/13] Computing Dota positions from scoped lane_role + lane CS...")
    roles, roles_by_player, position_stats = _load_positions(
        cur, league_by_match, partition_date_by_match
    )
    print(
        f"      {len(roles):,} league/team/player positions; "
        f"{position_stats['fallback_leagues']} league(s) used the 10-minute CS fallback"
    )

    records: dict[tuple[int, int], dict] = {}
    hero_key_for_match: dict[tuple[int, str], tuple[int, int]] = {}
    match_ids: set[int] = set()
    for player_row in player_rows:
        match_id, slot, steamid, hero_name, hero_id, persona, team, win = player_row
        match_id = int(match_id)
        scope = scope_by_match.get(match_id)
        info = match_infos.get(match_id)
        if not scope or not info:
            continue
        patch = scope["patch"]
        league_id = scope["league_id"]
        league_name = scope["league_name"]
        match_time = scope["match_time"]
        radiant_id, radiant_tag, dire_id, dire_tag = info
        slot = int(slot)
        steam_key = str(steamid or "")
        is_radiant = int(team or 0) == 2
        team_id = str(radiant_id if is_radiant else dire_id)
        team_name = radiant_tag if is_radiant else dire_tag
        league_key = int(league_id or 0)
        role_info = roles.get((league_key, _team_key(team_name), steam_key))
        if role_info is None:
            role_info = roles_by_player.get((league_key, steam_key))
        hero_slug = _hero_name(hero_name)
        key = (match_id, slot)
        records[key] = {
            "m": match_id,
            "d": _str_date(match_time),
            "p": str(patch or ""),
            "li": league_key,
            "l": str(league_name or "Unknown league"),
            "t": str(team_name or team_id or "Unknown team"),
            "s": steam_key,
            "n": str(pro_names.get(steam_key) or persona or steam_key),
            "h": hero_slug,
            "hi": int(hero_id or 0),
            "sl": slot,
            "tm": 2 if is_radiant else 3,
            "r": role_info["position"] if role_info else None,
            "rm": role_info["method"] if role_info else None,
            "rc": role_info["confidence"] if role_info else None,
            "w": int(win or 0),
            "lv": None,
            "nw": None,
            "du": None,
            "f": [],
            "i": [],
            # null = source timeline not scanned/missing; [] = scanned, no use.
            "u": None,
        }
        hero_key_for_match[(match_id, str(hero_name or ""))] = key
        match_ids.add(match_id)

    print(f"      {len(match_ids):,} matches / {len(records):,} player-games")

    print("[5/13] Loading partition-pruned final player snapshots...")
    for partition_date, batch in _partition_batches(
        match_ids, partition_date_by_match
    ):
        ids = _varchar_id_sql(batch)
        cur.execute(
            f"""
            SELECT match_id, slot,
                   max_by(CAST(level AS INT), time),
                   max_by(CAST(networth AS BIGINT), time), MAX(time)
            FROM (
              SELECT match_id, time, slot, log_index, level, networth
              FROM (
                SELECT match_id, time, slot, log_index, level, networth,
                       ROW_NUMBER() OVER (
                         PARTITION BY match_id, time, slot, log_index
                         ORDER BY time ASC
                       ) AS rn
                FROM dota2_analysis.player_intervals2
                WHERE dt = '{partition_date}'
                  AND match_id IN ({ids}) AND time >= 0
              ) x WHERE rn = 1
            ) clean
            GROUP BY match_id, slot
            """
        )
        for match_id, slot, level, networth, duration in cur:
            rec = records.get((int(match_id), int(slot)))
            if rec:
                rec["lv"] = int(level or 1)
                rec["nw"] = int(networth or 0)
                rec["du"] = int(duration or 0)

    print("[6/13] Loading replay item-name mapping dimension...")
    cur.execute(
        "SELECT hero_update_name, combat_log_name FROM dwd_dota2.dim_item_mapping"
    )
    replay_to_item = {
        str(replay_name): str(item_id)
        for replay_name, item_id in cur.fetchall()
        if replay_name and item_id
    }

    print("[7/13] Loading partition-pruned final inventory snapshots...")
    unresolved = Counter()
    for partition_date, batch in _partition_batches(
        match_ids, partition_date_by_match
    ):
        ids = _id_sql(batch)
        cur.execute(
            f"""
            SELECT match_id, slot, max_by(items, time)
            FROM (
              SELECT match_id, time, slot, items
              FROM (
                SELECT match_id, time, log_index, slot, items,
                       ROW_NUMBER() OVER (
                         PARTITION BY match_id, time, log_index ORDER BY time ASC
                       ) AS rn
                FROM dota2_analysis.hero_status_update
                WHERE dt = '{partition_date}'
                  AND match_id IN ({ids}) AND time >= 0
              ) x WHERE rn = 1
            ) clean
            GROUP BY match_id, slot
            """
        )
        for match_id, slot, raw_items in cur:
            if match_id is None or slot is None:
                continue
            key = (int(match_id), int(slot))
            rec = records.get(key)
            if not rec:
                continue
            final_ids: list[str] = []
            for replay_name in _parse_items(raw_items):
                if not replay_name or replay_name == "empty":
                    continue
                item_id = replay_to_item.get(replay_name)
                if not item_id:
                    item_id = replay_to_item.get(re.sub(r"_\d+$", "", replay_name))
                if not item_id:
                    unresolved[replay_name] += 1
                    continue
                if item_id == "item_tpscroll" or item_id not in valid_item_ids:
                    continue
                if item_id not in final_ids:
                    final_ids.append(item_id)
            rec["f"] = final_ids

    print("[8/13] Loading partition-pruned purchase times...")
    dwd_purchase_matches: set[int] = set()
    combatlog_purchase_fallback_matches: set[int] = set()
    for partition_date, batch in _partition_batches(
        match_ids, partition_date_by_match
    ):
        ids = _varchar_id_sql(batch)
        cur.execute(
            f"""
            SELECT match_id, targetname, type,
                   MIN(GREATEST(time, 0)) AS first_time
            FROM (
              SELECT match_id, time, targetname, type
              FROM (
                SELECT match_id, time, targetname, type,
                       ROW_NUMBER() OVER (
                         PARTITION BY match_id, time, targetname, type
                         ORDER BY time ASC
                       ) AS rn
                FROM dwd_dota2.dwd_hero_combatlog_purchase
                WHERE dt = '{partition_date}'
                  AND match_id IN ({ids})
                  AND targetname LIKE 'npc_dota_hero_%'
                  AND type NOT LIKE 'item_recipe_%'
              ) x WHERE rn = 1
            ) clean
            GROUP BY match_id, targetname, type
            """
        )
        for match_id, hero_name, item_id, first_time in cur:
            match_id = int(match_id)
            dwd_purchase_matches.add(match_id)
            hero_name = str(hero_name or "")
            item_id = str(item_id or "")
            if item_id not in valid_item_ids:
                continue
            rec = records.get(hero_key_for_match.get((match_id, hero_name), (-1, -1)))
            if rec:
                rec["i"].append([item_id, int(first_time or 0)])

        missing_purchase_ids = sorted(set(batch) - dwd_purchase_matches)
        if missing_purchase_ids:
            fallback_ids = _varchar_id_sql(missing_purchase_ids)
            cur.execute(
                f"""
                SELECT match_id, targetname, valuename,
                       MIN(GREATEST(time, 0)) AS first_time
                FROM (
                  SELECT match_id, time, log_index, targetname, valuename,
                         ROW_NUMBER() OVER (
                           PARTITION BY match_id, time, log_index ORDER BY time ASC
                         ) AS rn
                  FROM dota2_analysis.combat_logs
                  WHERE dt = '{partition_date}'
                    AND match_id IN ({fallback_ids})
                    AND type = 'DOTA_COMBATLOG_PURCHASE'
                    AND targetname LIKE 'npc_dota_hero_%'
                    AND valuename NOT LIKE 'item_recipe_%'
                ) clean WHERE rn = 1
                GROUP BY match_id, targetname, valuename
                """
            )
            for match_id, hero_name, item_id, first_time in cur:
                match_id = int(match_id)
                combatlog_purchase_fallback_matches.add(match_id)
                item_id = str(item_id or "")
                if item_id not in valid_item_ids:
                    continue
                rec = records.get(
                    hero_key_for_match.get(
                        (match_id, str(hero_name or "")), (-1, -1)
                    )
                )
                if rec:
                    rec["i"].append([item_id, int(first_time or 0)])

    for rec in records.values():
        timed = {item_id: seconds for item_id, seconds in rec["i"]}
        for item_id in rec["f"]:
            timed.setdefault(item_id, None)
        rec["i"] = [
            [item_id, seconds]
            for item_id, seconds in timed.items()
        ]
        rec["i"].sort(key=lambda row: (row[1] is None, row[1] or 10**9, row[0]))
        rec.pop("f", None)

    print("      Loading first recognizable item-use times from scoped combat logs...")
    item_use_source_matches: set[int] = set()
    item_uses_by_record: dict[tuple[int, int], dict[str, int]] = defaultdict(dict)
    record_keys_by_match: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for record_key, rec in records.items():
        record_keys_by_match[int(rec["m"])].append(record_key)
    for partition_date, batch in _partition_batches(
        match_ids, partition_date_by_match
    ):
        ids = _varchar_id_sql(batch)
        target_item_ids = sorted({
            item_id
            for match_id in batch
            for record_key in record_keys_by_match[int(match_id)]
            for item_id, purchase_time in records[record_key]["i"]
            if isinstance(purchase_time, int) and item_id != "item_tpscroll"
        })
        if not target_item_ids:
            continue
        item_ids = _varchar_sql(target_item_ids)
        cur.execute(
            f"""
            SELECT match_id, attackername, item_id,
                   GREATEST(time, 0) AS use_time
            FROM (
              SELECT match_id, time, log_index, attackername,
                     CASE
                       WHEN type = 'DOTA_COMBATLOG_ITEM' THEN inflictor
                       WHEN type = 'DOTA_COMBATLOG_MODIFIER_ADD'
                        AND inflictor = 'modifier_echo_sabre_debuff'
                         THEN 'item_echo_sabre'
                     END AS item_id
              FROM (
                SELECT match_id, time, log_index, type, attackername, inflictor,
                       ROW_NUMBER() OVER (
                         PARTITION BY match_id, time, log_index ORDER BY time ASC
                       ) AS rn
                FROM dota2_analysis.combat_logs
                WHERE dt = '{partition_date}'
                  AND match_id IN ({ids})
                  AND attackername LIKE 'npc_dota_hero_%'
                  AND (
                    (type = 'DOTA_COMBATLOG_ITEM' AND inflictor IN ({item_ids}))
                    OR (type = 'DOTA_COMBATLOG_MODIFIER_ADD'
                        AND inflictor = 'modifier_echo_sabre_debuff')
                  )
              ) x WHERE rn = 1
            ) clean WHERE item_id IS NOT NULL
            """
        )
        for match_id, hero_name, item_id, raw_use_time in cur:
            match_id = int(match_id)
            item_use_source_matches.add(match_id)
            item_id = str(item_id or "")
            if item_id not in valid_item_ids:
                continue
            record_key = hero_key_for_match.get(
                (match_id, str(hero_name or ""))
            )
            rec = records.get(record_key) if record_key else None
            if rec is None:
                continue
            purchase_time = next(
                (
                    seconds for purchase_id, seconds in rec["i"]
                    if purchase_id == item_id and isinstance(seconds, int)
                ),
                None,
            )
            if raw_use_time is None:
                continue
            use_time = int(raw_use_time)
            if purchase_time is None or use_time < purchase_time:
                continue
            current = item_uses_by_record[record_key].get(item_id)
            if current is None or use_time < current:
                item_uses_by_record[record_key][item_id] = use_time

    for rec in records.values():
        if int(rec["m"]) in item_use_source_matches:
            rec["u"] = []
    for record_key, uses in item_uses_by_record.items():
        records[record_key]["u"] = sorted(
            ([item_id, use_time] for item_id, use_time in uses.items()),
            key=lambda pair: (pair[1], pair[0]),
        )

    item_use_matches = {
        int(records[record_key]["m"]) for record_key in item_uses_by_record
    }
    item_use_events = sum(len(uses) for uses in item_uses_by_record.values())

    print("[9/13] Loading partition-pruned economy, KDA and map snapshots...")
    snapshot_times = (300, 600, 900, 1200, 1500, 1800, 2400, 3000)
    detail_players: dict[str, dict] = {}
    team_totals: Counter = Counter()
    snapshot_rows = []
    for partition_date, batch in _partition_batches(
        match_ids, partition_date_by_match
    ):
        ids = _varchar_id_sql(batch)
        cur.execute(
            f"""
            SELECT match_id, slot, CAST(time AS INT),
                   CAST(level AS INT), CAST(networth AS BIGINT),
                   CAST(lh AS INT), CAST(kills AS INT),
                   CAST(deaths AS INT), CAST(assists AS INT),
                   CAST(x AS DOUBLE), CAST(y AS DOUBLE)
            FROM (
              SELECT match_id, time, slot, level, networth, lh,
                     kills, deaths, assists, x, y,
                     ROW_NUMBER() OVER (
                       PARTITION BY match_id, time, slot, log_index
                       ORDER BY time ASC
                     ) AS rn
              FROM dota2_analysis.player_intervals2
              WHERE dt = '{partition_date}'
                AND match_id IN ({ids})
                AND time IN ({','.join(str(v) for v in snapshot_times)})
            ) clean WHERE rn = 1
            ORDER BY match_id, slot, time
            """
        )
        for row in cur:
            match_id, slot, seconds, level, networth, lh, kills, deaths, assists, x, y = row
            key = (int(match_id), int(slot))
            rec = records.get(key)
            if not rec:
                continue
            compact = [
                int(seconds), int(level or 0), int(networth or 0), int(lh or 0),
                int(kills or 0), int(deaths or 0), int(assists or 0),
                _round_number(x), _round_number(y), 0,
            ]
            snapshot_rows.append((key, compact))
            team_totals[(key[0], compact[0], rec["tm"])] += compact[2]

    for key, compact in snapshot_rows:
        rec = records[key]
        other_team = 3 if rec["tm"] == 2 else 2
        compact[9] = int(
            team_totals[(key[0], compact[0], rec["tm"])]
            - team_totals[(key[0], compact[0], other_team)]
        )
        detail_players.setdefault(f"{key[0]}:{key[1]}", {"q": [], "a": []})["q"].append(compact)
        if compact[0] == 900:
            # level, net worth, last hits, K/D/A, team net-worth difference
            rec["g"] = compact[1:7] + [compact[9]]
    for rec in records.values():
        rec.setdefault("g", None)

    print("[10/13] Loading partition-pruned hero skill builds...")
    ability_rows = 0
    for partition_date, batch in _partition_batches(
        match_ids, partition_date_by_match
    ):
        ids = _varchar_id_sql(batch)
        cur.execute(
            f"""
            SELECT match_id, time, targetname, valuename, abilitylevel
            FROM (
              SELECT match_id, time, log_index, targetname, valuename,
                     abilitylevel,
                     ROW_NUMBER() OVER (
                       PARTITION BY match_id, time, log_index ORDER BY time ASC
                     ) AS rn
              FROM dota2_analysis.hero_ability_level
              WHERE dt = '{partition_date}'
                AND match_id IN ({ids})
                AND time >= 0 AND abilitylevel > 0
                AND targetname LIKE 'npc_dota_hero_%'
            ) clean WHERE rn = 1
            ORDER BY match_id, time
            """
        )
        for match_id, seconds, targetname, ability, ability_level in cur:
            match_id = int(match_id)
            key = hero_key_for_match.get((match_id, str(targetname or "")))
            if not key:
                continue
            ability = str(ability or "")
            if not ability or ability.endswith("generic_hidden"):
                continue
            detail_players.setdefault(f"{key[0]}:{key[1]}", {"q": [], "a": []})["a"].append(
                [int(seconds or 0), ability, int(ability_level or 0)]
            )
            ability_rows += 1

    print("[11/13] Loading deduplicated draft picks and bans...")
    drafts: dict[str, dict] = {}
    for batch in _batches(match_ids):
        ids = _varchar_id_sql(batch)
        cur.execute(
            f"""
            SELECT match_id, CAST(ord AS INT), is_pick,
                   CAST(team AS INT), CAST(hero_id AS INT), hero_name_en
            FROM (
              SELECT match_id, ord, is_pick, team, hero_id, hero_name_en,
                     ROW_NUMBER() OVER (
                       PARTITION BY match_id, ord ORDER BY ord ASC
                     ) AS rn
              FROM dota2_analysis.match_picks_bans
              WHERE match_id IN ({ids})
            ) clean WHERE rn = 1
            ORDER BY match_id, CAST(ord AS INT)
            """
        )
        for match_id, order, is_pick, team, hero_id, hero_name in cur:
            draft = drafts.setdefault(str(int(match_id)), {"p": [], "b": []})
            picked = str(is_pick).lower() in {"1", "true", "yes"}
            draft["p" if picked else "b"].append(
                [int(order or 0), int(team or 0), int(hero_id or 0), _hero_name(hero_name)]
            )

    print("[12/13] Loading partition-pruned compact match event timelines...")
    events: dict[str, list] = defaultdict(list)
    event_codes = {
        "DOTA_COMBATLOG_DEATH": "d",
        "DOTA_COMBATLOG_BUYBACK": "bb",
        "DOTA_COMBATLOG_TEAM_BUILDING_KILL": "tower",
    }
    event_query_failures = 0
    event_match_ids = sorted(match_ids)
    event_batch_number = 0
    for partition_date, batch in _partition_batches(
        event_match_ids, partition_date_by_match
    ):
        event_batch_number += 1
        batch_sql = _varchar_id_sql(batch)
        try:
            cur.execute(
                f"""
                SELECT match_id, time, type, attackername, targetname,
                       inflictor, value
                FROM (
                  SELECT match_id, time, log_index, type, attackername,
                         targetname, inflictor, value,
                         ROW_NUMBER() OVER (
                           PARTITION BY match_id, time, log_index ORDER BY time ASC
                         ) AS rn
                  FROM dota2_analysis.combat_logs
                  WHERE dt = '{partition_date}'
                    AND match_id IN ({batch_sql}) AND time >= 0
                    AND type IN ('DOTA_COMBATLOG_DEATH',
                                 'DOTA_COMBATLOG_BUYBACK',
                                 'DOTA_COMBATLOG_TEAM_BUILDING_KILL')
                    AND (
                      (type = 'DOTA_COMBATLOG_DEATH'
                       AND targethero = 'true'
                       AND COALESCE(targetillusion, 'false') <> 'true')
                      OR type IN ('DOTA_COMBATLOG_BUYBACK',
                                  'DOTA_COMBATLOG_TEAM_BUILDING_KILL')
                    )
                ) clean WHERE rn = 1
                ORDER BY match_id, time
                """
            )
            for match_id, seconds, event_type, attacker, target, inflictor, value in cur:
                events[str(int(match_id))].append([
                    int(seconds or 0), event_codes.get(str(event_type), str(event_type)),
                    _hero_name(attacker), _hero_name(target), str(inflictor or ""), str(value or ""),
                ])
        except pymysql.MySQLError as exc:
            event_query_failures += 1
            print(f"      event batch {event_batch_number} skipped: {exc.args[0]}")

    print("[13/13] Writing compact index and on-demand detail datasets...")
    rows = list(records.values())
    rows.sort(key=lambda r: (r["d"], r["m"], r["s"]))
    patches = Counter(r["p"] for r in rows)
    leagues = Counter(r["l"] for r in rows)
    payload = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": "StarRocks read-only export",
            "query_scope": {
                "date_from": date_from,
                "date_to": date_to,
                "match_batch_size": MATCH_BATCH_SIZE,
                "partition_filter": "one exact dt partition per query",
                "dedup": "ROW_NUMBER over each table business key",
            },
            "matches": len(match_ids),
            "player_games": len(rows),
            "date_min": min((r["d"] for r in rows), default=""),
            "date_max": max((r["d"] for r in rows), default=""),
            "patches": dict(sorted(patches.items())),
            "leagues": len(leagues),
            "unresolved_inventory_names": sum(unresolved.values()),
            "positions": {
                "assigned_player_games": sum(1 for r in rows if r.get("r") is not None),
                "lane_method_player_games": sum(1 for r in rows if r.get("rm") == "lanes"),
                "hits_fallback_player_games": sum(1 for r in rows if r.get("rm") == "hits"),
                "source_stats": position_stats,
            },
            "advanced": {
                "snapshot_player_games": sum(1 for r in rows if r.get("g")),
                "detail_player_games": len(detail_players),
                "ability_events": ability_rows,
                "draft_matches": len(drafts),
                "event_matches": len(events),
                "event_query_failures": event_query_failures,
                "timed_item_player_games": sum(
                    any(isinstance(pair[1], int) for pair in (r.get("i") or []))
                    for r in rows
                ),
                "dwd_purchase_matches": len(dwd_purchase_matches),
                "combatlog_purchase_fallback_matches": len(combatlog_purchase_fallback_matches),
                "item_use_source_matches": len(item_use_source_matches),
                "item_use_source_player_games": sum(
                    isinstance(r.get("u"), list) for r in rows
                ),
                "item_use_matches": len(item_use_matches),
                "item_use_player_games": sum(bool(r.get("u")) for r in rows),
                "item_use_records": item_use_events,
                "snapshot_times": list(snapshot_times),
            },
        },
        "records": rows,
    }
    detail_payload = {
        "meta": {
            "generated_at": payload["meta"]["generated_at"],
            "players": len(detail_players),
            "draft_matches": len(drafts),
            "event_matches": len(events),
        },
        "players": detail_players,
        "drafts": drafts,
        "events": events,
    }
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    DETAIL_OUT.write_text(
        json.dumps(detail_payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"      -> {_display_path(OUT)}: {OUT.stat().st_size:,} bytes")
    print(f"      -> {_display_path(DETAIL_OUT)}: {DETAIL_OUT.stat().st_size:,} bytes")
    if unresolved:
        sample = ", ".join(f"{k} ({v})" for k, v in unresolved.most_common(8))
        print(f"      unresolved inventory names: {sample}")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
