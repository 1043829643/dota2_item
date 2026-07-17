"""Build a resumable 100k-match OpenDota highest-rank item cache.

The public page needs each player's six main inventory slots plus three
backpack slots.  The collector therefore stores normalized, slot-preserving
rows in SQLite and publishes a small manifest plus one JSON shard per hero.  It
never keeps full OpenDota match payloads as the durable source of truth.

OpenDota has an important rank quirk: ``/publicMatches`` clamps ``min_rank``
to 75 and its average-medal function also maps Immortal (80) into that highest
75 bucket.  We therefore query the highest bucket, require at least five
visible ranks, keep only Ranked All Draft candidates, and then verify all ten
player ranks from the match detail.  Accepted matches are assigned to one of
two mutually exclusive cohorts: ten Immortal players, or a mixture of
Immortal and Divine players with nobody below Divine.  The manifest records
both cohorts and the internal OpenDota candidate bucket.

Examples::

    # Resume toward the production target.  Anonymous access stops safely
    # before the daily quota is exhausted.
    python scripts/fetch/fetch_opendota_public_items.py --target-matches 100000

    # With a paid/high-limit key (never commit the key):
    $env:OPENDOTA_API_KEY = "..."
    python scripts/fetch/fetch_opendota_public_items.py --target-matches 100000

    # Rebuild only the browser-facing hero shards from the SQLite checkpoint.
    python scripts/fetch/fetch_opendota_public_items.py --export-only
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sqlite3
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / ".cache" / "opendota_immortal_items.sqlite3"
DEFAULT_MANIFEST = ROOT / "data" / "opendota_public_items.json"
DEFAULT_SHARD_ROOT = ROOT / "data" / "opendota_public_items"
LEGACY_MATCH_CACHE = ROOT / ".cache" / "opendota_matches"
PATCH_CACHE = ROOT / ".cache" / "opendota_constants_patch.json"
API_ROOT = "https://api.opendota.com/api"
USER_AGENT = "sikle-item-data-immortal-cache/3.0"

TARGET_MATCHES = 100_000
REQUESTED_IMMORTAL_RANK = 80
OPENDOTA_HIGHEST_AVG_BUCKET = 75
DIVINE_MIN_RANK = 70
DIVINE_MAX_RANK = 75
COHORT_PURE_IMMORTAL = "pure_immortal"
COHORT_IMMORTAL_DIVINE = "immortal_divine"
COHORT_LABELS = {
    COHORT_PURE_IMMORTAL: "纯冠绝",
    COHORT_IMMORTAL_DIVINE: "冠绝＋超凡",
}
COHORT_CODES = {
    COHORT_PURE_IMMORTAL: 0,
    COHORT_IMMORTAL_DIVINE: 1,
}
RANKED_LOBBY_TYPE = 7
ALL_DRAFT_GAME_MODE = 22
DEFAULT_MIN_RANKED_PLAYERS = 5
DEFAULT_MIN_DURATION = 600
DEFAULT_EXPLORER_PAGE_SIZE = 10_000
DEFAULT_BATCH_SIZE = 250
DEFAULT_DAILY_RESERVE = 50
MAIN_ITEM_FIELDS = tuple(f"item_{index}" for index in range(6))
BACKPACK_ITEM_FIELDS = tuple(f"backpack_{index}" for index in range(3))
# Backward-compatible name retained for callers that mean the six main slots.
FINAL_ITEM_FIELDS = MAIN_ITEM_FIELDS
INVENTORY_ITEM_FIELDS = MAIN_ITEM_FIELDS + BACKPACK_ITEM_FIELDS
INVENTORY_SCHEMA_VERSION = 2
EMPTY_ITEM_INDEX = -1
FINAL_ITEM_ALIASES = {
    "item_dagon_2": "item_dagon",
    "item_dagon_3": "item_dagon",
    "item_dagon_4": "item_dagon",
    "item_dagon_5": "item_dagon",
    "item_travel_boots_2": "item_travel_boots",
}

_REQUEST_LOCK = threading.Lock()
_RATE_STATE_LOCK = threading.Lock()
_LAST_REQUEST_AT = 0.0
_RATE_STATE: dict[str, int | None] = {"minute": None, "day": None}


class ApiBudgetExhausted(RuntimeError):
    """Raised when OpenDota reports that the current request budget is empty."""


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--shard-root", type=Path, default=DEFAULT_SHARD_ROOT)
    parser.add_argument(
        "--target-matches",
        type=int,
        default=TARGET_MATCHES,
        help="Total accepted highest-rank ranked matches wanted (default: 100000).",
    )
    parser.add_argument(
        "--max-detail-requests",
        type=int,
        help="Cap match-detail calls for this invocation; useful for validation runs.",
    )
    parser.add_argument(
        "--matches",
        type=int,
        help="Deprecated alias for --max-detail-requests.",
    )
    parser.add_argument("--min-duration", type=int, default=DEFAULT_MIN_DURATION)
    parser.add_argument(
        "--min-ranked-players",
        type=int,
        default=DEFAULT_MIN_RANKED_PLAYERS,
        help="Minimum players contributing a visible rank to OpenDota's match bucket.",
    )
    parser.add_argument(
        "--explorer-page-size",
        type=int,
        default=DEFAULT_EXPLORER_PAGE_SIZE,
    )
    parser.add_argument("--max-discovery-pages", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--workers", type=int)
    parser.add_argument("--request-gap", type=float)
    parser.add_argument("--daily-reserve", type=int, default=DEFAULT_DAILY_RESERVE)
    parser.add_argument("--max-attempts", type=int, default=5)
    parser.add_argument("--export-only", action="store_true")
    parser.add_argument("--discover-only", action="store_true")
    parser.add_argument("--no-export", action="store_true")
    args = parser.parse_args(argv)
    if args.matches is not None:
        if args.max_detail_requests is not None:
            parser.error("use only one of --matches and --max-detail-requests")
        args.max_detail_requests = args.matches
    if args.target_matches < 1:
        parser.error("--target-matches must be at least 1")
    if not 1 <= args.min_ranked_players <= 10:
        parser.error("--min-ranked-players must be between 1 and 10")
    if not 1 <= args.explorer_page_size <= 10_000:
        parser.error("--explorer-page-size must be between 1 and 10000")
    if args.batch_size < 1 or args.max_discovery_pages < 1 or args.max_attempts < 1:
        parser.error("batch/page/attempt limits must be at least 1")
    if args.max_detail_requests is not None and args.max_detail_requests < 0:
        parser.error("--max-detail-requests must be non-negative")
    return args


def _atomic_write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as stream:
            json.dump(payload, stream, ensure_ascii=False, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def _rate_limit(gap: float) -> None:
    global _LAST_REQUEST_AT
    with _REQUEST_LOCK:
        remaining = gap - (time.monotonic() - _LAST_REQUEST_AT)
        if remaining > 0:
            time.sleep(remaining)
        _LAST_REQUEST_AT = time.monotonic()


def _remember_rate_headers(headers) -> None:
    values = {
        "minute": headers.get("X-Rate-Limit-Remaining-Minute"),
        "day": headers.get("X-Rate-Limit-Remaining-Day"),
    }
    with _RATE_STATE_LOCK:
        for key, value in values.items():
            try:
                _RATE_STATE[key] = int(value) if value is not None else _RATE_STATE[key]
            except (TypeError, ValueError):
                pass


def _remaining_day() -> int | None:
    with _RATE_STATE_LOCK:
        value = _RATE_STATE.get("day")
    return int(value) if value is not None else None


def _api_json(
    path: str,
    query: dict | None,
    request_gap: float,
) -> object:
    params = dict(query or {})
    api_key = os.environ.get("OPENDOTA_API_KEY")
    suffix = f"?{urllib.parse.urlencode(params)}" if params else ""
    headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(
        f"{API_ROOT}{path}{suffix}",
        headers=headers,
    )
    for attempt in range(6):
        _rate_limit(request_gap)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                _remember_rate_headers(response.headers)
                return json.load(response)
        except urllib.error.HTTPError as exc:
            _remember_rate_headers(exc.headers)
            remaining_day = exc.headers.get("X-Rate-Limit-Remaining-Day")
            remaining_minute = exc.headers.get("X-Rate-Limit-Remaining-Minute")
            if str(remaining_day) == "0":
                raise ApiBudgetExhausted("OpenDota daily request budget is exhausted") from exc
            if exc.code == 429 and str(remaining_minute) == "0":
                retry_after = exc.headers.get("Retry-After")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else 61.0
            elif exc.code in {403, 429, 500, 502, 503, 504}:
                retry_after = exc.headers.get("Retry-After")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else 2**attempt
            else:
                raise
            if attempt == 5:
                raise
            time.sleep(min(90.0, max(1.0, delay)) + random.random() * 0.25)
        except (urllib.error.URLError, TimeoutError):
            if attempt == 5:
                raise
            time.sleep(min(20.0, 1.5 * (attempt + 1)))
    raise RuntimeError(f"OpenDota request failed: {path}")


def _load_item_ids() -> dict[int, str]:
    payload = json.loads((ROOT / "data" / "itemlist.json").read_text(encoding="utf-8"))
    rows = payload.get("result", {}).get("data", {}).get("itemabilities", [])
    return {
        int(row["id"]): str(row["name"])
        for row in rows
        if row.get("id") is not None and str(row.get("name") or "").startswith("item_")
    }


def _load_hero_ids() -> dict[int, str]:
    payload = json.loads((ROOT / "data" / "herolist.json").read_text(encoding="utf-8"))
    rows = payload.get("result", {}).get("data", {}).get("heroes", [])
    return {
        int(row["id"]): str(row["name"]).removeprefix("npc_dota_hero_")
        for row in rows
        if row.get("id") is not None and row.get("name")
    }


def _load_patch_names(request_gap: float) -> dict[int, str]:
    PATCH_CACHE.parent.mkdir(parents=True, exist_ok=True)
    payload: object
    try:
        payload = _api_json("/constants/patch", None, request_gap)
        _atomic_write_json(PATCH_CACHE, {"patches": payload})
    except Exception:
        if not PATCH_CACHE.exists():
            return {}
        payload = json.loads(PATCH_CACHE.read_text(encoding="utf-8")).get("patches", [])
    result: dict[int, str] = {}
    if isinstance(payload, list):
        for index, row in enumerate(payload):
            if not isinstance(row, dict) or not row.get("name"):
                continue
            try:
                patch_id = int(row.get("id", index))
            except (TypeError, ValueError):
                patch_id = index
            result[patch_id] = str(row["name"])
    return result


def _date_from_epoch(value) -> str:
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc).strftime("%Y-%m-%d")
    except (TypeError, ValueError, OSError, OverflowError):
        return ""


def _canonical_item_id(value: str) -> str:
    return FINAL_ITEM_ALIASES.get(value, value)


def _normalise_match(
    match: dict,
    public_row: dict,
    hero_ids: dict[int, str],
    item_ids: dict[int, str],
    patch_names: dict[int, str],
) -> tuple[list[dict], dict[str, int]]:
    """Normalize one match without player identity, preserving all nine slots."""
    counters = {"players": 0, "leavers": 0, "unknown_heroes": 0, "unknown_items": 0}
    try:
        match_id = int(match.get("match_id") or public_row["match_id"])
        duration = int(match.get("duration") or public_row.get("duration") or 0)
    except (KeyError, TypeError, ValueError):
        return [], counters
    if int(match.get("leagueid") or 0) > 0:
        return [], counters
    date = _date_from_epoch(match.get("start_time") or public_row.get("start_time"))
    if not date:
        return [], counters
    patch_id = match.get("patch")
    try:
        patch = patch_names.get(int(patch_id), str(patch_id or ""))
    except (TypeError, ValueError):
        patch = str(patch_id or "")
    radiant_win = bool(match.get("radiant_win"))
    avg_rank = public_row.get("avg_rank_tier")
    result: list[dict] = []
    for player in match.get("players") or []:
        if not isinstance(player, dict):
            continue
        try:
            slot = int(player.get("player_slot"))
            hero_numeric = int(player.get("hero_id"))
        except (TypeError, ValueError):
            counters["unknown_heroes"] += 1
            continue
        hero = hero_ids.get(hero_numeric)
        if not hero:
            counters["unknown_heroes"] += 1
            continue
        if int(player.get("leaver_status") or 0) > 1:
            counters["leavers"] += 1
            continue
        slot_items: dict[str, str | None] = {}
        for field in INVENTORY_ITEM_FIELDS:
            try:
                numeric = int(player.get(field) or 0)
            except (TypeError, ValueError):
                numeric = 0
            if not numeric:
                slot_items[field] = None
                continue
            item = item_ids.get(numeric)
            if not item:
                counters["unknown_items"] += 1
                slot_items[field] = None
                continue
            slot_items[field] = _canonical_item_id(item)
        main_items = [slot_items[field] for field in MAIN_ITEM_FIELDS]
        backpack_items = [slot_items[field] for field in BACKPACK_ITEM_FIELDS]
        is_radiant = slot < 128
        won = radiant_win if is_radiant else not radiant_win
        result.append(
            {
                "m": match_id,
                "d": date,
                "p": patch,
                "l": "OpenDota 高分段天梯",
                "t": "天辉" if is_radiant else "夜魇",
                "s": "",
                "n": "匿名公开局玩家",
                "h": hero,
                "hi": hero_numeric,
                "sl": slot,
                "tm": 2 if is_radiant else 3,
                "r": None,
                "rm": "公开局未判位",
                "w": 1 if won else 0,
                "lv": player.get("level"),
                "nw": player.get("net_worth"),
                "du": duration,
                "i": [],
                "u": None,
                "x": {"rank": player.get("rank_tier") or avg_rank},
                "f": main_items,
                "b": backpack_items,
                "ft": duration,
                "src": "opendota",
            }
        )
        counters["players"] += 1
    return result, counters


def _rank_cohort(match: dict) -> tuple[str | None, str]:
    """Classify ten visible ranks into mutually exclusive high-rank cohorts."""
    ranks: list[int] = []
    invalid_rank_values = 0
    for player in match.get("players") or []:
        if not isinstance(player, dict):
            continue
        try:
            rank = int(player.get("rank_tier"))
        except (TypeError, ValueError):
            invalid_rank_values += 1
            continue
        ranks.append(rank)
    missing = max(invalid_rank_values, 10 - len(ranks), 0)
    distribution = {rank: ranks.count(rank) for rank in sorted(set(ranks))}
    if len(ranks) != 10 or missing:
        return (
            None,
            "rank cohort rejected "
            f"(visible={len(ranks)}, missing={missing}, ranks={distribution})",
        )
    if all(rank == REQUESTED_IMMORTAL_RANK for rank in ranks):
        return COHORT_PURE_IMMORTAL, ""
    has_immortal = any(rank == REQUESTED_IMMORTAL_RANK for rank in ranks)
    has_divine = any(DIVINE_MIN_RANK <= rank <= DIVINE_MAX_RANK for rank in ranks)
    all_allowed = all(
        rank == REQUESTED_IMMORTAL_RANK
        or DIVINE_MIN_RANK <= rank <= DIVINE_MAX_RANK
        for rank in ranks
    )
    if has_immortal and has_divine and all_allowed:
        return COHORT_IMMORTAL_DIVINE, ""
    return (
        None,
        "rank cohort rejected "
        f"(visible={len(ranks)}, missing={missing}, ranks={distribution})",
    )


def _strict_immortal_ranks(match: dict) -> tuple[bool, str]:
    """Backward-compatible pure-Immortal check used by older callers/tests."""
    cohort, reason = _rank_cohort(match)
    if cohort == COHORT_PURE_IMMORTAL:
        return True, ""
    return False, reason or f"rank cohort is {cohort}"


def _legacy_rejection_is_mixed_candidate(message: str) -> bool:
    """Recognize old rank rejections that can enter the new mixed cohort."""
    if not message.startswith("not all players are Immortal"):
        return False
    if "visible=10, missing=0" not in message:
        return False
    ranks = [int(value) for value in re.findall(r"(\d+):\s*\d+", message)]
    return (
        REQUESTED_IMMORTAL_RANK in ranks
        and any(DIVINE_MIN_RANK <= rank <= DIVINE_MAX_RANK for rank in ranks)
        and all(
            rank == REQUESTED_IMMORTAL_RANK
            or DIVINE_MIN_RANK <= rank <= DIVINE_MAX_RANK
            for rank in ranks
        )
    )


def _connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=60)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=NORMAL")
    connection.execute("PRAGMA temp_store=MEMORY")
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS matches (
          match_id INTEGER PRIMARY KEY,
          match_seq_num INTEGER,
          radiant_win INTEGER,
          start_time INTEGER NOT NULL,
          date TEXT,
          duration INTEGER NOT NULL,
          lobby_type INTEGER NOT NULL,
          game_mode INTEGER NOT NULL,
          avg_rank_tier REAL NOT NULL,
          num_rank_tier INTEGER NOT NULL,
          cluster INTEGER,
          patch TEXT,
          cohort TEXT,
          inventory_version INTEGER NOT NULL DEFAULT 2,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          updated_at TEXT
        );
        CREATE INDEX IF NOT EXISTS matches_status_idx ON matches(status, match_id DESC);
        CREATE TABLE IF NOT EXISTS players (
          match_id INTEGER NOT NULL,
          player_slot INTEGER NOT NULL,
          hero TEXT NOT NULL,
          hero_id INTEGER NOT NULL,
          win INTEGER NOT NULL,
          level INTEGER,
          net_worth INTEGER,
          rank_tier INTEGER,
          item_0 TEXT,
          item_1 TEXT,
          item_2 TEXT,
          item_3 TEXT,
          item_4 TEXT,
          item_5 TEXT,
          backpack_0 TEXT,
          backpack_1 TEXT,
          backpack_2 TEXT,
          PRIMARY KEY(match_id, player_slot),
          FOREIGN KEY(match_id) REFERENCES matches(match_id)
        );
        CREATE INDEX IF NOT EXISTS players_hero_idx ON players(hero, match_id DESC);
        CREATE TABLE IF NOT EXISTS ingest_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        """
    )
    match_columns = {
        str(row[1]) for row in connection.execute("PRAGMA table_info(matches)")
    }
    if "cohort" not in match_columns:
        connection.execute("ALTER TABLE matches ADD COLUMN cohort TEXT")
    inventory_version_added = "inventory_version" not in match_columns
    if inventory_version_added:
        # Existing accepted rows contain only the historical six-slot payload.
        # Version 1 means that backpack NULLs are unknown and must not be
        # exported as genuine empty slots.
        connection.execute(
            "ALTER TABLE matches ADD COLUMN inventory_version INTEGER NOT NULL DEFAULT 1"
        )
    player_columns = {
        str(row[1]) for row in connection.execute("PRAGMA table_info(players)")
    }
    backpack_columns_added = False
    for field in BACKPACK_ITEM_FIELDS:
        if field in player_columns:
            continue
        connection.execute(f"ALTER TABLE players ADD COLUMN {field} TEXT")
        backpack_columns_added = True
    connection.execute(
        "CREATE INDEX IF NOT EXISTS matches_cohort_idx "
        "ON matches(status, cohort, match_id DESC)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS matches_inventory_idx "
        "ON matches(status, inventory_version, match_id DESC)"
    )
    # Databases produced by the earlier strict-only collector contain only
    # verified pure-Immortal accepted rows.  Preserve them in place.  Rank
    # rejections may contain the newly supported mixed cohort, so put only
    # those legacy rejections back into the resumable queue.
    connection.execute(
        "UPDATE matches SET cohort=? "
        "WHERE status='accepted' AND (cohort IS NULL OR cohort='')",
        (COHORT_PURE_IMMORTAL,),
    )
    if inventory_version_added or backpack_columns_added:
        connection.execute(
            "UPDATE matches SET inventory_version=? WHERE status<>'accepted'",
            (INVENTORY_SCHEMA_VERSION,),
        )
        connection.execute(
            "UPDATE matches SET inventory_version=1, attempts=0, "
            "last_error=NULL, updated_at=NULL WHERE status='accepted'"
        )
    legacy_mixed_ids = [
        int(row["match_id"])
        for row in connection.execute(
            "SELECT match_id,last_error FROM matches "
            "WHERE status='rejected' AND last_error LIKE 'not all players are Immortal%'"
        )
        if _legacy_rejection_is_mixed_candidate(str(row["last_error"] or ""))
    ]
    connection.executemany(
        "UPDATE matches SET status='pending', attempts=0, last_error=NULL, updated_at=NULL "
        "WHERE match_id=?",
        ((match_id,) for match_id in legacy_mixed_ids),
    )
    # The previous six-slot quality rule could reject a rare player whose main
    # inventory was empty while the backpack was not.  Revisit those matches
    # once under the nine-slot rule.
    connection.execute(
        "UPDATE matches SET status='pending', attempts=0, last_error=NULL, updated_at=NULL "
        "WHERE status='rejected' AND last_error LIKE 'match has empty final inventories%'"
    )
    # Item-combination analysis cannot use a player row whose complete
    # nine-slot inventory is absent. Reject the whole match so every accepted
    # v2 match retains ten usable final-inventory snapshots.
    empty_inventory_match_ids = [
        int(row[0])
        for row in connection.execute(
            """
            SELECT DISTINCT p.match_id
            FROM players p JOIN matches m USING(match_id)
            WHERE m.status='accepted'
              AND m.inventory_version >= 2
              AND COALESCE(p.item_0,'')='' AND COALESCE(p.item_1,'')=''
              AND COALESCE(p.item_2,'')='' AND COALESCE(p.item_3,'')=''
              AND COALESCE(p.item_4,'')='' AND COALESCE(p.item_5,'')=''
              AND COALESCE(p.backpack_0,'')='' AND COALESCE(p.backpack_1,'')=''
              AND COALESCE(p.backpack_2,'')=''
            """
        )
    ]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    connection.executemany(
        "UPDATE matches SET status='rejected', cohort=NULL, "
        "last_error='match has empty nine-slot inventories "
        "(migrated quality rule; empty final inventories)', "
        "updated_at=? WHERE match_id=?",
        ((now, match_id) for match_id in empty_inventory_match_ids),
    )
    connection.executemany(
        "DELETE FROM players WHERE match_id=?",
        ((match_id,) for match_id in empty_inventory_match_ids),
    )
    connection.commit()
    return connection


