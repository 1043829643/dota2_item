"""Backfill terminal inventory snapshots for a bounded cached match slice.

The tool never discovers matches by scanning a fact table.  It starts from the
already-approved professional-match cache, groups finite match IDs by their
exact ``dt`` partition, retrieves only a narrow duration window, deduplicates
physical rows in application memory, and writes the latest observable snapshot
from the final five seconds of the parser's terminal grace period per
``(match_id, slot)`` to the compact core record as ``f`` / ``ft``.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from scripts.fetch.fetch_pro_builds import (
    ROOT,
    _connect,
    _deduplicate_rows,
    _load_item_catalog,
    _load_replay_item_mapping,
    _mapped_inventory,
)


DEFAULT_CORE = ROOT / "data" / "pro_builds.json"
DEFAULT_BATCH_SIZE = 25


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core", type=Path, default=DEFAULT_CORE)
    parser.add_argument("--date-from", required=True)
    parser.add_argument("--date-to", required=True)
    parser.add_argument("--hero", help="Optional canonical hero slug")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Refresh records that already contain a terminal inventory",
    )
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def atomic_write_json(path: Path, payload: dict) -> None:
    handle, temporary = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="") as stream:
            json.dump(payload, stream, ensure_ascii=False, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        for attempt in range(20):
            try:
                os.replace(temporary, path)
                break
            except PermissionError:
                if attempt == 19:
                    raise
                time.sleep(0.25)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def _selected_records(payload: dict, args: argparse.Namespace) -> list[dict]:
    return [
        row
        for row in payload.get("records") or []
        if args.date_from <= str(row.get("d") or "") <= args.date_to
        and (not args.hero or str(row.get("h") or "") == args.hero)
        and (args.refresh or not isinstance(row.get("f"), list))
        and int(row.get("du") or 0) > 0
    ]


def _batches(values: list[int], size: int):
    for offset in range(0, len(values), size):
        yield values[offset : offset + size]


def _query_batch(
    cursor,
    day: str,
    match_ids: list[int],
    durations: dict[int, int],
    *,
    wide: bool = False,
):
    ids = ",".join(f"'{match_id}'" for match_id in match_ids)
    windows = " OR ".join(
        f"(match_id = '{match_id}' AND time BETWEEN "
        f"{max(0, durations[match_id] - 180) if wide else durations[match_id] + 175} "
        f"AND {durations[match_id] + 180})"
        for match_id in match_ids
    )
    cursor.execute(
        f"""
        SELECT match_id, time, log_index, type, slot, items
        FROM dota2_analysis.hero_status_update
        WHERE dt = '{day}' AND match_id IN ({ids})
          AND type = 'hero_status_update'
          AND ({windows})
        """
    )
    return _deduplicate_rows(
        cursor.fetchall(),
        table="hero_status_update",
        columns=("match_id", "time", "log_index", "type", "slot", "items"),
    )


def main() -> int:
    args = parse_args()
    if args.date_from > args.date_to:
        raise SystemExit("date-from must not be after date-to")
    if args.batch_size < 1 or args.batch_size > 100:
        raise SystemExit("batch-size must be between 1 and 100")

    payload = json.loads(args.core.read_text(encoding="utf-8"))
    selected = _selected_records(payload, args)
    if not selected:
        print("No missing terminal inventories in the bounded selection")
        return 0

    rows_by_key = {
        (int(row["m"]), int(row["sl"])): row
        for row in selected
        if row.get("m") is not None and row.get("sl") is not None
    }
    matches_by_day: dict[str, set[int]] = defaultdict(set)
    durations: dict[int, int] = {}
    for row in selected:
        match_id = int(row["m"])
        matches_by_day[str(row["d"])].add(match_id)
        durations[match_id] = max(
            durations.get(match_id, 0), int(row.get("du") or 0)
        )

    catalog = _load_item_catalog()
    valid_item_ids = set(catalog)
    replay_to_item = _load_replay_item_mapping(valid_item_ids)
    unresolved: Counter = Counter()
    candidates: dict[tuple[int, int], tuple[int, list[str]]] = {}
    queried_matches = 0
    connection = _connect()
    try:
        with connection.cursor() as cursor:
            for day in sorted(matches_by_day):
                ids_for_day = sorted(matches_by_day[day])
                for batch in _batches(ids_for_day, args.batch_size):
                    raw_rows = _query_batch(cursor, day, batch, durations)
                    queried_matches += len(batch)
                    for match_raw, seconds_raw, _log_index, _type, slot_raw, raw_items in raw_rows:
                        if match_raw is None or seconds_raw is None or slot_raw is None:
                            continue
                        key = (int(match_raw), int(slot_raw))
                        if key not in rows_by_key:
                            continue
                        seconds = int(seconds_raw)
                        mapped = _mapped_inventory(
                            raw_items, replay_to_item, valid_item_ids, unresolved
                        )
                        current = candidates.get(key)
                        if current is None or seconds > current[0]:
                            candidates[key] = (seconds, mapped)
                    print(
                        f"[{day}] {queried_matches}/{sum(map(len, matches_by_day.values()))} "
                        f"matches | {len(candidates)}/{len(rows_by_key)} player snapshots",
                        flush=True,
                    )
            missing_matches = sorted({
                match_id for match_id, slot in rows_by_key if (match_id, slot) not in candidates
            })
            fallback_by_day: dict[str, list[int]] = defaultdict(list)
            day_by_match = {int(row["m"]): str(row["d"]) for row in selected}
            for match_id in missing_matches:
                fallback_by_day[day_by_match[match_id]].append(match_id)
            for day in sorted(fallback_by_day):
                for batch in _batches(sorted(fallback_by_day[day]), args.batch_size):
                    raw_rows = _query_batch(
                        cursor, day, batch, durations, wide=True
                    )
                    for match_raw, seconds_raw, _log_index, _type, slot_raw, raw_items in raw_rows:
                        if match_raw is None or seconds_raw is None or slot_raw is None:
                            continue
                        key = (int(match_raw), int(slot_raw))
                        if key not in rows_by_key:
                            continue
                        seconds = int(seconds_raw)
                        mapped = _mapped_inventory(
                            raw_items, replay_to_item, valid_item_ids, unresolved
                        )
                        current = candidates.get(key)
                        if current is None or seconds > current[0]:
                            candidates[key] = (seconds, mapped)
    finally:
        connection.close()

    for key, (seconds, item_ids) in candidates.items():
        rows_by_key[key]["f"] = item_ids
        rows_by_key[key]["ft"] = seconds

    generated_at = utc_now()
    meta = payload.setdefault("meta", {})
    meta["generated_at"] = generated_at
    advanced = meta.setdefault("advanced", {})
    all_rows = payload.get("records") or []
    advanced["final_inventory_player_games"] = sum(
        isinstance(row.get("f"), list) for row in all_rows
    )
    advanced["final_inventory_backfill"] = {
        "completed_at": generated_at,
        "date_from": args.date_from,
        "date_to": args.date_to,
        "hero": args.hero,
        "selected_player_games": len(selected),
        "recovered_player_games": len(candidates),
        "missing_player_games": len(selected) - len(candidates),
        "unresolved_inventory_names": sum(unresolved.values()),
        "query_contract": (
            "exact dt + finite cached match IDs + duration+175..180 seconds; "
            "bounded ±180 fallback only for misses; application dedup "
            "(match_id,log_index)"
        ),
    }
    atomic_write_json(args.core, payload)
    print(
        f"Terminal inventories recovered for {len(candidates)}/{len(rows_by_key)} "
        f"selected player-games; global coverage "
        f"{advanced['final_inventory_player_games']}/{len(all_rows)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
