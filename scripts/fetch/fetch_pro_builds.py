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
import time
import urllib.error
import urllib.parse
import urllib.request
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
COMBAT_BATCH_SIZE = 25
STEAM64_ACCOUNT_BASE = 76561197960265728
OPENDOTA_LANE_CACHE = ROOT / ".cache" / "opendota_lane_roles"
OPENDOTA_MATCH_CACHE = ROOT / ".cache" / "opendota_matches"

# Physical-table semantic keys mandated by the local data skills.  Queries
# retrieve scoped raw rows only; every fetched batch is deduplicated here,
# before joins, aggregation, ratios, or export.
DEDUP_KEYS = {
    # Approved derived position source.  Its semantic grain is one player in
    # one match; duplicate uploads are resolved after retrieval like every
    # other source table.
    "dwd_match_player_positions": ("match_id", "steamid"),
    "pro_match_list_2": ("match_id",),
    "match_info": ("match_id",),
    "players": ("match_id", "slot"),
    "pro_players": ("steamid",),
    "player_intervals2": ("match_id", "log_index"),
    "hero_status_update": ("match_id", "log_index"),
    "combat_logs": ("match_id", "log_index"),
    "hero_ability_level": ("match_id", "log_index"),
    "match_picks_bans": ("match_id", "ord"),
}
DEDUP_AUDIT: dict[str, Counter] = defaultdict(Counter)
CONVERSION_FAILURES: Counter = Counter()


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


def _stable_row_key(row: tuple) -> tuple:
    """Return a deterministic fallback order for conflicting duplicate rows."""
    return tuple((value is not None, str(value or "")) for value in row)


def _deduplicate_rows(
    rows,
    *,
    table: str,
    columns: tuple[str, ...],
    prefer=None,
) -> list[tuple]:
    """Deduplicate one fetched physical table in application memory.

    ``prefer`` is used only as a stable conflict resolver (for example the
    latest ``match_info.end_time``).  It never changes the semantic key.
    """
    rows = [tuple(row) for row in rows]
    key_names = DEDUP_KEYS[table]
    indexes = tuple(columns.index(name) for name in key_names)
    chosen: dict[tuple, tuple] = {}
    conflicts = 0
    for row in rows:
        key = tuple(row[index] for index in indexes)
        current = chosen.get(key)
        if current is None:
            chosen[key] = row
            continue
        if current != row:
            conflicts += 1
        current_rank = (prefer(current) if prefer else ()) + _stable_row_key(current)
        candidate_rank = (prefer(row) if prefer else ()) + _stable_row_key(row)
        if candidate_rank > current_rank:
            chosen[key] = row
    audit = DEDUP_AUDIT[table]
    audit["raw_rows"] += len(rows)
    audit["deduplicated_rows"] += len(chosen)
    audit["duplicates_removed"] += len(rows) - len(chosen)
    audit["conflicting_duplicate_keys"] += conflicts
    return list(chosen.values())


def _fetch_deduplicated(
    cur,
    sql: str,
    *,
    table: str,
    columns: tuple[str, ...],
    prefer=None,
) -> list[tuple]:
    cur.execute(sql)
    return _deduplicate_rows(
        cur.fetchall(), table=table, columns=columns, prefer=prefer
    )


def _to_int(value, field: str, default=None):
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        CONVERSION_FAILURES[field] += 1
        return default


def _to_float(value, field: str, default=None):
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        CONVERSION_FAILURES[field] += 1
        return default


def _unix_date(value) -> str:
    seconds = _to_int(value, "pro_match_list_2.start_time")
    if seconds is None:
        return ""
    return datetime.fromtimestamp(seconds, tz=timezone.utc).date().isoformat()


def _team_identity(team_id, team_tag) -> str:
    """Prefer stable organization ID; use a labeled tag fallback if absent."""
    stable_id = str(team_id or "").strip()
    if stable_id and stable_id != "0":
        return f"id:{stable_id}"
    return f"tag:{_team_key(team_tag)}"


def _load_item_ids() -> set[str]:
    sys.path.insert(0, str(ROOT))
    from builders.hero_lab import _load_items, _versions

    return {row["id"] for row in _load_items(_versions()[-1])}


def _item_alias_key(value) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").casefold())


def _load_replay_item_mapping(valid_item_ids: set[str]) -> dict[str, str]:
    """Build replay-name aliases from the checked-in Valve item catalog."""
    path = ROOT / "data" / "itemlist.json"
    payload = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    rows = payload.get("result", {}).get("data", {}).get("itemabilities", [])
    mapping: dict[str, str] = {}
    for row in rows:
        item_id = str(row.get("name") or "")
        if not item_id:
            continue
        aliases = {
            item_id,
            item_id.removeprefix("item_"),
            str(row.get("name_loc") or ""),
            str(row.get("name_english_loc") or ""),
        }
        for alias in aliases:
            if alias:
                mapping[alias] = item_id
                mapping[_item_alias_key(alias)] = item_id
    # Replay class names that intentionally differ from current public names.
    for alias, item_id in {
        "TeleportScroll": "item_tpscroll",
        "IronwoodBranch": "item_branches",
        "UltimateScepter": "item_ultimate_scepter",
        "UltimateScepter2": "item_ultimate_scepter_2",
        "GreaterCritical": "item_greater_crit",
        "LesserCritical": "item_lesser_crit",
        "EmptyBottle": "item_bottle",
        "RefresherOrb_Shard": "item_refresher_shard",
        "Guardian_Shell": "item_guardian_shell",
        "InvisibilityEdge": "item_invis_sword",
        "Forage_Health": "item_foragers_health",
        "RingOfRegeneration": "item_ring_of_regen",
        "PlaneswalkersCloak": "item_cloak",
        "Recipe_RefresherOrb": "item_recipe_refresher",
    }.items():
        mapping[alias] = item_id
        mapping[_item_alias_key(alias)] = item_id
    return mapping


def _load_ability_ids() -> dict[int, str]:
    sys.path.insert(0, str(ROOT))
    from patch.meta import latest_stats_version

    path = ROOT / "data" / "stats" / latest_stats_version() / "ability_ids.json"
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {int(ability_id): str(slug) for ability_id, slug in payload.items()}


def _load_hero_ids() -> dict[int, str]:
    path = ROOT / "data" / "herolist.json"
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    heroes = payload.get("result", {}).get("data", {}).get("heroes", [])
    return {
        int(row["id"]): _hero_name(row.get("name"))
        for row in heroes
        if row.get("id") is not None and row.get("name")
    }


def _parse_items(raw) -> list[str]:
    if isinstance(raw, list):
        return [str(v) for v in raw]
    try:
        data = json.loads(raw or "[]")
        return [str(v) for v in data] if isinstance(data, list) else []
    except (TypeError, ValueError, json.JSONDecodeError):
        return []


def _mapped_inventory(
    raw,
    replay_to_item: dict[str, str],
    valid_item_ids: set[str],
    unresolved: Counter,
) -> list[str]:
    """Map one replay inventory snapshot to stable Hero Lab item IDs."""
    result: list[str] = []
    for replay_name in _parse_items(raw):
        if not replay_name or replay_name == "empty":
            continue
        item_id = replay_to_item.get(replay_name) or replay_to_item.get(
            _item_alias_key(replay_name)
        )
        if not item_id:
            stripped = re.sub(r"_\d+$", "", replay_name)
            item_id = replay_to_item.get(stripped) or replay_to_item.get(
                _item_alias_key(stripped)
            )
        if not item_id:
            stripped = re.sub(r"_(?:str|agi|int|universal)$", "", replay_name)
            item_id = replay_to_item.get(stripped) or replay_to_item.get(
                _item_alias_key(stripped)
            )
        if not item_id:
            unresolved[replay_name] += 1
            continue
        if item_id == "item_tpscroll" or item_id not in valid_item_ids:
            continue
        if item_id not in result:
            result.append(item_id)
    return result


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