def _state_get(connection: sqlite3.Connection, key: str) -> str | None:
    row = connection.execute("SELECT value FROM ingest_state WHERE key = ?", (key,)).fetchone()
    return str(row[0]) if row else None


def _state_set(connection: sqlite3.Connection, key: str, value: object) -> None:
    connection.execute(
        "INSERT INTO ingest_state(key,value) VALUES(?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, str(value)),
    )


def _viable_match_count(connection: sqlite3.Connection) -> int:
    return int(
        connection.execute(
            "SELECT count(*) FROM matches WHERE status IN ('pending','retry','accepted')"
        ).fetchone()[0]
    )


def _accepted_match_count(connection: sqlite3.Connection) -> int:
    return int(
        connection.execute(
            "SELECT count(*) FROM matches "
            "WHERE status='accepted' AND inventory_version >= ?",
            (INVENTORY_SCHEMA_VERSION,),
        ).fetchone()[0]
    )


def _backfill_match_count(connection: sqlite3.Connection) -> int:
    return int(
        connection.execute(
            "SELECT count(*) FROM matches WHERE status<>'rejected' "
            "AND inventory_version < ?",
            (INVENTORY_SCHEMA_VERSION,),
        ).fetchone()[0]
    )


def _retriable_backfill_count(
    connection: sqlite3.Connection, max_attempts: int
) -> int:
    return int(
        connection.execute(
            "SELECT count(*) FROM matches WHERE status IN ('accepted','pending','retry') "
            "AND inventory_version < ? AND attempts < ?",
            (INVENTORY_SCHEMA_VERSION, max_attempts),
        ).fetchone()[0]
    )


