"""Backfill timed item routes for a bounded hero/date slice.

The normal incremental extractor remains the primary data path.  This tool is
for repairing an already-published bounded slice without replacing unrelated
matches.  It queries only exact ``dt`` partitions and the match IDs already
present in the local professional-match cache.  OpenDota is an explicit,
last-resort fallback for matches whose purchase events are absent from the
authoritative ``dota2_analysis.combat_logs`` source.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from scripts.fetch.fetch_pro_builds import (
    ROOT,
    _connect,
    _deduplicate_rows,
    _load_item_ids,
    _load_opendota_match,
    _parse_opendota_purchases,
)


DEFAULT_CORE = ROOT / "data" / "pro_builds.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core", type=Path, default=DEFAULT_CORE)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--hero", help="Canonical hero slug, for example sven")
    target.add_argument(
        "--all-heroes",
        action="store_true",
        help="Repair every cached player-game in the bounded date slice",
    )
    parser.add_argument("--date-from", required=True)
    parser.add_argument("--date-to", required=True)
    parser.add_argument(
        "--opendota-fallback",
        action="store_true",
        help="Use OpenDota only for selected matches with insufficient dota2_analysis purchase events",
    )
    parser.add_argument(
        "--skip-starrocks",
        action="store_true",
        help=(
            "Keep timed ODS rows already present in the core cache and only fill "
            "remaining gaps from exact OpenDota matches"
        ),
    )
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="") as stream:
            json.dump(payload, stream, ensure_ascii=False, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        for attempt in range(6):
            try:
                os.replace(temporary, path)
                break
            except PermissionError:
                if attempt == 5:
                    raise
                time.sleep(0.2 * (attempt + 1))
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def selected_rows(
    payload: dict, hero: str | None, date_from: str, date_to: str
) -> list[dict]:
    return [
        row
        for row in payload.get("records") or []
        if (hero is None or str(row.get("h") or "") == hero)
        and date_from <= str(row.get("d") or "") <= date_to
    ]


def load_starrocks_purchases(
    rows: list[dict], hero: str | None
) -> tuple[dict[tuple[int, str], list[list]], set[tuple[int, str]], set[int]]:
    """Return post-fetch-deduplicated ODS purchases and match provenance."""
    matches_by_date: dict[str, set[int]] = defaultdict(set)
    selected_player_keys = {
        (int(row["m"]), str(row.get("h") or ""))
        for row in rows
    }
    for row in rows:
        matches_by_date[str(row["d"])].add(int(row["m"]))
    if not matches_by_date:
        return {}, set(), set()
    if hero is not None and not hero.replace("_", "").isalnum():
        raise SystemExit(f"Invalid canonical hero slug: {hero!r}")
    target_filter = (
        f"AND targetname = 'npc_dota_hero_{hero}'" if hero is not None else ""
    )
    purchases: dict[tuple[int, str], list[list]] = defaultdict(list)
    ods_player_games: set[tuple[int, str]] = set()
    ods_matches: set[int] = set()
    first: dict[tuple[tuple[int, str], str], int] = {}
    connection = _connect()
    try:
        with connection.cursor() as cursor:
            for day, match_ids in sorted(matches_by_date.items()):
                ordered = sorted(match_ids)
                for offset in range(0, len(ordered), 200):
                    batch = ordered[offset:offset + 200]
                    ids = ",".join(f"'{match_id}'" for match_id in batch)
                    print(
                        f"[routes] StarRocks {day}: matches {offset + 1}-"
                        f"{offset + len(batch)}/{len(ordered)}",
                        flush=True,
                    )
                    cursor.execute(
                        f"""
                        SELECT match_id, time, log_index, type, targetname, valuename
                        FROM dota2_analysis.combat_logs
                        WHERE dt = '{day}' AND match_id IN ({ids})
                          AND type = 'DOTA_COMBATLOG_PURCHASE'
                          {target_filter}
                        """
                    )
                    raw_rows = _deduplicate_rows(
                        cursor.fetchall(),
                        table="combat_logs",
                        columns=("match_id", "time", "log_index", "type", "targetname", "valuename"),
                    )
                    for match_id, seconds, _log_index, _type, targetname, item_id in raw_rows:
                        match_id = int(match_id)
                        ods_matches.add(match_id)
                        targetname = str(targetname or "")
                        if not targetname.startswith("npc_dota_hero_"):
                            continue
                        player_key = (
                            match_id,
                            targetname.removeprefix("npc_dota_hero_"),
                        )
                        if player_key not in selected_player_keys:
                            continue
                        ods_player_games.add(player_key)
                        item_id = str(item_id or "")
                        if item_id.startswith("item_recipe_"):
                            continue
                        key = (player_key, item_id)
                        seconds = max(0, int(seconds or 0))
                        if key not in first or seconds < first[key]:
                            first[key] = seconds
    finally:
        connection.close()
    for (player_key, item_id), seconds in first.items():
        purchases[player_key].append([item_id, seconds])
    return dict(purchases), ods_player_games, ods_matches


def load_opendota_purchases(
    match_id: int,
    hero_id: int,
    valid_items: set[str],
    match_cache: dict[int, dict],
) -> list[list]:
    if match_id not in match_cache:
        match_cache[match_id] = _load_opendota_match(match_id)
    return _parse_opendota_purchases(match_cache[match_id], hero_id, valid_items)


def merge_timed_items(row: dict, purchases: list[list], valid_items: set[str]) -> int:
    merged = {
        str(item_id): seconds
        for item_id, seconds in (row.get("i") or [])
        if str(item_id) in valid_items
    }
    before = sum(isinstance(seconds, int) for seconds in merged.values())
    for item_id, seconds in purchases:
        if item_id in valid_items:
            merged[item_id] = int(seconds)
    row["i"] = [[item_id, seconds] for item_id, seconds in merged.items()]
    row["i"].sort(key=lambda pair: (pair[1] is None, pair[1] if pair[1] is not None else 10**9, pair[0]))
    after = sum(isinstance(seconds, int) for seconds in merged.values())
    return max(0, after - before)


def main() -> int:
    args = parse_args()
    payload = json.loads(args.core.read_text(encoding="utf-8"))
    hero = args.hero if not args.all_heroes else None
    rows = selected_rows(payload, hero, args.date_from, args.date_to)
    if not rows:
        raise SystemExit("No cached player-games matched the bounded hero/date selection")
    valid_items = _load_item_ids()
    if args.skip_starrocks:
        starrocks, ods_player_games, ods_matches = {}, set(), set()
    else:
        starrocks, ods_player_games, ods_matches = load_starrocks_purchases(rows, hero)
    opendota_matches: set[int] = set()
    opendota_player_games: set[tuple[int, str]] = set()
    opendota_match_cache: dict[int, dict] = {}
    updated_rows = 0
    added_timestamps = 0
    for row in rows:
        match_id = int(row["m"])
        player_key = (match_id, str(row.get("h") or ""))
        purchases = starrocks.get(player_key) or []
        timed_ids = {str(pair[0]) for pair in purchases if len(pair) > 1 and isinstance(pair[1], int)}
        if len(timed_ids) < 2 and args.opendota_fallback:
            try:
                opendota = load_opendota_purchases(
                    match_id,
                    int(row.get("hi") or 0),
                    valid_items,
                    opendota_match_cache,
                )
            except (OSError, ValueError, json.JSONDecodeError):
                opendota = []
            if opendota:
                opendota_matches.add(match_id)
                opendota_player_games.add(player_key)
                by_item = {str(pair[0]): pair for pair in purchases}
                for pair in opendota:
                    by_item.setdefault(str(pair[0]), pair)
                purchases = list(by_item.values())
        if purchases:
            added = merge_timed_items(row, purchases, valid_items)
            added_timestamps += added
            updated_rows += int(added > 0)

    completed_rows = [
        row
        for row in rows
        if sum(isinstance(pair[1], int) for pair in (row.get("i") or [])) >= 2
    ]
    missing_rows = [row for row in rows if row not in completed_rows]
    completed_matches = {int(row["m"]) for row in completed_rows}
    missing_match_ids = sorted({int(row["m"]) for row in missing_rows})
    generated_at = utc_now()
    meta = payload.setdefault("meta", {})
    meta["generated_at"] = generated_at
    advanced = meta.setdefault("advanced", {})
    advanced["bounded_route_backfill"] = {
        "completed_at": generated_at,
        "hero": hero or "all",
        "date_from": args.date_from,
        "date_to": args.date_to,
        "player_games": len(rows),
        "selected_matches": len({int(row["m"]) for row in rows}),
        "complete_matches": len(completed_matches),
        "complete_player_games": len(completed_rows),
        "missing_player_games": len(missing_rows),
        "completion_rule": "at least two real purchase timestamps",
        "ods_matches": len(ods_matches),
        "ods_player_games": len(ods_player_games),
        "opendota_matches": len(opendota_matches),
        "opendota_player_games": len(opendota_player_games),
        "opendota_match_ids": sorted(opendota_matches),
        "missing_match_ids": missing_match_ids,
        "missing_player_game_samples": [
            {"match_id": int(row["m"]), "hero": row.get("h"), "slot": row.get("sl")}
            for row in missing_rows[:200]
        ],
        "query_contract": (
            "existing cached ODS timings preserved; exact-match external fallback"
            if args.skip_starrocks
            else "exact dt + finite cached match IDs; application dedup (match_id,log_index); explicit external fallback"
        ),
    }
    advanced["timed_item_player_games"] = sum(
        any(isinstance(pair[1], int) for pair in (row.get("i") or []))
        for row in payload.get("records") or []
    )
    atomic_write_json(args.core, payload)
    print(
        f"Backfilled {updated_rows}/{len(rows)} player-games; "
        f"added {added_timestamps} item timestamps; complete {len(completed_rows)}/{len(rows)}; "
        f"ODS {len(ods_player_games)} player-games, "
        f"OpenDota {len(opendota_player_games)} player-games"
    )
    if missing_rows:
        print("Missing match IDs:", ", ".join(map(str, missing_match_ids)))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