def _parse_opendota_lane_roles(match: dict) -> dict[str, int]:
    """Map an OpenDota match response to Steam64 -> safe/mid/off lane role."""
    roles: dict[str, int] = {}
    for player in match.get("players") or []:
        account_id = player.get("account_id")
        lane_role = player.get("lane_role")
        try:
            account_id = int(account_id)
            lane_role = int(lane_role)
        except (TypeError, ValueError):
            continue
        if account_id <= 0 or lane_role not in (1, 2, 3):
            continue
        roles[str(STEAM64_ACCOUNT_BASE + account_id)] = lane_role
    return roles


def _parse_opendota_ability_route(
    match: dict, hero_id: int, ability_ids: dict[int, str]
) -> list[list]:
    """Return ordered [level-up order, ability slug, resulting rank] rows."""
    player = next(
        (
            row for row in match.get("players") or []
            if int(row.get("hero_id") or 0) == int(hero_id or 0)
        ),
        None,
    )
    if not player:
        return []
    ranks = Counter()
    route = []
    for order, raw_id in enumerate(player.get("ability_upgrades_arr") or [], 1):
        try:
            slug = ability_ids.get(int(raw_id))
        except (TypeError, ValueError):
            slug = None
        if not slug or slug in {"ability_base", "dota_empty_ability", "default_attack"}:
            continue
        ranks[slug] += 1
        route.append([order, slug, ranks[slug]])
    return route


