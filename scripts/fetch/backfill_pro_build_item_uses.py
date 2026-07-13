"""Backfill first item-use timestamps for cached professional player-games.

The local cache defines the complete query boundary: only its exact ``dt``
partitions and match IDs are sent to StarRocks.  By default every cached row is
selected; ``--hero`` and the inclusive date arguments may narrow a repair.

``records[].u`` deliberately has three states:

* ``null``: no relevant combat-log rows were returned for the match;
* ``[]``: the match had relevant source rows, but this player had no recognized
  post-purchase use;
* ``[[item_id, first_use_seconds], ...]``: validated absolute use timestamps.

The script never derives use times from OpenDota's aggregate ``item_uses``
counts because those counts do not contain event timestamps.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path


WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from scripts.fetch.fetch_pro_builds import (
    ROOT,
    _connect,
    _load_item_ids,
    _partition_batches,
    _varchar_id_sql,
    _varchar_sql,
)


DEFAULT_CORE = ROOT / "data" / "pro_builds.json"
ISO_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core", type=Path, default=DEFAULT_CORE)
    parser.add_argument(
        "--hero",
        help="Optional canonical hero slug, for example sven (default: all heroes)",
    )
    parser.add_argument("--date-from", help="Optional inclusive YYYY-MM-DD lower bound")
    parser.add_argument("--date-to", help="Optional inclusive YYYY-MM-DD upper bound")
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def atomic_write_json(path: Path, payload: dict) -> None:
    """Durably replace ``path`` without exposing a partially written cache."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
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


def normalize_hero(value: str | None) -> str | None:
    if value is None:
        return None
    return str(value).strip().lower().removeprefix("npc_dota_hero_") or None


def validate_bounds(date_from: str | None, date_to: str | None) -> None:
    for label, value in (("--date-from", date_from), ("--date-to", date_to)):
        if value is None:
            continue
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise SystemExit(f"Invalid {label}: {value!r}; expected YYYY-MM-DD") from exc
    if date_from and date_to and date_from > date_to:
        raise SystemExit("--date-from must not be after --date-to")


