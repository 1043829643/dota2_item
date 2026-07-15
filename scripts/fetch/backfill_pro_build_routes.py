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
)


DEFAULT_CORE = ROOT / "data" / "pro_builds.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core", type=Path, default=DEFAULT_CORE)
    parser.add_argument("--hero", required=True, help="Canonical hero slug, for example sven")
    parser.add_argument("--date-from", required=True)
    parser.add_argument("--date-to", required=True)
    parser.add_argument(
        "--opendota-fallback",
        action="store_true",
        help="Use OpenDota only for selected matches with insufficient dota2_analysis purchase events",
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
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def selected_rows(payload: dict, hero: str, date_from: str, date_to: str) -> list[dict]:
    return [
        row
        for row in payload.get("records") or []
        if str(row.get("h") or "") == hero
        and date_from <= str(row.get("d") or "") <= date_to
    ]


def partition_predicate(rows: list[dict]) -> str:
    matches_by_date: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        matches_by_date[str(row["d"])].append(int(row["m"]))
    clauses = []
    for day, match_ids in sorted(matches_by_date.items()):
        ids = ",".join(f"'{match_id}'" for match_id in sorted(set(match_ids)))
        clauses.append(f"(dt = '{day}' AND match_id IN ({ids}))")
    return " OR ".join(clauses)


def load_starrocks_purchases(rows: list[dict], hero: str) -> tuple[dict[int, list[list]], set[int]]:
    """Return post-fetch-deduplicated ODS purchases and match provenance."""
    predicate = partition_predicate(rows)
    if not predicate:
        return {}, set()
    target = f"npc_dota_hero_{hero}"
    purchases: dict[int, list[list]] = defaultdict(list)
    ods_matches: set[int] = set()
    connection = _connect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT match_id, time, log_index, type, targetname, valuename
                FROM dota2_analysis.combat_logs
                WHERE ({predicate})
                  AND type = 'DOTA_COMBATLOG_PURCHASE'
                """
            )
            raw_rows = _deduplicate_rows(
                cursor.fetchall(),
                table="combat_logs",
                columns=("match_id", "time", "log_index", "type", "targetname", "valuename"),
            )
            first: dict[tuple[int, str], int] = {}
            for match_id, seconds, _log_index, _type, targetname, item_id in raw_rows:
                match_id = int(match_id)
                ods_matches.add(match_id)
                item_id = str(item_id or "")
                if str(targetname or "") != target or item_id.startswith("item_recipe_"):
                    continue
                key = (match_id, item_id)
                seconds = max(0, int(seconds or 0))
                if key not in first or seconds < first[key]:
                    first[key] = seconds
            for (match_id, item_id), seconds in first.items():
                purchases[match_id].append([item_id, seconds])
    finally:
        connection.close()
    return dict(purchases), ods_matches


def load_opendota_purchases(match_id: int, hero_id: int, valid_items: set[str]) -> list[list]:
    match = _load_opendota_match(match_id)
    player = next(
        (entry for entry in match.get("players") or [] if int(entry.get("hero_id") or 0) == hero_id),
        None,
    )
    if not player:
        return []
    purchases: dict[str, int] = {}
    for entry in player.get("purchase_log") or []:
        key = str(entry.get("key") or "")
        if not key or key.startswith("recipe_"):
            continue
        item_id = key if key.startswith("item_") else f"item_{key}"
        if item_id not in valid_items:
            continue
        seconds = max(0, int(entry.get("time") or 0))
        purchases.setdefault(item_id, seconds)
    return [[item_id, seconds] for item_id, seconds in purchases.items()]


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
    rows = selected_rows(payload, args.hero, args.date_from, args.date_to)
    if not rows:
        raise SystemExit("No cached player-games matched the bounded hero/date selection")
    valid_items = _load_item_ids()
    starrocks, ods_matches = load_starrocks_purchases(rows, args.hero)
    opendota_matches: set[int] = set()
    updated_rows = 0
    added_timestamps = 0
    for row in rows:
        match_id = int(row["m"])
        purchases = starrocks.get(match_id) or []
        timed_ids = {str(pair[0]) for pair in purchases if len(pair) > 1 and isinstance(pair[1], int)}
        if len(timed_ids) < 2 and args.opendota_fallback:
            try:
                opendota = load_opendota_purchases(
                    match_id, int(row.get("hi") or 0), valid_items
                )
            except (OSError, ValueError, json.JSONDecodeError):
                opendota = []
            if opendota:
                opendota_matches.add(match_id)
                by_item = {str(pair[0]): pair for pair in purchases}
                for pair in opendota:
                    by_item.setdefault(str(pair[0]), pair)
                purchases = list(by_item.values())
        if purchases:
            added = merge_timed_items(row, purchases, valid_items)
            added_timestamps += added
            updated_rows += int(added > 0)

    completed = {
        match_id
        for match_id in {int(row["m"]) for row in rows}
        if sum(
            isinstance(pair[1], int)
            for row in rows if int(row["m"]) == match_id
            for pair in (row.get("i") or [])
        ) >= 2
    }
    missing = sorted({int(row["m"]) for row in rows} - completed)
    generated_at = utc_now()
    meta = payload.setdefault("meta", {})
    meta["generated_at"] = generated_at
    advanced = meta.setdefault("advanced", {})
    advanced["bounded_route_backfill"] = {
        "completed_at": generated_at,
        "hero": args.hero,
        "date_from": args.date_from,
        "date_to": args.date_to,
        "player_games": len(rows),
        "complete_matches": len(completed),
        "completion_rule": "at least two real purchase timestamps",
        "ods_matches": len(ods_matches),
        "opendota_matches": len(opendota_matches),
        "opendota_match_ids": sorted(opendota_matches),
        "missing_match_ids": missing,
        "query_contract": "exact dt + finite cached match IDs; application dedup (match_id,log_index); explicit external fallback",
    }
    advanced["timed_item_player_games"] = sum(
        any(isinstance(pair[1], int) for pair in (row.get("i") or []))
        for row in payload.get("records") or []
    )
    atomic_write_json(args.core, payload)
    print(
        f"Backfilled {updated_rows}/{len(rows)} player-games; "
        f"added {added_timestamps} item timestamps; complete {len(completed)}/{len(rows)}; "
        f"ODS {len(ods_matches)}, OpenDota {len(opendota_matches)}"
    )
    if missing:
        print("Missing match IDs:", ", ".join(map(str, missing)))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