def _load_opendota_match(match_id: int) -> dict:
    """Load one exact OpenDota match and cache it for lane/build fallbacks."""
    OPENDOTA_MATCH_CACHE.mkdir(parents=True, exist_ok=True)
    cache_path = OPENDOTA_MATCH_CACHE / f"{int(match_id)}.json"
    if cache_path.exists():
        try:
            return json.loads(cache_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            cache_path.unlink(missing_ok=True)

    query = {}
    if os.environ.get("OPENDOTA_API_KEY"):
        query["api_key"] = os.environ["OPENDOTA_API_KEY"]
    suffix = f"?{urllib.parse.urlencode(query)}" if query else ""
    request = urllib.request.Request(
        f"https://api.opendota.com/api/matches/{int(match_id)}{suffix}",
        headers={
            "Accept": "application/json",
            "User-Agent": "dota2-item-position-fallback/1.0",
        },
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                match = json.load(response)
            cache_path.write_text(
                json.dumps(match, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            return match
        except urllib.error.HTTPError as exc:
            if exc.code != 429 or attempt == 2:
                raise
            delay = min(30, max(2, int(exc.headers.get("Retry-After") or 5)))
            time.sleep(delay)
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))
    return {}


def _load_opendota_lane_roles(match_id: int) -> dict[str, int]:
    """Load one exact match's lane roles, with a small derived cache."""
    OPENDOTA_LANE_CACHE.mkdir(parents=True, exist_ok=True)
    cache_path = OPENDOTA_LANE_CACHE / f"{int(match_id)}.json"
    if cache_path.exists():
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            return {
                str(steam): int(lane)
                for steam, lane in cached.items()
                if int(lane) in (1, 2, 3)
            }
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            cache_path.unlink(missing_ok=True)
    roles = _parse_opendota_lane_roles(_load_opendota_match(match_id))
    cache_path.write_text(
        json.dumps(roles, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return roles


def _position_row_values(row) -> tuple:
    """Normalize compact test rows and rich fetched rows to one contract."""
    if isinstance(row, dict):
        return (
            row.get("league_id"), row.get("team_name"), row.get("steamid"),
            row.get("nickname"), row.get("hits"), row.get("lane_role"),
            row.get("lane_source") or "dwd", row.get("hits_source") or "unknown",
        )
    values = tuple(row)
    if len(values) < 6:
        raise ValueError("position rows require league/team/player/name/hits/lane")
    return values[:6] + (
        values[6] if len(values) > 6 else "dwd",
        values[7] if len(values) > 7 else "unknown",
    )


def _position_team(row) -> tuple[int, str] | None:
    league_id, team_name, *_rest = _position_row_values(row)
    if league_id is None or not team_name:
        return None
    return int(league_id), _team_key(team_name)


def _team_lane_shapes(raw_rows: list) -> dict[tuple[int, str], tuple[int, int, int]]:
    """Return the main-lane 1/2/3 shape of each team's five most-used players."""
    teams: dict[tuple[int, str], dict[str, dict]] = defaultdict(dict)
    for raw_row in raw_rows:
        league_id, team_name, steamid, _nickname, hits, lane_role, _lane_source, _hits_source = _position_row_values(raw_row)
        if league_id is None or not team_name or steamid is None:
            continue
        team = (int(league_id), _team_key(team_name))
        player = teams[team].setdefault(str(steamid), {"count": 0, "hits": [], "lanes": Counter()})
        player["count"] += 1
        if hits is not None:
            try:
                player["hits"].append(int(hits))
            except (TypeError, ValueError):
                pass
        if lane_role is not None:
            try:
                lane = int(lane_role)
                if lane in (1, 2, 3):
                    player["lanes"][lane] += 1
            except (TypeError, ValueError):
                pass

    shapes = {}
    for team, players in teams.items():
        ordered = sorted(
            players.items(),
            key=lambda row: (
                -row[1]["count"],
                -(_avg(row[1]["hits"]) if row[1]["hits"] else -1),
                row[0],
            ),
        )[:5]
        lanes = []
        for _steam, player in ordered:
            lane = None
            if player["lanes"]:
                lane = sorted(player["lanes"].items(), key=lambda row: (-row[1], row[0]))[0][0]
            lanes.append(lane)
        shapes[team] = tuple(lanes.count(role) for role in (1, 2, 3))
    return shapes


def _apply_opendota_lane_fallback(
    raw_rows: list[dict], lane_roles_by_match: dict[int, dict[str, int]]
) -> tuple[list[dict], dict]:
    """Use exact OpenDota lanes only when they recover a strict 2-1-2 team.

    Valid DWD lane rows remain the primary source.  For a team whose DWD lane
    shape is not 2-1-2, an OpenDota-only candidate is built for all exact
    player-games.  The candidate replaces the DWD lanes only if the resulting
    top-five aggregate is exactly 2-1-2; otherwise the original rows are kept
    and the caller may use the final CS-only fallback.
    """
    original_shapes = _team_lane_shapes(raw_rows)
    problematic = {
        team for team, shape in original_shapes.items() if shape != (2, 1, 2)
    }
    candidates: list[dict] = []
    candidate_lane_rows = 0
    for row in raw_rows:
        candidate = dict(row)
        team = _position_team(row)
        if team in problematic:
            lane = lane_roles_by_match.get(int(row["match_id"]), {}).get(
                str(row.get("steamid") or "")
            )
            if lane in (1, 2, 3):
                candidate["lane_role"] = lane
                candidate["lane_source"] = "opendota"
                candidate_lane_rows += 1
        candidates.append(candidate)

    candidate_shapes = _team_lane_shapes(candidates)
    recovered = {
        team for team in problematic
        if candidate_shapes.get(team) == (2, 1, 2)
    }
    final_rows = [
        candidate if _position_team(original) in recovered else original
        for original, candidate in zip(raw_rows, candidates)
    ]
    adopted_lane_rows = sum(
        1 for row in final_rows
        if _position_team(row) in recovered and row.get("lane_source") == "opendota"
    )
    return final_rows, {
        "problematic_teams": len(problematic),
        "recovered_212_teams": len(recovered),
        "candidate_lane_rows": candidate_lane_rows,
        "adopted_lane_rows": adopted_lane_rows,
    }


def _assign_positions(raw_rows: list) -> tuple[dict, dict]:
    """Aggregate per-match lane/CS rows and assign Dota positions 1–5.

    This intentionally never uses ``players.slot``. Standard 2-1-2 lanes are
    resolved by lane_role and within-lane average CS. Irregular lanes fall back
    to descending average CS, matching the league-import algorithm supplied by
    the user.
    """
    teams: dict[tuple[int, str], dict[str, dict]] = defaultdict(dict)
    for raw_row in raw_rows:
        league_id, team_name, steamid, nickname, hits, lane_role, lane_source, hits_source = _position_row_values(raw_row)
        if league_id is None or not team_name or steamid is None:
            continue
        team = (int(league_id), _team_key(team_name))
        steam = str(steamid)
        player = teams[team].setdefault(
            steam,
            {
                "count": 0, "hits": [], "lanes": Counter(),
                "names": Counter(), "lane_sources": Counter(),
                "hits_sources": Counter(),
            },
        )
        player["count"] += 1
        if hits is not None:
            try:
                player["hits"].append(int(hits))
                player["hits_sources"][str(hits_source or "unknown")] += 1
            except (TypeError, ValueError):
                pass
        if lane_role is not None:
            try:
                lane = int(lane_role)
                if lane in (1, 2, 3):
                    player["lanes"][lane] += 1
                    player["lane_sources"][str(lane_source or "dwd")] += 1
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
                    "lane_source": (
                        "opendota" if agg["lane_sources"].get("opendota") else "dwd"
                    ),
                    "hits_source": (
                        sorted(
                            agg["hits_sources"].items(),
                            key=lambda row: (-row[1], row[0]),
                        )[0][0]
                        if agg["hits_sources"] else "unknown"
                    ),
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
            method = (
                "lanes_opendota"
                if any(player["lane_source"] == "opendota" for player in top5)
                else "lanes"
            )
            confidence = sum(p["lane_share"] for p in top5) / 5
            stats["teams_lane_212"] += 1
            stats[f"teams_{method}"] += 1
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
                "hits_source": player["hits_source"],
            }
    stats["teams_total"] = len(teams)
    stats["players_assigned"] = len(roles)
    return roles, dict(stats)


def _load_positions(
    cur,
    league_by_match: dict[int, int],
    partition_date_by_match: dict[int, str],
    scoped_players_by_match: dict[int, set[str]] | None = None,
) -> tuple[dict, dict, dict]:
    """Assign league positions with DWD primary data and explicit fallbacks.

    The aggregation scope is the whole league, not the page's selected date
    slice.  ``dwd_match_player_positions`` supplies the primary per-match
    ``lane_role`` and five-minute ``hits_5m``.  Missing DWD participants/hits
    are reconstructed from bounded ``players`` plus ten-minute
    ``player_intervals2.lh``.  Exact OpenDota lane roles are considered only
    for teams whose DWD aggregate is not 2-1-2 and are adopted only when they
    recover a strict 2-1-2 shape.  Slot is solely a within-match join key.
    """
    del scoped_players_by_match  # retained for backfill-call compatibility
    league_ids = sorted({
        int(league_id) for league_id in league_by_match.values()
        if _to_int(league_id, "position.league_id", 0) > 0
    })
    empty = {
        "source_rows": 0, "bounded_matches": len(league_by_match),
        "league_matches": 0, "primary": {}, "dwd": {},
        "fallback": {}, "opendota": {},
    }
    if not league_ids:
        return {}, {}, empty

    match_rows: list[tuple] = []
    for batch in _batches(league_ids):
        match_rows.extend(
            _fetch_deduplicated(
                cur,
                f"""
                SELECT match_id, radiant_team_id, radiant_team_tag,
                       dire_team_id, dire_team_tag, end_time, league_id
                FROM dota2_analysis.match_info
                WHERE league_id IN ({_varchar_sql(batch)})
                """,
                table="match_info",
                columns=("match_id", "radiant_team_id", "radiant_team_tag",
                         "dire_team_id", "dire_team_tag", "end_time", "league_id"),
                prefer=lambda row: (_to_int(row[5], "match_info.end_time", -1),),
            )
        )
    matches: dict[int, dict] = {}
    for row in match_rows:
        match_id = _to_int(row[0], "match_info.match_id")
        league_id = _to_int(row[6], "match_info.league_id")
        if match_id is None or league_id not in league_ids:
            continue
        matches[match_id] = {
            "radiant_id": row[1], "radiant_tag": row[2],
            "dire_id": row[3], "dire_tag": row[4],
            "end_time": _to_int(row[5], "match_info.end_time"),
            "league_id": league_id,
        }
    match_ids = sorted(matches)
    if not match_ids:
        return {}, {}, empty

    def team_identity(match_id: int, team: int) -> str | None:
        info = matches.get(match_id)
        if not info:
            return None
        if team == 2:
            return _team_identity(info["radiant_id"], info["radiant_tag"])
        if team == 3:
            return _team_identity(info["dire_id"], info["dire_tag"])
        return None

    dwd_rows: list[tuple] = []
    for batch in _batches(match_ids):
        dwd_rows.extend(
            _fetch_deduplicated(
                cur,
                f"""
                SELECT match_id, steamid, name, team, hits_5m, lane_role
                FROM dwd_dota2.dwd_match_player_positions
                WHERE match_id IN ({_id_sql(batch)})
                  AND steamid IS NOT NULL AND steamid <> ''
                """,
                table="dwd_match_player_positions",
                columns=("match_id", "steamid", "name", "team", "hits_5m", "lane_role"),
                prefer=lambda row: (
                    str(row[3]) in {"2", "3"}, str(row[5]) in {"1", "2", "3"},
                    row[4] is not None, bool(str(row[2] or "").strip()),
                ),
            )
        )

    position_by_player_game: dict[tuple[int, str], dict] = {}
    dwd_players_by_match: dict[int, set[str]] = defaultdict(set)
    for match_id_raw, steamid, nickname, team_raw, hits_raw, lane_raw in dwd_rows:
        match_id = _to_int(match_id_raw, "dwd_match_player_positions.match_id")
        team = _to_int(team_raw, "dwd_match_player_positions.team")
        steam = str(steamid or "").strip()
        if match_id not in matches or not steam or steam == "0":
            continue
        team_name = team_identity(match_id, team)
        if not team_name:
            continue
        lane = _to_int(lane_raw, "dwd_match_player_positions.lane_role")
        if lane not in (1, 2, 3):
            lane = None
        hits = _to_int(hits_raw, "dwd_match_player_positions.hits_5m")
        position_by_player_game[(match_id, steam)] = {
            "match_id": match_id,
            "league_id": matches[match_id]["league_id"],
            "team_name": team_name,
            "steamid": steam,
            "nickname": str(nickname or ""),
            "hits": hits,
            "lane_role": lane,
            "lane_source": "dwd" if lane is not None else "missing",
            "hits_source": "dwd_hits_5m" if hits is not None else "missing",
        }
        dwd_players_by_match[match_id].add(steam)

    fallback_match_ids = {
        match_id for match_id in match_ids
        if len(dwd_players_by_match.get(match_id, set())) < 10
    }
    fallback_match_ids.update(
        row["match_id"] for row in position_by_player_game.values()
        if row["hits"] is None
    )
    player_rows: list[tuple] = []
    for batch in _batches(sorted(fallback_match_ids)):
        player_rows.extend(
            _fetch_deduplicated(
                cur,
                f"""
                SELECT match_id, slot, steamid, persona, team
                FROM dota2_analysis.players
                WHERE match_id IN ({_varchar_id_sql(batch)})
                """,
                table="players",
                columns=("match_id", "slot", "steamid", "persona", "team"),
            )
        )

    slots_by_player_game: dict[tuple[int, str], int] = {}
    fallback_participants_added = 0
    for match_id_raw, slot_raw, steamid, persona, team_raw in player_rows:
        match_id = _to_int(match_id_raw, "players.match_id")
        slot = _to_int(slot_raw, "players.slot")
        team = _to_int(team_raw, "players.team")
        steam = str(steamid or "").strip()
        if match_id not in matches or slot is None or not steam or steam == "0":
            continue
        team_name = team_identity(match_id, team)
        if not team_name:
            continue
        key = (match_id, steam)
        slots_by_player_game[key] = slot
        if key not in position_by_player_game:
            position_by_player_game[key] = {
                "match_id": match_id,
                "league_id": matches[match_id]["league_id"],
                "team_name": team_name,
                "steamid": steam,
                "nickname": str(persona or ""),
                "hits": None,
                "lane_role": None,
                "lane_source": "missing",
                "hits_source": "missing",
            }
            fallback_participants_added += 1
        elif not position_by_player_game[key]["nickname"] and persona:
            position_by_player_game[key]["nickname"] = str(persona)

    interval_match_ids = sorted({
        match_id for (match_id, steam), row in position_by_player_game.items()
        if row["hits"] is None and (match_id, steam) in slots_by_player_game
    })
    fallback_partitions = {
        int(match_id): str(partition_date)
        for match_id, partition_date in partition_date_by_match.items()
        if str(partition_date or "")
    }
    pro_rows: list[tuple] = []
    for batch in _batches(interval_match_ids):
        pro_rows.extend(
            _fetch_deduplicated(
                cur,
                f"""
                SELECT match_id, start_time
                FROM dota2_analysis.pro_match_list_2
                WHERE match_id IN ({_id_sql(batch)})
                """,
                table="pro_match_list_2",
                columns=("match_id", "start_time"),
                prefer=lambda row: (_to_int(row[1], "pro_match_list_2.start_time", -1),),
            )
        )
    for match_id_raw, start_time in pro_rows:
        match_id = _to_int(match_id_raw, "pro_match_list_2.match_id")
        if match_id is not None:
            fallback_partitions[match_id] = _unix_date(start_time)
    for match_id in interval_match_ids:
        if match_id in fallback_partitions:
            continue
        end_time = matches[match_id].get("end_time")
        if end_time:
            fallback_partitions[match_id] = datetime.fromtimestamp(
                end_time, tz=timezone.utc
            ).date().isoformat()

    interval_rows: list[tuple] = []
    for partition_date, batch in _partition_batches(
        interval_match_ids, fallback_partitions
    ):
        interval_rows.extend(
            _fetch_deduplicated(
                cur,
                f"""
                SELECT match_id, time, slot, log_index, lh
                FROM dota2_analysis.player_intervals2
                WHERE dt = '{partition_date}'
                  AND match_id IN ({_varchar_id_sql(batch)})
                  AND time = 600
                """,
                table="player_intervals2",
                columns=("match_id", "time", "slot", "log_index", "lh"),
            )
        )
    interval_rows.sort(key=lambda row: (
        _to_int(row[0], "player_intervals2.match_id", -1),
        _to_int(row[2], "player_intervals2.slot", -1),
        _to_int(row[3], "player_intervals2.log_index", -1),
    ))
    hits_by_slot: dict[tuple[int, int], int] = {}
    for match_id_raw, _time, slot_raw, _log_index, hits_raw in interval_rows:
        match_id = _to_int(match_id_raw, "player_intervals2.match_id")
        slot = _to_int(slot_raw, "player_intervals2.slot")
        hits = _to_int(hits_raw, "player_intervals2.lh")
        if match_id is not None and slot is not None and hits is not None:
            hits_by_slot[(match_id, slot)] = hits
    interval_hits_recovered = 0
    for key, row in position_by_player_game.items():
        if row["hits"] is not None:
            continue
        slot = slots_by_player_game.get(key)
        hits = hits_by_slot.get((key[0], slot)) if slot is not None else None
        if hits is not None:
            row["hits"] = hits
            row["hits_source"] = "player_intervals2_lh_10m"
            interval_hits_recovered += 1

    primary_rows = list(position_by_player_game.values())
    primary_shapes = _team_lane_shapes(primary_rows)
    problematic_teams = {
        team for team, shape in primary_shapes.items() if shape != (2, 1, 2)
    }
    opendota_match_ids = sorted({
        row["match_id"] for row in primary_rows
        if _position_team(row) in problematic_teams
    })
    lane_roles_by_match: dict[int, dict[str, int]] = {}
    opendota_failed: list[int] = []
    for match_id in opendota_match_ids:
        try:
            lane_roles = _load_opendota_lane_roles(match_id)
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            lane_roles = {}
        if lane_roles:
            lane_roles_by_match[match_id] = lane_roles
        else:
            opendota_failed.append(match_id)
    source_rows, recovery_stats = _apply_opendota_lane_fallback(
        primary_rows, lane_roles_by_match
    )

    roles, assign_stats = _assign_positions(source_rows)
    candidates: dict[tuple[int, str], list[dict]] = defaultdict(list)
    for (league_id, _team_key_value, steam), info in roles.items():
        candidates[(league_id, steam)].append(info)
    unique_by_player = {
        key: values[0] for key, values in candidates.items() if len(values) == 1
    }

    stats = {
        "source_rows": len(source_rows),
        "bounded_matches": len(league_by_match),
        "league_matches": len(match_ids),
        "league_ids": league_ids,
        "team_tag_identity_fallback_rows": sum(
            str(row.get("team_name") or "").startswith("tag:")
            for row in source_rows
        ),
        "primary": assign_stats,
        "dwd": {
            "table": "dwd_dota2.dwd_match_player_positions",
            "approved_execution_dependency": True,
            "freshness_warning": "dwd_dota2 is derived and may be stale or inaccurate",
            "player_rows": len(dwd_rows),
            "lane_rows": sum(row.get("lane_source") == "dwd" for row in primary_rows),
            "hits_5m_rows": sum(row.get("hits_source") == "dwd_hits_5m" for row in primary_rows),
        },
        "fallback": {
            "player_matches": len(fallback_match_ids),
            "participants_added": fallback_participants_added,
            "interval_matches": len(interval_match_ids),
            "interval_rows": len(interval_rows),
            "ten_minute_hits_recovered": interval_hits_recovered,
            "missing_partition_matches": sum(
                match_id not in fallback_partitions for match_id in interval_match_ids
            ),
        },
        "opendota": {
            "requested_matches": len(opendota_match_ids),
            "matched_matches": len(lane_roles_by_match),
            "lane_rows": recovery_stats["adopted_lane_rows"],
            **recovery_stats,
            "failed_match_ids": opendota_failed,
        },
    }
    return roles, unique_by_player, stats


def main() -> int:
    valid_item_ids = _load_item_ids()
    conn = _connect()
    cur = conn.cursor()
    date_from, date_to = _date_bounds()
    date_to_exclusive = date.fromisoformat(date_to) + timedelta(days=1)
    start_timestamp = int(
        datetime.combine(date.fromisoformat(date_from), datetime.min.time(), timezone.utc).timestamp()
    )
    end_timestamp = int(
        datetime.combine(date_to_exclusive, datetime.min.time(), timezone.utc).timestamp()
    )

    print(f"[1/13] Loading bounded match scope ({date_from} .. {date_to})...")
    scope_rows = _fetch_deduplicated(
        cur,
        f"""
        SELECT match_id, patch_version, league_id, league_name, start_time
        FROM dota2_analysis.pro_match_list_2
        WHERE patch_version <> 'Unknown'
          AND start_time >= {start_timestamp}
          AND start_time < {end_timestamp}
        """,
        table="pro_match_list_2",
        columns=("match_id", "patch_version", "league_id", "league_name", "start_time"),
        prefer=lambda row: (_to_int(row[4], "pro_match_list_2.start_time", -1),),
    )
    scope_by_match = {
        int(match_id): {
            "patch": patch,
            "league_id": int(league_id or 0),
            "league_name": league_name,
            "start_time": int(start_time or 0),
        }
        for match_id, patch, league_id, league_name, start_time in scope_rows
    }
    if not scope_by_match:
        raise SystemExit("No professional matches found in the requested date range")
    scoped_ids = sorted(scope_by_match)
    league_by_match = {
        match_id: row["league_id"] for match_id, row in scope_by_match.items()
    }
    partition_date_by_match = {
        match_id: _unix_date(row["start_time"])
        for match_id, row in scope_by_match.items()
    }

    print("[2/13] Loading raw match/player dimensions; deduplicating in memory...")
    match_infos: dict[int, tuple] = {}
    player_rows: list[tuple] = []
    for batch in _batches(scoped_ids):
        ids = _varchar_id_sql(batch)
        match_batch = _fetch_deduplicated(
            cur,
            f"""
            SELECT match_id, radiant_team_id, radiant_team_tag,
                   dire_team_id, dire_team_tag, end_time
            FROM dota2_analysis.match_info
            WHERE match_id IN ({ids})
            """,
            table="match_info",
            columns=("match_id", "radiant_team_id", "radiant_team_tag",
                     "dire_team_id", "dire_team_tag", "end_time"),
            prefer=lambda row: (_to_int(row[5], "match_info.end_time", -1),),
        )
        for match_id, radiant_id, radiant_tag, dire_id, dire_tag, end_time in match_batch:
            match_infos[int(match_id)] = (
                radiant_id, radiant_tag, dire_id, dire_tag, end_time
            )
        player_rows.extend(
            _fetch_deduplicated(
                cur,
                f"""
            SELECT match_id, slot, steamid, hero_name, hero_id,
                   persona, team, win
            FROM dota2_analysis.players
            WHERE match_id IN ({ids})
            """,
                table="players",
                columns=("match_id", "slot", "steamid", "hero_name", "hero_id",
                         "persona", "team", "win"),
            )
        )

    print("[3/13] Loading canonical names only for scoped players...")
    steamids = sorted({int(row[2]) for row in player_rows if row[2]})
    pro_names = {}
    for batch in _batches(steamids):
        name_rows = _fetch_deduplicated(
            cur,
            f"SELECT steamid, name FROM dota2_analysis.pro_players "
            f"WHERE steamid IN ({_id_sql(batch)})",
            table="pro_players",
            columns=("steamid", "name"),
        )
        pro_names.update({str(s): n for s, n in name_rows if n})

    print("[4/13] Computing full-league positions from DWD lanes/hits with explicit fallbacks...")
    scoped_players_by_match: dict[int, set[str]] = defaultdict(set)
    for match_id, _slot, steamid, *_rest in player_rows:
        if steamid is not None:
            scoped_players_by_match[int(match_id)].add(str(steamid))
    roles, roles_by_player, position_stats = _load_positions(
        cur, league_by_match, partition_date_by_match, scoped_players_by_match
    )
    print(
        f"      {len(roles):,} full-league team/player positions; "
        f"DWD five-minute hits {position_stats['dwd'].get('hits_5m_rows', 0):,} rows; "
        f"OpenDota adopted lanes {position_stats['opendota'].get('lane_rows', 0):,} rows; "
        f"{position_stats['primary'].get('teams_hits_fallback', 0)} team(s) "
        "remained on the user-approved ten-minute CS fallback"
    )

    records: dict[tuple[int, int], dict] = {}
    detail_players: dict[str, dict] = {}
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
        match_time = _unix_date(scope["start_time"])
        radiant_id, radiant_tag, dire_id, dire_tag, _end_time = info
        slot = int(slot)
        steam_key = str(steamid or "")
        is_radiant = int(team or 0) == 2
        team_id = str(radiant_id if is_radiant else dire_id)
        team_name = radiant_tag if is_radiant else dire_tag
        league_key = int(league_id or 0)
        role_info = roles.get(
            (league_key, _team_identity(team_id, team_name), steam_key)
        )
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
            # gold, xp, denies, teamfight participation, towers, stuns,
            # observer wards, sentries, stacks, runes, prediction,
            # hero damage and tower damage. Missing source stays null.
            "x": None,
            "f": [],
            "i": [],
            # null = source timeline not scanned/missing; [] = scanned, no use.
            "u": None,
        }
        hero_key_for_match[(match_id, str(hero_name or ""))] = key
        match_ids.add(match_id)

    print(f"      {len(match_ids):,} matches / {len(records):,} player-games")

    print("[5/13] Loading raw interval rows; deduplicating before snapshot selection...")
    snapshot_times = (300, 600, 900, 1200, 1500, 1800, 2400, 3000)
    duration_bounds: dict[int, tuple[int, int]] = {}
    duration_hint_sources: Counter = Counter()
    for match_id in match_ids:
        duration = None
        try:
            duration = _to_int(
                _load_opendota_match(match_id).get("duration"),
                "opendota.duration",
            )
        except (OSError, ValueError, json.JSONDecodeError):
            pass
        if duration is not None and duration > 0:
            duration_bounds[match_id] = (max(0, duration - 30), duration + 30)
            duration_hint_sources["opendota_exact_match"] += 1
            continue
        end_time = _to_int(match_infos.get(match_id, (None,) * 5)[4], "match_info.end_time")
        start_time = _to_int(scope_by_match.get(match_id, {}).get("start_time"), "pro_match_list_2.start_time")
        if end_time is not None and start_time is not None and end_time > start_time:
            approximate = max(0, end_time - start_time - 1800)
            duration_bounds[match_id] = (max(0, approximate - 600), approximate + 600)
            duration_hint_sources["metadata_approximation"] += 1
    final_interval_rows: dict[tuple[int, int], tuple] = {}
    snapshot_interval_rows: list[tuple] = []
    interval_columns = (
        "match_id", "time", "slot", "log_index", "level", "networth", "lh",
        "kills", "deaths", "assists", "x", "y", "denies", "xp", "gold",
        "teamfight_participation", "towers_killed", "stuns", "observers_placed",
        "sen_placed", "creeps_stacked", "rune_pickups", "pred_vict",
    )
    for partition_date, batch in _partition_batches(
        match_ids, partition_date_by_match
    ):
        ids = _varchar_id_sql(batch)
        final_predicate = " OR ".join(
            f"(match_id = '{match_id}' AND time BETWEEN {low} AND {high})"
            for match_id, (low, high) in duration_bounds.items()
            if match_id in set(batch)
        ) or "FALSE"
        interval_batch = _fetch_deduplicated(
            cur,
            f"""
            SELECT match_id, time, slot, log_index, level, networth, lh,
                   kills, deaths, assists, x, y, denies, xp, gold,
                   teamfight_participation, towers_killed, stuns,
                   observers_placed, sen_placed, creeps_stacked,
                   rune_pickups, pred_vict
            FROM dota2_analysis.player_intervals2
            WHERE dt = '{partition_date}'
              AND match_id IN ({ids})
              AND (
                time IN ({','.join(str(value) for value in snapshot_times)})
                OR ({final_predicate})
              )
            """,
            table="player_intervals2",
            columns=interval_columns,
        )
        for row in interval_batch:
            match_id = _to_int(row[0], "player_intervals2.match_id")
            seconds = _to_int(row[1], "player_intervals2.time")
            slot = _to_int(row[2], "player_intervals2.slot")
            log_index = _to_int(row[3], "player_intervals2.log_index", -1)
            if match_id is None or seconds is None or slot is None:
                continue
            key = (match_id, slot)
            current = final_interval_rows.get(key)
            bounds = duration_bounds.get(match_id)
            if bounds and bounds[0] <= seconds <= bounds[1]:
                if current is None or (seconds, log_index) > (
                    _to_int(current[1], "player_intervals2.time", -1),
                    _to_int(current[3], "player_intervals2.log_index", -1),
                ):
                    final_interval_rows[key] = row
            if seconds in snapshot_times:
                snapshot_interval_rows.append(row)

    for key, row in final_interval_rows.items():
        rec = records.get(key)
        if not rec:
            continue
        rec["lv"] = _to_int(row[4], "player_intervals2.level", 1)
        rec["nw"] = _to_int(row[5], "player_intervals2.networth", 0)
        rec["du"] = _to_int(row[1], "player_intervals2.time", 0)
        rec["x"] = [
            _to_int(row[14], "player_intervals2.gold", 0),
            _to_int(row[13], "player_intervals2.xp", 0),
            _to_int(row[12], "player_intervals2.denies", 0),
            _round_number(_to_float(row[15], "player_intervals2.teamfight_participation"), 3),
            _to_int(row[16], "player_intervals2.towers_killed", 0),
            _round_number(_to_float(row[17], "player_intervals2.stuns"), 1),
            _to_int(row[18], "player_intervals2.observers_placed", 0),
            _to_int(row[19], "player_intervals2.sen_placed", 0),
            _to_int(row[20], "player_intervals2.creeps_stacked", 0),
            _to_int(row[21], "player_intervals2.rune_pickups", 0),
            _to_int(row[22], "player_intervals2.pred_vict", 0), 0, 0,
        ]

    print("[6/13] Building local replay item mapping from the versioned item catalog...")
    replay_to_item = _load_replay_item_mapping(valid_item_ids)

    print("[7/13] Loading bounded raw inventory windows; selecting snapshots locally...")
    unresolved = Counter()
    inventory_targets = (0, 1200, 2100, 3300)
    inventory_candidates: dict[tuple[int, int, int], tuple[int, list[str]]] = {}
    final_inventory_candidates: dict[tuple[int, int], tuple[int, list[str]]] = {}
    duration_by_match = {
        match_id: max(
            (int(rec.get("du") or 0) for rec in records.values() if int(rec["m"]) == match_id),
            default=0,
        )
        for match_id in match_ids
    }
    inventory_predicate = " OR ".join(
        "time BETWEEN 0 AND 90" if target == 0
        else f"time BETWEEN {target - 120} AND {target}"
        for target in inventory_targets
    )
    for partition_date, batch in _partition_batches(
        match_ids, partition_date_by_match
    ):
        ids = _id_sql(batch)
        final_windows = {
            int(match_id): (
                max(0, int(duration_by_match.get(int(match_id), 0)) - 180),
                int(duration_by_match.get(int(match_id), 0)) + 180,
            )
            for match_id in batch
            if int(duration_by_match.get(int(match_id), 0)) > 0
        }
        final_predicate = " OR ".join(
            f"(match_id = {match_id} AND time BETWEEN {low} AND {high})"
            for match_id, (low, high) in final_windows.items()
        ) or "FALSE"
        inventory_rows = _fetch_deduplicated(
            cur,
            f"""
            SELECT match_id, time, log_index, type, slot, items
            FROM dota2_analysis.hero_status_update
            WHERE dt = '{partition_date}' AND match_id IN ({ids})
              AND type = 'hero_status_update'
              AND (({inventory_predicate}) OR ({final_predicate}))
            """,
            table="hero_status_update",
            columns=("match_id", "time", "log_index", "type", "slot", "items"),
        )
        for match_id_raw, seconds_raw, _log_index, _type, slot_raw, raw_items in inventory_rows:
            match_id = _to_int(match_id_raw, "hero_status_update.match_id")
            seconds = _to_int(seconds_raw, "hero_status_update.time")
            slot = _to_int(slot_raw, "hero_status_update.slot")
            if match_id is None or seconds is None or slot is None:
                continue
            key = (match_id, slot)
            if key not in records:
                continue
            mapped = _mapped_inventory(
                raw_items, replay_to_item, valid_item_ids, unresolved
            )
            final_window = final_windows.get(match_id)
            if final_window and final_window[0] <= seconds <= final_window[1]:
                current = final_inventory_candidates.get(key)
                if current is None or seconds > current[0]:
                    final_inventory_candidates[key] = (seconds, mapped)
            for target in inventory_targets:
                in_window = (target == 0 and 0 <= seconds <= 90) or (
                    target > 0 and target - 120 <= seconds <= target
                )
                if not in_window:
                    continue
                bucket = (key[0], key[1], target)
                existing = inventory_candidates.get(bucket)
                better = existing is None or (
                    seconds < existing[0] if target == 0 else seconds > existing[0]
                )
                if better:
                    inventory_candidates[bucket] = (seconds, mapped)
    for key, (_seconds, item_ids) in final_inventory_candidates.items():
        records[key]["f"] = item_ids
    for (match_id, slot, target), (seconds, item_ids) in inventory_candidates.items():
        player = detail_players.setdefault(
            f"{match_id}:{slot}", {"q": [], "a": [], "iv": [], "dm": []}
        )
        player["iv"].append([target, seconds, item_ids])
    for player in detail_players.values():
        player["iv"].sort(key=lambda row: row[0])

    print("[8/13] Loading raw purchase events; deduplicating and aggregating locally...")
    combatlog_purchase_matches: set[int] = set()
    first_purchases: dict[tuple[tuple[int, int], str], int] = {}
    for partition_date, batch in _partition_batches(
        match_ids, partition_date_by_match
    ):
        ids = _varchar_id_sql(batch)
        purchase_rows = _fetch_deduplicated(
            cur,
            f"""
            SELECT match_id, time, log_index, type, targetname, valuename
            FROM dota2_analysis.combat_logs
            WHERE dt = '{partition_date}'
              AND match_id IN ({ids})
              AND type = 'DOTA_COMBATLOG_PURCHASE'
            """,
            table="combat_logs",
            columns=("match_id", "time", "log_index", "type", "targetname", "valuename"),
        )
        for match_id_raw, time_raw, _log_index, _type, hero_name, item_id in purchase_rows:
            match_id = _to_int(match_id_raw, "combat_logs.match_id")
            seconds = _to_int(time_raw, "combat_logs.time")
            if match_id is None or seconds is None:
                continue
            combatlog_purchase_matches.add(match_id)
            hero_name = str(hero_name or "")
            item_id = str(item_id or "")
            if not hero_name.startswith("npc_dota_hero_"):
                continue
            if item_id.startswith("item_recipe_") or item_id not in valid_item_ids:
                continue
            record_key = hero_key_for_match.get((match_id, hero_name))
            if record_key is None:
                continue
            purchase_key = (record_key, item_id)
            seconds = max(0, seconds)
            current = first_purchases.get(purchase_key)
            if current is None or seconds < current:
                first_purchases[purchase_key] = seconds

    for (record_key, item_id), first_time in first_purchases.items():
        records[record_key]["i"].append([item_id, first_time])

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
    for partition_date, partition_batch in _partition_batches(
        match_ids, partition_date_by_match
    ):
        for batch in _batches(partition_batch, COMBAT_BATCH_SIZE):
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
            use_rows = _fetch_deduplicated(
                cur,
                f"""
                SELECT match_id, time, log_index, type, attackername, inflictor
                FROM dota2_analysis.combat_logs
                WHERE dt = '{partition_date}'
                  AND match_id IN ({ids})
                  AND type = 'DOTA_COMBATLOG_ITEM'
                  AND inflictor IN ({item_ids})
                """,
                table="combat_logs",
                columns=("match_id", "time", "log_index", "type", "attackername", "inflictor"),
            )
            for match_id_raw, time_raw, _log_index, _type, hero_name, item_id in use_rows:
                match_id = _to_int(match_id_raw, "combat_logs.match_id")
                raw_use_time = _to_int(time_raw, "combat_logs.time")
                if match_id is None or raw_use_time is None:
                    continue
                item_use_source_matches.add(match_id)
                item_id = str(item_id or "")
                if item_id not in valid_item_ids:
                    continue
                hero_name = str(hero_name or "")
                if not hero_name.startswith("npc_dota_hero_"):
                    continue
                record_key = hero_key_for_match.get((match_id, hero_name))
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
                use_time = max(0, raw_use_time)
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

    print("[9/13] Selecting economy/KDA snapshots from deduplicated interval rows...")
    team_totals: Counter = Counter()
    snapshot_rows = []
    for row in snapshot_interval_rows:
        match_id = _to_int(row[0], "player_intervals2.match_id")
        seconds = _to_int(row[1], "player_intervals2.time")
        slot = _to_int(row[2], "player_intervals2.slot")
        if match_id is None or seconds is None or slot is None:
            continue
        key = (match_id, slot)
        rec = records.get(key)
        if not rec:
            continue
        compact = [
            seconds,
            _to_int(row[4], "player_intervals2.level", 0),
            _to_int(row[5], "player_intervals2.networth", 0),
            _to_int(row[6], "player_intervals2.lh", 0),
            _to_int(row[7], "player_intervals2.kills", 0),
            _to_int(row[8], "player_intervals2.deaths", 0),
            _to_int(row[9], "player_intervals2.assists", 0),
            _round_number(_to_float(row[10], "player_intervals2.x")),
            _round_number(_to_float(row[11], "player_intervals2.y")),
            0,
            _to_int(row[12], "player_intervals2.denies", 0),
            _to_int(row[13], "player_intervals2.xp", 0),
            _to_int(row[14], "player_intervals2.gold", 0),
            _round_number(_to_float(row[15], "player_intervals2.teamfight_participation"), 3),
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
        detail_players.setdefault(
            f"{key[0]}:{key[1]}", {"q": [], "a": [], "iv": [], "dm": []}
        )["q"].append(compact)
        if compact[0] == 900:
            # level, net worth, last hits, K/D/A, team net-worth difference
            rec["g"] = compact[1:7] + [compact[9]]
    for rec in records.values():
        rec.setdefault("g", None)

    print("[10/13] Loading raw hero skill events; deduplicating before sequencing...")
    ability_rows = 0
    for partition_date, batch in _partition_batches(
        match_ids, partition_date_by_match
    ):
        ids = _varchar_id_sql(batch)
        ability_batch = _fetch_deduplicated(
            cur,
            f"""
            SELECT match_id, time, log_index, type, targetname, valuename, abilitylevel
            FROM dota2_analysis.hero_ability_level
            WHERE dt = '{partition_date}'
              AND match_id IN ({ids})
              AND type = 'DOTA_ABILITY_LEVEL'
            """,
            table="hero_ability_level",
            columns=("match_id", "time", "log_index", "type", "targetname", "valuename", "abilitylevel"),
        )
        ability_batch.sort(
            key=lambda row: (
                _to_int(row[0], "hero_ability_level.match_id", -1),
                _to_int(row[1], "hero_ability_level.time", -1),
                _to_int(row[2], "hero_ability_level.log_index", -1),
            )
        )
        for match_id_raw, seconds_raw, _log_index, _type, targetname, ability, ability_level_raw in ability_batch:
            match_id = _to_int(match_id_raw, "hero_ability_level.match_id")
            seconds = _to_int(seconds_raw, "hero_ability_level.time")
            ability_level = _to_int(ability_level_raw, "hero_ability_level.abilitylevel")
            if match_id is None or seconds is None or seconds < 0 or not ability_level or ability_level < 1:
                continue
            if not str(targetname or "").startswith("npc_dota_hero_"):
                continue
            key = hero_key_for_match.get((match_id, str(targetname or "")))
            if not key:
                continue
            ability = str(ability or "")
            if not ability or ability.endswith("generic_hidden"):
                continue
            detail_players.setdefault(
                f"{key[0]}:{key[1]}", {"q": [], "a": [], "iv": [], "dm": []}
            )
            detail = detail_players[f"{key[0]}:{key[1]}"]
            detail["a"].append([seconds, ability, ability_level])
            detail["a_src"] = "starrocks"
            ability_rows += 1

    ability_ids = _load_ability_ids()
    opendota_ability_player_games = 0
    opendota_ability_rows = 0
    opendota_ability_failures = []
    missing_skills_by_match: dict[int, list[tuple[tuple[int, int], dict]]] = defaultdict(list)
    for key, record in records.items():
        detail = detail_players.setdefault(
            f"{key[0]}:{key[1]}", {"q": [], "a": [], "iv": [], "dm": []}
        )
        if not detail.get("a"):
            missing_skills_by_match[key[0]].append((key, record))
    if ability_ids:
        for match_id, missing_records in sorted(missing_skills_by_match.items()):
            try:
                opendota_match = _load_opendota_match(match_id)
            except (OSError, ValueError, json.JSONDecodeError):
                opendota_ability_failures.append(match_id)
                continue
            for key, record in missing_records:
                route = _parse_opendota_ability_route(
                    opendota_match, int(record.get("hi") or 0), ability_ids
                )
                if not route:
                    continue
                detail = detail_players[f"{key[0]}:{key[1]}"]
                detail["a"] = route
                detail["a_src"] = "opendota"
                opendota_ability_player_games += 1
                opendota_ability_rows += len(route)

    print("[11/13] Loading raw draft rows; deduplicating by (match_id, ord)...")
    drafts: dict[str, dict] = {}
    hero_names_by_id = _load_hero_ids()
    for batch in _batches(match_ids):
        ids = _varchar_id_sql(batch)
        draft_rows = _fetch_deduplicated(
            cur,
            f"""
            SELECT match_id, ord, is_pick, team, hero_id
            FROM dota2_analysis.match_picks_bans
            WHERE match_id IN ({ids})
            """,
            table="match_picks_bans",
            columns=("match_id", "ord", "is_pick", "team", "hero_id"),
        )
        draft_rows.sort(
            key=lambda row: (
                _to_int(row[0], "match_picks_bans.match_id", -1),
                _to_int(row[1], "match_picks_bans.ord", -1),
            )
        )
        for match_id_raw, order_raw, is_pick, team_raw, hero_id_raw in draft_rows:
            match_id = _to_int(match_id_raw, "match_picks_bans.match_id")
            order = _to_int(order_raw, "match_picks_bans.ord")
            team = _to_int(team_raw, "match_picks_bans.team")
            hero_id = _to_int(hero_id_raw, "match_picks_bans.hero_id")
            if None in (match_id, order, team, hero_id):
                continue
            draft = drafts.setdefault(str(match_id), {"p": [], "b": []})
            picked = str(is_pick).lower() in {"1", "true", "yes"}
            draft["p" if picked else "b"].append(
                [order, team, hero_id, hero_names_by_id.get(hero_id, "")]
            )

    print("[12/13] Loading raw combat events; deduplicating before timelines/metrics...")
    events: dict[str, list] = defaultdict(list)
    event_codes = {
        "DOTA_COMBATLOG_DEATH": "d",
        "DOTA_COMBATLOG_BUYBACK": "bb",
        "DOTA_COMBATLOG_TEAM_BUILDING_KILL": "tower",
    }
    event_query_failures = 0
    event_match_ids = sorted(match_ids)
    event_batch_number = 0
    for partition_date, partition_batch in _partition_batches(
        event_match_ids, partition_date_by_match
    ):
        for batch in _batches(partition_batch, COMBAT_BATCH_SIZE):
            event_batch_number += 1
            batch_sql = _varchar_id_sql(batch)
            try:
                timeline_rows = _fetch_deduplicated(
                    cur,
                    f"""
                    SELECT match_id, time, log_index, type, attackername,
                           targetname, inflictor, value, targethero, targetillusion
                    FROM dota2_analysis.combat_logs
                    WHERE dt = '{partition_date}'
                      AND match_id IN ({batch_sql})
                      AND type IN ('DOTA_COMBATLOG_DEATH',
                                   'DOTA_COMBATLOG_BUYBACK',
                                   'DOTA_COMBATLOG_TEAM_BUILDING_KILL')
                    """,
                    table="combat_logs",
                    columns=("match_id", "time", "log_index", "type", "attackername",
                             "targetname", "inflictor", "value", "targethero", "targetillusion"),
                )
                timeline_rows.sort(
                    key=lambda row: (
                        _to_int(row[0], "combat_logs.match_id", -1),
                        _to_int(row[1], "combat_logs.time", -1),
                        _to_int(row[2], "combat_logs.log_index", -1),
                    )
                )
                for row in timeline_rows:
                    match_id = _to_int(row[0], "combat_logs.match_id")
                    seconds = _to_int(row[1], "combat_logs.time")
                    event_type = str(row[3] or "")
                    if match_id is None or seconds is None or seconds < 0:
                        continue
                    if event_type == "DOTA_COMBATLOG_DEATH" and not (
                        str(row[8]).lower() == "true"
                        and str(row[9]).lower() != "true"
                    ):
                        continue
                    events[str(match_id)].append([
                        seconds, event_codes.get(event_type, event_type),
                        _hero_name(row[4]), _hero_name(row[5]),
                        str(row[6] or ""), str(row[7] or ""),
                    ])
            except pymysql.MySQLError as exc:
                event_query_failures += 1
                print(f"      event batch {event_batch_number} skipped: {exc.args[0]}")

    print("      Loading five-minute hero/building damage buckets...")
    damage_rows = 0
    damage_query_failures = 0
    damage_buckets: dict[tuple[tuple[int, int], int], list[int]] = defaultdict(
        lambda: [0, 0]
    )
    for partition_date, partition_batch in _partition_batches(
        event_match_ids, partition_date_by_match
    ):
        for batch in _batches(partition_batch, COMBAT_BATCH_SIZE):
            batch_sql = _varchar_id_sql(batch)
            try:
                raw_damage_rows = _fetch_deduplicated(
                    cur,
                    f"""
                    SELECT match_id, time, log_index, type, attackername,
                           targetname, value, attackerhero, targethero,
                           attackerillusion, targetillusion
                    FROM dota2_analysis.combat_logs
                    WHERE dt = '{partition_date}'
                      AND match_id IN ({batch_sql})
                      AND type = 'DOTA_COMBATLOG_DAMAGE'
                    """,
                    table="combat_logs",
                    columns=("match_id", "time", "log_index", "type", "attackername",
                             "targetname", "value", "attackerhero", "targethero",
                             "attackerillusion", "targetillusion"),
                )
                for row in raw_damage_rows:
                    match_id = _to_int(row[0], "combat_logs.match_id")
                    seconds = _to_int(row[1], "combat_logs.time")
                    value = _to_float(row[6], "combat_logs.value")
                    if match_id is None or seconds is None or seconds < 0 or value is None:
                        continue
                    if str(row[7]).lower() != "true" or str(row[9]).lower() == "true":
                        continue
                    hero_target = (
                        str(row[8]).lower() == "true"
                        and str(row[10]).lower() != "true"
                    )
                    tower_target = "tower" in str(row[5] or "").lower()
                    if not hero_target and not tower_target:
                        continue
                    key = hero_key_for_match.get((match_id, str(row[4] or "")))
                    if not key:
                        continue
                    bucket = seconds // 300 * 300
                    aggregate = damage_buckets[(key, bucket)]
                    amount = max(0, int(value))
                    if hero_target:
                        aggregate[0] += amount
                    if tower_target:
                        aggregate[1] += amount
            except pymysql.MySQLError as exc:
                damage_query_failures += 1
                print(f"      damage batch skipped: {exc.args[0]}")

    for (key, bucket), (hero_damage, tower_damage) in sorted(
        damage_buckets.items(), key=lambda row: (row[0][0], row[0][1])
    ):
        if not hero_damage and not tower_damage:
            continue
        player = detail_players.setdefault(
            f"{key[0]}:{key[1]}", {"q": [], "a": [], "iv": [], "dm": []}
        )
        player["dm"].append([bucket, hero_damage, tower_damage])
        metrics = records[key].get("x")
        if metrics is not None:
            metrics[11] += hero_damage
            metrics[12] += tower_damage
        damage_rows += 1

    print("[13/13] Writing compact index and on-demand detail datasets...")
    rows = list(records.values())
    rows.sort(key=lambda r: (r["d"], r["m"], r["s"]))
    for player in detail_players.values():
        player["q"].sort(key=lambda row: row[0])
        player["a"].sort(key=lambda row: row[0])
        player["iv"].sort(key=lambda row: row[0])
        player["dm"].sort(key=lambda row: row[0])
    for match_events in events.values():
        match_events.sort(key=lambda row: row[0])
    patches = Counter(r["p"] for r in rows)
    leagues = Counter(r["l"] for r in rows)
    payload = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": (
                "approved dwd_match_player_positions role source + "
                "dota2_analysis authoritative match/build export + exact OpenDota fallbacks"
            ),
            "position_source_warning": (
                "dwd_dota2 is a derived source and may be stale or inaccurate; "
                "OpenDota is used only to recover non-2-1-2 lane aggregates"
            ),
            "query_scope": {
                "date_from": date_from,
                "date_to": date_to,
                "date_field": "pro_match_list_2.start_time (UTC calendar projection)",
                "match_batch_size": MATCH_BATCH_SIZE,
                "partition_filter": "one exact dt partition per query",
                "in_match_scope": "finite match_id batches discovered from metadata first",
                "dedup": "post-fetch application-layer semantic keys; never SQL-side",
            },
            "dedup_audit": {
                table: {"key": list(DEDUP_KEYS[table]), **dict(counts)}
                for table, counts in sorted(DEDUP_AUDIT.items())
            },
            "conversion_failures": dict(sorted(CONVERSION_FAILURES.items())),
            "matches": len(match_ids),
            "player_games": len(rows),
            "date_min": min((r["d"] for r in rows), default=""),
            "date_max": max((r["d"] for r in rows), default=""),
            "patches": dict(sorted(patches.items())),
            "leagues": len(leagues),
            "unresolved_inventory_names": sum(unresolved.values()),
            "positions": {
                "assigned_player_games": sum(1 for r in rows if r.get("r") is not None),
                "lane_method_player_games": sum(
                    1 for r in rows if str(r.get("rm") or "").startswith("lanes")
                ),
                "opendota_lane_player_games": sum(
                    1 for r in rows if r.get("rm") == "lanes_opendota"
                ),
                "hits_fallback_player_games": sum(1 for r in rows if r.get("rm") == "hits"),
                "source_stats": position_stats,
            },
            "advanced": {
                "snapshot_player_games": sum(1 for r in rows if r.get("g")),
                "detail_player_games": len(detail_players),
                "ability_events": ability_rows,
                "ability_player_games": sum(
                    bool(row.get("a")) for row in detail_players.values()
                ),
                "opendota_ability_player_games": opendota_ability_player_games,
                "opendota_ability_events": opendota_ability_rows,
                "opendota_ability_failed_match_ids": opendota_ability_failures,
                "draft_matches": len(drafts),
                "event_matches": len(events),
                "event_query_failures": event_query_failures,
                "inventory_snapshot_player_games": sum(
                    bool(row.get("iv")) for row in detail_players.values()
                ),
                "damage_bucket_player_rows": damage_rows,
                "damage_query_failures": damage_query_failures,
                "timed_item_player_games": sum(
                    any(isinstance(pair[1], int) for pair in (r.get("i") or []))
                    for r in rows
                ),
                "combatlog_purchase_matches": len(combatlog_purchase_matches),
                "item_use_source_matches": len(item_use_source_matches),
                "item_use_source_player_games": sum(
                    isinstance(r.get("u"), list) for r in rows
                ),
                "item_use_matches": len(item_use_matches),
                "item_use_player_games": sum(bool(r.get("u")) for r in rows),
                "item_use_records": item_use_events,
                "snapshot_times": list(snapshot_times),
                "duration_hint_sources": dict(duration_hint_sources),
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
    OUT.parent.mkdir(parents=True, exist_ok=True)
    DETAIL_OUT.parent.mkdir(parents=True, exist_ok=True)
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