def selected_rows(
    payload: dict,
    hero: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> list[dict]:
    """Return rows inside optional filters, preserving the cache's row objects."""
    hero = normalize_hero(hero)
    selected: list[dict] = []
    for row in payload.get("records") or []:
        row_hero = normalize_hero(str(row.get("h") or ""))
        row_day = str(row.get("d") or "")[:10]
        if hero and row_hero != hero:
            continue
        if date_from and row_day < date_from:
            continue
        if date_to and row_day > date_to:
            continue
        selected.append(row)
    return selected


def validate_selected_rows(rows: list[dict]) -> None:
    """Refuse malformed local boundaries rather than broadening a DB query."""
    for row in rows:
        try:
            match_id = int(row["m"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("Selected cache row has no numeric match ID") from exc
        day = str(row.get("d") or "")[:10]
        hero = normalize_hero(str(row.get("h") or ""))
        if match_id <= 0 or not ISO_DAY.fullmatch(day) or not hero:
            raise ValueError(
                f"Selected cache row has an invalid query boundary: "
                f"match={match_id!r}, dt={day!r}, hero={hero!r}"
            )


def build_item_use_query(
    partition_date: str,
    match_ids: list[int],
    item_ids: set[str] | None = None,
) -> str:
    """Build one exact-partition, bounded-ID and deduplicated source query."""
    if not ISO_DAY.fullmatch(str(partition_date)):
        raise ValueError(f"Invalid exact dt partition: {partition_date!r}")
    if not match_ids:
        raise ValueError("A bounded match-ID list is required")
    ids = _varchar_id_sql(sorted({int(match_id) for match_id in match_ids}))
    active_item_predicate = "inflictor LIKE 'item_%'"
    if item_ids:
        active_item_predicate = f"inflictor IN ({_varchar_sql(sorted(item_ids))})"
    return f"""
        SELECT match_id, attackername, item_id,
               GREATEST(time, 0) AS use_time
        FROM (
          SELECT match_id, time, attackername,
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
                (type = 'DOTA_COMBATLOG_ITEM' AND {active_item_predicate})
                OR (
                  type = 'DOTA_COMBATLOG_MODIFIER_ADD'
                  AND inflictor = 'modifier_echo_sabre_debuff'
                )
              )
          ) dedup WHERE rn = 1
        ) clean
        WHERE item_id IS NOT NULL
        ORDER BY match_id, attackername, use_time, item_id
    """


def purchase_times(row: dict, valid_items: set[str]) -> dict[str, int]:
    """Return the earliest valid cached purchase timestamp for each item."""
    purchases: dict[str, int] = {}
    for pair in row.get("i") or []:
        if not isinstance(pair, (list, tuple)) or len(pair) < 2:
            continue
        item_id, seconds = str(pair[0] or ""), pair[1]
        if (
            item_id not in valid_items
            or not isinstance(seconds, int)
            or isinstance(seconds, bool)
            or seconds < 0
        ):
            continue
        purchases[item_id] = min(purchases.get(item_id, seconds), seconds)
    return purchases


def mark_scanned(row: dict) -> None:
    """Clear prior selected output and mark source presence for one player-game."""
    row["u"] = []


def merge_first_use(
    row: dict,
    item_id: str,
    use_time: object,
    valid_items: set[str],
) -> bool:
    """Merge one event if it is a recognized post-purchase first use.

    Returns true when the persisted value changed.  Repeated calls are
    idempotent and an earlier valid event replaces a later event.
    """
    if not isinstance(row.get("u"), list):
        return False
    item_id = str(item_id or "")
    if (
        item_id not in valid_items
        or not isinstance(use_time, int)
        or isinstance(use_time, bool)
        or use_time < 0
    ):
        return False
    purchases = purchase_times(row, valid_items)
    bought_at = purchases.get(item_id)
    if bought_at is None or use_time < bought_at:
        return False

    merged: dict[str, int] = {}
    for pair in row["u"]:
        if not isinstance(pair, (list, tuple)) or len(pair) < 2:
            continue
        existing_id, existing_time = str(pair[0] or ""), pair[1]
        if (
            existing_id in valid_items
            and isinstance(existing_time, int)
            and not isinstance(existing_time, bool)
            and existing_time >= purchases.get(existing_id, 10**18)
        ):
            merged[existing_id] = min(merged.get(existing_id, existing_time), existing_time)
    before = merged.get(item_id)
    merged[item_id] = min(merged.get(item_id, use_time), use_time)
    row["u"] = [
        [stored_id, seconds]
        for stored_id, seconds in sorted(merged.items(), key=lambda pair: (pair[1], pair[0]))
    ]
    return before != merged[item_id]


def update_metadata(
    payload: dict,
    *,
    selected: list[dict],
    hero: str | None,
    date_from: str | None,
    date_to: str | None,
    source_match_ids: set[int],
    query_batches: int,
    source_rows: int,
) -> dict:
    """Refresh total coverage counters and record the latest backfill scope."""
    records = payload.get("records") or []
    generated_at = utc_now()
    meta = payload.setdefault("meta", {})
    meta["generated_at"] = generated_at
    advanced = meta.setdefault("advanced", {})

    scanned_rows = [row for row in records if isinstance(row.get("u"), list)]
    populated_rows = [row for row in records if bool(row.get("u"))]
    scanned_match_ids = {int(row["m"]) for row in scanned_rows}
    populated_match_ids = {int(row["m"]) for row in populated_rows}
    item_use_records = sum(len(row.get("u") or []) for row in records)
    advanced.update(
        {
            "item_use_source_matches": len(scanned_match_ids),
            "item_use_source_player_games": len(scanned_rows),
            "item_use_matches": len(populated_match_ids),
            "item_use_player_games": len(populated_rows),
            "item_use_records": item_use_records,
        }
    )

    selected_match_ids = {int(row["m"]) for row in selected}
    selected_scanned = [row for row in selected if isinstance(row.get("u"), list)]
    selected_populated = [row for row in selected if bool(row.get("u"))]
    advanced["item_use_backfill"] = {
        "completed_at": generated_at,
        "hero": normalize_hero(hero),
        "date_from": date_from,
        "date_to": date_to,
        "selected_player_games": len(selected),
        "selected_matches": len(selected_match_ids),
        "query_batches": query_batches,
        "source_rows": source_rows,
        "source_matches": len(source_match_ids),
        "source_player_games": len(selected_scanned),
        "populated_player_games": len(selected_populated),
        "item_use_records": sum(len(row.get("u") or []) for row in selected),
        "unscanned_matches": len(selected_match_ids - source_match_ids),
        "query_contract": (
            "one exact dt partition + cached match IDs per query; "
            "ROW_NUMBER dedup on match_id,time,log_index"
        ),
        "provenance": {
            "source": "StarRocks ODS dota2_analysis.combat_logs",
            "active_event": "DOTA_COMBATLOG_ITEM inflictor=item_*",
            "echo_sabre_event": (
                "DOTA_COMBATLOG_MODIFIER_ADD "
                "modifier_echo_sabre_debuff -> item_echo_sabre"
            ),
            "purchase_guard": "cached records[].i timed purchase; use >= purchase",
            "time_semantics": "absolute replay seconds; first recognized use",
            "missing_semantics": "null=source absent, []=source present/no valid use",
        },
    }
    return advanced["item_use_backfill"]


def main() -> int:
    args = parse_args()
    validate_bounds(args.date_from, args.date_to)
    hero = normalize_hero(args.hero)
    payload = json.loads(args.core.read_text(encoding="utf-8"))
    rows = selected_rows(payload, hero, args.date_from, args.date_to)
    if not rows:
        raise SystemExit("No cached player-games matched the requested selection")
    validate_selected_rows(rows)

    # Selected rows are recomputed as one unit.  Matches without returned
    # source events remain explicitly unknown rather than inheriting stale data.
    for row in rows:
        row["u"] = None

    rows_by_match: dict[int, list[dict]] = defaultdict(list)
    rows_by_match_hero: dict[tuple[int, str], list[dict]] = defaultdict(list)
    partition_date_by_match: dict[int, str] = {}
    for row in rows:
        match_id = int(row["m"])
        hero_name = f"npc_dota_hero_{normalize_hero(row['h'])}"
        rows_by_match[match_id].append(row)
        rows_by_match_hero[(match_id, hero_name)].append(row)
        partition_date_by_match[match_id] = str(row["d"])[:10]

    batches = list(_partition_batches(rows_by_match, partition_date_by_match))
    valid_items = _load_item_ids()
    source_match_ids: set[int] = set()
    source_rows = 0
    accepted_events = 0
    query_batches = 0
    connection = _connect()
    try:
        with connection.cursor() as cursor:
            for index, (partition_date, batch) in enumerate(batches, start=1):
                batch_item_ids = {
                    item_id
                    for match_id in batch
                    for row in rows_by_match.get(int(match_id), [])
                    for item_id in purchase_times(row, valid_items)
                    if item_id != "item_tpscroll"
                }
                if not batch_item_ids:
                    continue
                print(
                    f"[{index}/{len(batches)}] dt={partition_date} "
                    f"matches={len(batch)}",
                    flush=True,
                )
                cursor.execute(
                    build_item_use_query(partition_date, batch, batch_item_ids)
                )
                query_batches += 1
                result_rows = cursor.fetchall()
                source_rows += len(result_rows)
                batch_source_matches = {int(result[0]) for result in result_rows}
                source_match_ids.update(batch_source_matches)
                for match_id in batch_source_matches:
                    for row in rows_by_match.get(match_id, []):
                        mark_scanned(row)
                for match_id, attackername, item_id, use_time in result_rows:
                    if use_time is None:
                        continue
                    targets = rows_by_match_hero.get(
                        (int(match_id), str(attackername or "")), []
                    )
                    for row in targets:
                        accepted_events += int(
                            merge_first_use(
                                row,
                                str(item_id or ""),
                                int(use_time),
                                valid_items,
                            )
                        )
    finally:
        connection.close()

    backfill = update_metadata(
        payload,
        selected=rows,
        hero=hero,
        date_from=args.date_from,
        date_to=args.date_to,
        source_match_ids=source_match_ids,
        query_batches=query_batches,
        source_rows=source_rows,
    )
    atomic_write_json(args.core, payload)
    print(
        "First-use backfill complete: "
        f"selected {len(rows)} player-games / {backfill['selected_matches']} matches; "
        f"source {backfill['source_matches']} matches; "
        f"populated {backfill['populated_player_games']} player-games / "
        f"{backfill['item_use_records']} records; "
        f"accepted changes {accepted_events}; "
        f"unscanned {backfill['unscanned_matches']} matches.",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