def _candidate_sql(cursor: int | None, args: argparse.Namespace, limit: int) -> str:
    cursor_clause = f"AND match_id < {int(cursor)}" if cursor is not None else ""
    return f"""
      SELECT match_id, match_seq_num, radiant_win, start_time, duration,
             lobby_type, game_mode, avg_rank_tier, num_rank_tier, cluster
      FROM public_matches
      WHERE avg_rank_tier = {OPENDOTA_HIGHEST_AVG_BUCKET}
        AND num_rank_tier >= {int(args.min_ranked_players)}
        AND lobby_type = {RANKED_LOBBY_TYPE}
        AND game_mode = {ALL_DRAFT_GAME_MODE}
        AND duration >= {int(args.min_duration)}
        {cursor_clause}
      ORDER BY match_id DESC
      LIMIT {int(limit)}
    """.strip()


def _discover_candidates(
    connection: sqlite3.Connection,
    args: argparse.Namespace,
    request_gap: float,
) -> int:
    inserted_total = 0
    pages = 0
    while _viable_match_count(connection) < args.target_matches and pages < args.max_discovery_pages:
        needed = args.target_matches - _viable_match_count(connection)
        limit = min(args.explorer_page_size, needed)
        cursor_text = _state_get(connection, "discovery_cursor")
        cursor = int(cursor_text) if cursor_text else None
        payload = _api_json(
            "/explorer",
            {"sql": _candidate_sql(cursor, args, limit)},
            request_gap,
        )
        rows = payload.get("rows", []) if isinstance(payload, dict) else []
        if not isinstance(rows, list) or not rows:
            break
        inserted = 0
        page_ids: list[int] = []
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        for row in rows:
            if not isinstance(row, dict):
                continue
            try:
                match_id = int(row["match_id"])
                page_ids.append(match_id)
                values = (
                    match_id,
                    row.get("match_seq_num"),
                    int(bool(row.get("radiant_win"))),
                    int(row["start_time"]),
                    int(row["duration"]),
                    int(row["lobby_type"]),
                    int(row["game_mode"]),
                    float(row["avg_rank_tier"]),
                    int(row["num_rank_tier"]),
                    row.get("cluster"),
                    now,
                )
            except (KeyError, TypeError, ValueError):
                continue
            result = connection.execute(
                """
                INSERT OR IGNORE INTO matches(
                  match_id,match_seq_num,radiant_win,start_time,duration,
                  lobby_type,game_mode,avg_rank_tier,num_rank_tier,cluster,updated_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
                """,
                values,
            )
            inserted += int(result.rowcount > 0)
        if not page_ids:
            break
        next_cursor = min(page_ids)
        if cursor is not None and next_cursor >= cursor:
            break
        _state_set(connection, "discovery_cursor", next_cursor)
        _state_set(connection, "target_matches", args.target_matches)
        connection.commit()
        pages += 1
        inserted_total += inserted
        print(
            f"  candidates: page {pages}, +{inserted:,}, "
            f"viable {_viable_match_count(connection):,}/{args.target_matches:,}, cursor {next_cursor}"
        )
        if len(rows) < limit:
            break
    return inserted_total


def _load_match(match_id: int, request_gap: float) -> tuple[dict, bool]:
    legacy = LEGACY_MATCH_CACHE / f"{match_id}.json"
    if legacy.exists():
        try:
            payload = json.loads(legacy.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                return payload, True
        except (OSError, json.JSONDecodeError):
            pass
    payload = _api_json(f"/matches/{match_id}", None, request_gap)
    if not isinstance(payload, dict):
        raise ValueError(f"OpenDota match {match_id} returned non-object JSON")
    return payload, False


def _store_accepted(
    connection: sqlite3.Connection,
    candidate: sqlite3.Row,
    rows: list[dict],
    cohort: str,
) -> None:
    first = rows[0]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    connection.execute(
        """
        UPDATE matches
        SET status='accepted', date=?, patch=?, cohort=?, inventory_version=?,
            attempts=attempts+1, last_error=NULL, updated_at=?
        WHERE match_id=?
        """,
        (
            first.get("d") or "",
            first.get("p") or "",
            cohort,
            INVENTORY_SCHEMA_VERSION,
            now,
            int(candidate["match_id"]),
        ),
    )
    connection.execute("DELETE FROM players WHERE match_id=?", (int(candidate["match_id"]),))
    for row in rows:
        main_items = list(row.get("f") or [])[: len(MAIN_ITEM_FIELDS)]
        main_items.extend([None] * (len(MAIN_ITEM_FIELDS) - len(main_items)))
        backpack_items = list(row.get("b") or [])[: len(BACKPACK_ITEM_FIELDS)]
        backpack_items.extend(
            [None] * (len(BACKPACK_ITEM_FIELDS) - len(backpack_items))
        )
        rank = (row.get("x") or {}).get("rank")
        try:
            rank = int(rank) if rank is not None else None
        except (TypeError, ValueError):
            rank = None
        connection.execute(
            """
            INSERT OR REPLACE INTO players(
              match_id,player_slot,hero,hero_id,win,level,net_worth,rank_tier,
              item_0,item_1,item_2,item_3,item_4,item_5,
              backpack_0,backpack_1,backpack_2
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                int(row["m"]),
                int(row["sl"]),
                str(row["h"]),
                int(row["hi"]),
                int(row["w"]),
                row.get("lv"),
                row.get("nw"),
                rank,
                *main_items,
                *backpack_items,
            ),
        )


def _store_failure(
    connection: sqlite3.Connection,
    candidate: sqlite3.Row,
    error: Exception | str,
    max_attempts: int,
) -> None:
    attempts = int(candidate["attempts"] or 0) + 1
    status = "failed" if attempts >= max_attempts else "retry"
    message = str(error).replace("\n", " ")[:300]
    connection.execute(
        "UPDATE matches SET status=?, attempts=?, last_error=?, updated_at=? WHERE match_id=?",
        (
            status,
            attempts,
            message,
            datetime.now(timezone.utc).isoformat(timespec="seconds"),
            int(candidate["match_id"]),
        ),
    )


def _pending_rows(
    connection: sqlite3.Connection,
    limit: int,
    max_attempts: int,
) -> list[sqlite3.Row]:
    return list(
        connection.execute(
            """
            SELECT * FROM matches
            WHERE (
              status IN ('pending','retry')
              OR (status='accepted' AND inventory_version < ?)
            ) AND attempts < ?
            ORDER BY CASE WHEN inventory_version < ? THEN 0 ELSE 1 END, match_id DESC
            LIMIT ?
            """,
            (
                INVENTORY_SCHEMA_VERSION,
                max_attempts,
                INVENTORY_SCHEMA_VERSION,
                limit,
            ),
        )
    )


def _detail_budget(
    args: argparse.Namespace,
    has_api_key: bool,
    accepted_matches: int,
    backfill_matches: int = 0,
) -> int:
    remaining_target = max(0, args.target_matches - accepted_matches)
    # Highest-bucket candidates still need per-player rank verification.  A
    # safety factor covers missing ranks, all-Divine rows and malformed games
    # while continuing until the requested total across both cohorts exists.
    remaining_target = max(backfill_matches, remaining_target * 3)
    if args.max_detail_requests is not None:
        remaining_target = min(remaining_target, args.max_detail_requests)
    if not has_api_key:
        remaining_day = _remaining_day()
        if remaining_day is not None:
            remaining_target = min(
                remaining_target,
                max(0, remaining_day - max(0, args.daily_reserve)),
            )
    return remaining_target


def _fetch_details(
    connection: sqlite3.Connection,
    args: argparse.Namespace,
    request_gap: float,
    workers: int,
    hero_ids: dict[int, str],
    item_ids: dict[int, str],
    patch_names: dict[int, str],
) -> dict[str, int]:
    has_api_key = bool(os.environ.get("OPENDOTA_API_KEY"))
    accepted_before = _accepted_match_count(connection)
    backfill_before = _retriable_backfill_count(connection, args.max_attempts)
    requested_budget = _detail_budget(
        args, has_api_key, accepted_before, backfill_before
    )
    request_count = 0
    accepted = 0
    newly_accepted = 0
    backfilled = 0
    rejected = 0
    failures = 0
    cache_hits = 0
    accepted_by_cohort = {cohort: 0 for cohort in COHORT_LABELS}
    while request_count < requested_budget:
        accepted_total = _accepted_match_count(connection)
        backfill_remaining = _retriable_backfill_count(
            connection, args.max_attempts
        )
        if accepted_total >= args.target_matches and backfill_remaining == 0:
            break
        work_limit = (
            backfill_remaining
            if accepted_total >= args.target_matches
            else max(1, args.target_matches - accepted_total)
        )
        batch_limit = min(
            args.batch_size,
            requested_budget - request_count,
            work_limit,
        )
        candidates = _pending_rows(connection, batch_limit, args.max_attempts)
        if not candidates:
            if accepted_total >= args.target_matches:
                break
            inserted = _discover_candidates(connection, args, request_gap)
            if not inserted:
                break
            candidates = _pending_rows(connection, batch_limit, args.max_attempts)
            if not candidates:
                break
        by_id = {int(row["match_id"]): row for row in candidates}
        with ThreadPoolExecutor(max_workers=workers) as executor:
            future_ids = {
                executor.submit(_load_match, match_id, request_gap): match_id
                for match_id in by_id
            }
            for future in as_completed(future_ids):
                match_id = future_ids[future]
                candidate = by_id[match_id]
                was_backfill = (
                    int(candidate["inventory_version"] or 0)
                    < INVENTORY_SCHEMA_VERSION
                )
                request_count += 1
                try:
                    match, cached = future.result()
                    cache_hits += int(cached)
                    cohort, rank_error = _rank_cohort(match)
                    if not cohort:
                        raise ValueError(rank_error)
                    rows, counters = _normalise_match(
                        match,
                        dict(candidate),
                        hero_ids,
                        item_ids,
                        patch_names,
                    )
                    detail_lobby = int(match.get("lobby_type") or candidate["lobby_type"])
                    detail_mode = int(match.get("game_mode") or candidate["game_mode"])
                    if detail_lobby != RANKED_LOBBY_TYPE or detail_mode != ALL_DRAFT_GAME_MODE:
                        raise ValueError("detail is not Ranked All Draft")
                    if len(rows) != 10:
                        raise ValueError(
                            "match does not have ten eligible players "
                            f"(kept={len(rows)}, leavers={counters['leavers']}, "
                            f"unknown_heroes={counters['unknown_heroes']})"
                        )
                    empty_final_inventories = sum(
                        not any(row.get("f") or []) and not any(row.get("b") or [])
                        for row in rows
                    )
                    if empty_final_inventories:
                        raise ValueError(
                            "match has empty nine-slot inventories "
                            f"(players={empty_final_inventories})"
                        )
                    _store_accepted(connection, candidate, rows, cohort)
                    accepted += 1
                    if was_backfill:
                        backfilled += 1
                    else:
                        newly_accepted += 1
                    accepted_by_cohort[cohort] += 1
                except ApiBudgetExhausted as exc:
                    _store_failure(connection, candidate, exc, args.max_attempts)
                    failures += 1
                except Exception as exc:
                    text = str(exc)
                    if (
                        text.startswith("rank cohort rejected")
                        or text.startswith("not all players are Immortal")
                        or text.startswith("match does not have ten eligible players")
                        or text.startswith("match has empty nine-slot inventories")
                        or text == "detail is not Ranked All Draft"
                    ):
                        connection.execute(
                            "UPDATE matches SET status='rejected', attempts=attempts+1, "
                            "last_error=?, updated_at=? WHERE match_id=?",
                            (
                                text[:300],
                                datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                match_id,
                            ),
                        )
                        rejected += 1
                    else:
                        _store_failure(connection, candidate, exc, args.max_attempts)
                        failures += 1
        connection.commit()
        total = _accepted_match_count(connection)
        remaining_day = _remaining_day()
        print(
            f"  details: requests {request_count:,}/{requested_budget:,}, "
            f"accepted {total:,}/{args.target_matches:,}, rejected +{rejected:,}, "
            f"backfill {_backfill_match_count(connection):,}, retry +{failures:,}, "
            f"day remaining {remaining_day if remaining_day is not None else '?'}"
        )
        if not has_api_key and remaining_day is not None and remaining_day <= args.daily_reserve:
            break
    return {
        "requests": request_count,
        "accepted": accepted,
        "newly_accepted": newly_accepted,
        "backfilled": backfilled,
        "accepted_pure_immortal": accepted_by_cohort[COHORT_PURE_IMMORTAL],
        "accepted_immortal_divine": accepted_by_cohort[COHORT_IMMORTAL_DIVINE],
        "rejected": rejected,
        "failures": failures,
        "cache_hits": cache_hits,
    }


def _dict_index(values: Iterable[str]) -> tuple[list[str], dict[str, int]]:
    dictionary = sorted({str(value) for value in values if value})
    return dictionary, {value: index for index, value in enumerate(dictionary)}


def _export_shards(
    connection: sqlite3.Connection,
    manifest_path: Path,
    shard_root: Path,
    args: argparse.Namespace,
    run_stats: dict[str, int] | None = None,
) -> dict:
    shard_dir = shard_root / "heroes"
    shard_dir.mkdir(parents=True, exist_ok=True)
    accepted = _accepted_match_count(connection)
    backfill_pending = _backfill_match_count(connection)
    records = int(
        connection.execute(
            "SELECT count(*) FROM players p JOIN matches m USING(match_id) "
            "WHERE m.status='accepted' AND m.inventory_version >= ?",
            (INVENTORY_SCHEMA_VERSION,),
        ).fetchone()[0]
    )
    date_row = connection.execute(
        "SELECT min(date), max(date) FROM matches "
        "WHERE status='accepted' AND inventory_version >= ? AND date<>''",
        (INVENTORY_SCHEMA_VERSION,),
    ).fetchone()
    patches = [
        str(row[0])
        for row in connection.execute(
            "SELECT DISTINCT patch FROM matches "
            "WHERE status='accepted' AND inventory_version >= ? AND patch<>'' "
            "ORDER BY patch DESC",
            (INVENTORY_SCHEMA_VERSION,),
        )
    ]
    statuses = {
        str(row[0]): int(row[1])
        for row in connection.execute("SELECT status,count(*) FROM matches GROUP BY status")
    }
    cohorts = {
        cohort: {"label": label, "matches": 0, "records": 0}
        for cohort, label in COHORT_LABELS.items()
    }
    for row in connection.execute(
        """
        SELECT m.cohort, count(DISTINCT m.match_id) matches, count(p.match_id) records
        FROM matches m LEFT JOIN players p USING(match_id)
        WHERE m.status='accepted' AND m.inventory_version >= ?
        GROUP BY m.cohort
        """,
        (INVENTORY_SCHEMA_VERSION,),
    ):
        cohort = str(row["cohort"] or "")
        if cohort in cohorts:
            cohorts[cohort]["matches"] = int(row["matches"])
            cohorts[cohort]["records"] = int(row["records"])
    hero_rows = list(
        connection.execute(
            """
            SELECT p.hero, min(p.hero_id) hero_id, count(*) records,
                   count(DISTINCT p.match_id) matches, min(m.date) date_min, max(m.date) date_max
            FROM players p JOIN matches m USING(match_id)
            WHERE m.status='accepted' AND m.inventory_version >= ?
            GROUP BY p.hero ORDER BY records DESC, p.hero
            """,
            (INVENTORY_SCHEMA_VERSION,),
        )
    )
    hero_cohorts: dict[str, dict[str, dict[str, int | str]]] = {}
    for row in connection.execute(
        """
        SELECT p.hero,m.cohort,count(*) records,count(DISTINCT p.match_id) matches
        FROM players p JOIN matches m USING(match_id)
        WHERE m.status='accepted' AND m.inventory_version >= ?
        GROUP BY p.hero,m.cohort
        """,
        (INVENTORY_SCHEMA_VERSION,),
    ):
        hero = str(row["hero"])
        cohort = str(row["cohort"] or "")
        if cohort not in COHORT_LABELS:
            continue
        hero_cohorts.setdefault(hero, {})[cohort] = {
            "label": COHORT_LABELS[cohort],
            "matches": int(row["matches"]),
            "records": int(row["records"]),
        }
    heroes: dict[str, dict] = {}
    total_hero_rows = len(hero_rows)
    for hero_index, summary in enumerate(hero_rows, start=1):
        hero = str(summary["hero"])
        rows = list(
            connection.execute(
                """
                SELECT m.match_id,m.date,m.patch,m.duration,p.player_slot,p.hero_id,
                       p.win,p.level,p.net_worth,p.rank_tier,
                       p.item_0,p.item_1,p.item_2,p.item_3,p.item_4,p.item_5,
                       p.backpack_0,p.backpack_1,p.backpack_2,m.cohort
                FROM players p JOIN matches m USING(match_id)
                WHERE m.status='accepted' AND m.inventory_version >= ? AND p.hero=?
                ORDER BY m.date,m.match_id,p.player_slot
                """,
                (INVENTORY_SCHEMA_VERSION, hero),
            )
        )
        dates, date_index = _dict_index(str(row["date"] or "") for row in rows)
        hero_patches, patch_index = _dict_index(str(row["patch"] or "") for row in rows)
        item_values = [
            str(row[field] or "")
            for row in rows
            for field in INVENTORY_ITEM_FIELDS
            if row[field]
        ]
        item_dictionary, item_index = _dict_index(item_values)
        compact_records = []
        for row in rows:
            main_slots = [
                item_index[str(row[field])] if row[field] else EMPTY_ITEM_INDEX
                for field in MAIN_ITEM_FIELDS
            ]
            backpack_slots = [
                item_index[str(row[field])] if row[field] else EMPTY_ITEM_INDEX
                for field in BACKPACK_ITEM_FIELDS
            ]
            compact_records.append(
                [
                    int(row["match_id"]),
                    date_index.get(str(row["date"] or ""), -1),
                    patch_index.get(str(row["patch"] or ""), -1),
                    int(row["player_slot"]),
                    int(row["win"]),
                    row["level"],
                    row["net_worth"],
                    int(row["duration"]),
                    row["rank_tier"],
                    main_slots,
                    backpack_slots,
                    COHORT_CODES[str(row["cohort"])],
                ]
            )
        per_hero_cohorts = {
            cohort: hero_cohorts.get(hero, {}).get(
                cohort,
                {"label": label, "matches": 0, "records": 0},
            )
            for cohort, label in COHORT_LABELS.items()
        }
        relative_url = f"data/opendota_public_items/heroes/{hero}.json"
        shard_payload = {
            "schema": "opendota-public-hero-v4",
            "hero": hero,
            "hero_id": int(summary["hero_id"]),
            "meta": {
                "matches": int(summary["matches"]),
                "records": int(summary["records"]),
                "date_min": str(summary["date_min"] or ""),
                "date_max": str(summary["date_max"] or ""),
                "cohorts": per_hero_cohorts,
            },
            "dictionaries": {"d": dates, "p": hero_patches, "item": item_dictionary},
            "record_fields": [
                "match_id", "date", "patch", "player_slot", "win", "level",
                "net_worth", "duration", "rank_tier", "main_slots",
                "backpack_slots", "cohort_code",
            ],
            "main_inventory_fields": list(MAIN_ITEM_FIELDS),
            "backpack_fields": list(BACKPACK_ITEM_FIELDS),
            "empty_item_index": EMPTY_ITEM_INDEX,
            "cohort_codes": {str(code): cohort for cohort, code in COHORT_CODES.items()},
            "records": compact_records,
        }
        _atomic_write_json(shard_dir / f"{hero}.json", shard_payload)
        heroes[hero] = {
            "url": relative_url,
            "hero_id": int(summary["hero_id"]),
            "matches": int(summary["matches"]),
            "records": int(summary["records"]),
            "date_min": str(summary["date_min"] or ""),
            "date_max": str(summary["date_max"] or ""),
            "cohorts": per_hero_cohorts,
        }
        if hero_index % 25 == 0 or hero_index == total_hero_rows:
            print(f"  export: hero shards {hero_index}/{total_hero_rows}")
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    meta = {
        "source": "OpenDota Explorer public_matches + /matches/{match_id}",
        "source_kind": "highest_rank_ranked_sample",
        "sampled": True,
        "cohort": "纯冠绝 / 冠绝＋超凡（互斥分组）",
        "cohorts": cohorts,
        "requested_rank": REQUESTED_IMMORTAL_RANK,
        "opendota_avg_rank_tier": OPENDOTA_HIGHEST_AVG_BUCKET,
        "required_visible_rank_players": 10,
        "cohort_note": (
            "最高75桶仅用于候选；逐场复核十人段位。纯冠绝=10人均为rank_tier=80；"
            "冠绝＋超凡=同时含80和70–75，且无人低于超凡。段位缺失整场剔除。"
        ),
        "min_ranked_players": args.min_ranked_players,
        "lobby_type": RANKED_LOBBY_TYPE,
        "game_mode": ALL_DRAFT_GAME_MODE,
        "min_duration": args.min_duration,
        "target_matches": args.target_matches,
        "matches": accepted,
        "records": records,
        "complete": accepted >= args.target_matches and backfill_pending == 0,
        "progress": accepted / args.target_matches if args.target_matches else 0,
        "date_min": str(date_row[0] or "") if date_row else "",
        "date_max": str(date_row[1] or "") if date_row else "",
        "patches": patches,
        "inventory_schema_version": INVENTORY_SCHEMA_VERSION,
        "final_inventory_fields": list(INVENTORY_ITEM_FIELDS),
        "main_inventory_fields": list(MAIN_ITEM_FIELDS),
        "backpack_fields": list(BACKPACK_ITEM_FIELDS),
        "empty_item_index": EMPTY_ITEM_INDEX,
        "includes_backpack": True,
        "backpack_backfill_pending": backfill_pending,
        "backpack_complete": backfill_pending == 0,
        "includes_neutral_items": False,
        "position_available": False,
        "generated_at": generated_at,
        "status_counts": statuses,
        "last_update": run_stats or {},
        "cohort_codes": {str(code): cohort for cohort, code in COHORT_CODES.items()},
    }
    manifest = {
        "schema": "opendota-public-items-manifest-v4",
        "meta": meta,
        "heroes": heroes,
    }
    _atomic_write_json(manifest_path, manifest)
    print(
        f"OpenDota public manifest: {accepted:,}/{args.target_matches:,} matches, "
        f"pure={cohorts[COHORT_PURE_IMMORTAL]['matches']:,}, "
        f"mixed={cohorts[COHORT_IMMORTAL_DIVINE]['matches']:,}, "
        f"backfill={backfill_pending:,}, "
        f"{records:,} player-games, {len(heroes):,} hero shards -> {manifest_path}"
    )
    return manifest


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    api_key = os.environ.get("OPENDOTA_API_KEY")
    request_gap = args.request_gap
    if request_gap is None:
        request_gap = 0.03 if api_key else 1.05
    workers = args.workers if args.workers is not None else (24 if api_key else 1)
    if workers < 1 or request_gap < 0:
        raise SystemExit("--workers must be >= 1 and --request-gap must be >= 0")
    connection = _connect(args.db)
    run_stats: dict[str, int] = {}
    try:
        if not args.export_only:
            print(
                "OpenDota highest-rank cache: "
                f"target={args.target_matches:,} total across pure/mixed cohorts, "
                "pure=10x80, mixed=80 plus 70-75, internal candidate bucket=75, "
                f"ranked players>={args.min_ranked_players}, Ranked All Draft only"
            )
            _discover_candidates(connection, args, request_gap)
            if not args.discover_only:
                item_ids = _load_item_ids()
                hero_ids = _load_hero_ids()
                patch_names = _load_patch_names(request_gap)
                run_stats = _fetch_details(
                    connection,
                    args,
                    request_gap,
                    workers,
                    hero_ids,
                    item_ids,
                    patch_names,
                )
                if not api_key and _accepted_match_count(connection) < args.target_matches:
                    print(
                        "  anonymous OpenDota quota only permits partial progress; "
                        "set OPENDOTA_API_KEY and rerun to resume the same SQLite checkpoint"
                    )
        if not args.no_export:
            _export_shards(
                connection,
                args.manifest,
                args.shard_root,
                args,
                run_stats,
            )
    finally:
        connection.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
