"""Safely increment and publish the professional-build caches.

The extractor remains a bounded snapshot producer. This orchestrator chooses
small date windows, merges complete matches into the existing caches, commits
both cache files with a recovery journal, and runs the production build/audit
before accepting the transaction.
"""

from __future__ import annotations

import argparse
import filecmp
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CORE = ROOT / "data" / "pro_builds.json"
DEFAULT_DETAIL = ROOT / "data" / "pro_builds_detail.json"
DEFAULT_STATUS = ROOT / "data" / "pro_builds_update_status.json"
DEFAULT_JOURNAL = ROOT / "data" / ".pro_builds_update_journal.json"
EXTRACTOR = ROOT / "scripts" / "fetch" / "fetch_pro_builds.py"
SAFE_WINDOW_DAYS = 7
DEFAULT_OVERLAP_DAYS = 2
STALE_LOCK_HOURS = 6
FILE_RETRY_ATTEMPTS = 20
FILE_RETRY_SECONDS = 0.25


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def atomic_write_json(path: Path, payload: dict) -> None:
    temp = path.with_name(f".{path.name}.tmp")
    write_json(temp, payload)
    replace_with_retry(temp, path)


def replace_with_retry(source: Path, target: Path) -> None:
    for attempt in range(FILE_RETRY_ATTEMPTS):
        try:
            os.replace(source, target)
            return
        except OSError:
            if attempt + 1 == FILE_RETRY_ATTEMPTS:
                raise
            time.sleep(FILE_RETRY_SECONDS)


def copy_with_retry(source: Path, target: Path) -> None:
    if target.exists() and filecmp.cmp(source, target, shallow=False):
        return
    for attempt in range(FILE_RETRY_ATTEMPTS):
        try:
            shutil.copy2(source, target)
            return
        except OSError:
            if attempt + 1 == FILE_RETRY_ATTEMPTS:
                raise
            time.sleep(FILE_RETRY_SECONDS)


class UpdateLock:
    def __init__(self, path: Path):
        self.path = path

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            age = datetime.now(timezone.utc).timestamp() - self.path.stat().st_mtime
            if age < STALE_LOCK_HOURS * 3600:
                raise RuntimeError(f"another professional-build update is active: {self.path}")
            self.path.unlink()
        descriptor = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump({"started_at": utc_now(), "pid": os.getpid()}, handle)
        return self

    def __exit__(self, exc_type, exc, traceback):
        self.path.unlink(missing_ok=True)


def _record_key(row: dict) -> tuple[int, int]:
    return int(row.get("m") or 0), int(row.get("sl") if row.get("sl") is not None else -1)


def _match_from_detail_key(key: str) -> int:
    return int(str(key).split(":", 1)[0])


def validate_payloads(core: dict, detail: dict) -> dict:
    records = core.get("records") or []
    keys = [_record_key(row) for row in records]
    if len(keys) != len(set(keys)):
        raise ValueError("duplicate (match_id, slot) records after merge")
    match_ids = {key[0] for key in keys}
    meta = core.get("meta") or {}
    if int(meta.get("player_games") or -1) != len(records):
        raise ValueError("core meta.player_games does not match records")
    if int(meta.get("matches") or -1) != len(match_ids):
        raise ValueError("core meta.matches does not match records")
    dates = [str(row.get("d") or "") for row in records]
    if dates and (meta.get("date_min") != min(dates) or meta.get("date_max") != max(dates)):
        raise ValueError("core date bounds do not match records")
    for section in ("players", "drafts", "events"):
        for key in (detail.get(section) or {}):
            if _match_from_detail_key(key) not in match_ids:
                raise ValueError(f"orphan detail {section} key: {key}")
    detail_meta = detail.get("meta") or {}
    expected = {
        "players": len(detail.get("players") or {}),
        "draft_matches": len(detail.get("drafts") or {}),
        "event_matches": len(detail.get("events") or {}),
    }
    for key, value in expected.items():
        if int(detail_meta.get(key) or 0) != value:
            raise ValueError(f"detail meta.{key} does not match payload")
    return {"matches": len(match_ids), "player_games": len(records), **expected}


def _rebuild_meta(existing: dict, incoming: dict, records: list[dict], detail: dict, update: dict) -> dict:
    meta = dict(existing.get("meta") or {})
    incoming_meta = incoming.get("meta") or {}
    patches = Counter(str(row.get("p") or "") for row in records)
    dates = [str(row.get("d") or "") for row in records]
    matches = {int(row.get("m") or 0) for row in records}
    positions = {
        "assigned_player_games": sum(row.get("r") is not None for row in records),
        "lane_method_player_games": sum(
            str(row.get("rm") or "").startswith("lanes") for row in records
        ),
        "opendota_lane_player_games": sum(
            row.get("rm") == "lanes_opendota" for row in records
        ),
        "hits_fallback_player_games": sum(row.get("rm") == "hits" for row in records),
        "source_stats": (incoming_meta.get("positions") or {}).get("source_stats")
        or (meta.get("positions") or {}).get("source_stats") or {},
    }
    players = detail.get("players") or {}
    advanced = {
        "snapshot_player_games": sum(bool((value or {}).get("q")) for value in players.values()),
        "detail_player_games": len(players),
        "ability_events": sum(len((value or {}).get("a") or []) for value in players.values()),
        "ability_player_games": sum(bool((value or {}).get("a")) for value in players.values()),
        "opendota_ability_player_games": sum(
            (value or {}).get("a_src") == "opendota" for value in players.values()
        ),
        "opendota_ability_events": sum(
            len((value or {}).get("a") or [])
            for value in players.values()
            if (value or {}).get("a_src") == "opendota"
        ),
        "draft_matches": len(detail.get("drafts") or {}),
        "event_matches": len(detail.get("events") or {}),
        "event_query_failures": int((incoming_meta.get("advanced") or {}).get("event_query_failures") or 0),
        "inventory_snapshot_player_games": sum(
            bool((value or {}).get("iv")) for value in players.values()
        ),
        "damage_bucket_player_rows": sum(
            len((value or {}).get("dm") or []) for value in players.values()
        ),
        "damage_query_failures": int(
            (incoming_meta.get("advanced") or {}).get("damage_query_failures") or 0
        ),
        "timed_item_player_games": sum(
            any(isinstance(pair[1], int) for pair in (row.get("i") or []))
            for row in records
        ),
        "item_use_player_games": sum(bool(row.get("u")) for row in records),
        "item_use_records": sum(len(row.get("u") or []) for row in records),
        "item_use_source_player_games": sum(
            isinstance(row.get("u"), list) for row in records
        ),
        "item_use_source_matches": len({
            int(row.get("m") or 0)
            for row in records if isinstance(row.get("u"), list)
        }),
        "item_use_matches": len({
            int(row.get("m") or 0) for row in records if bool(row.get("u"))
        }),
        "item_use_matches_latest_increment": int(
            (incoming_meta.get("advanced") or {}).get("item_use_matches") or 0
        ),
        "item_use_source_matches_latest_increment": int(
            (incoming_meta.get("advanced") or {}).get("item_use_source_matches") or 0
        ),
        "combatlog_purchase_matches_latest_increment": int(
            (incoming_meta.get("advanced") or {}).get("combatlog_purchase_matches") or 0
        ),
        "snapshot_times": (incoming_meta.get("advanced") or {}).get("snapshot_times")
        or (meta.get("advanced") or {}).get("snapshot_times") or [],
    }
    for key in ("bounded_route_backfill", "item_use_backfill"):
        value = (incoming_meta.get("advanced") or {}).get(key) or (meta.get("advanced") or {}).get(key)
        if value:
            advanced[key] = value
    meta.update(
        {
            "generated_at": utc_now(),
            "source": "dota2_analysis authoritative incremental export + exact OpenDota fallbacks",
            "matches": len(matches),
            "player_games": len(records),
            "date_min": min(dates, default=""),
            "date_max": max(dates, default=""),
            "patches": dict(sorted(patches.items())),
            "leagues": len({str(row.get("l") or "") for row in records}),
            "positions": positions,
            "advanced": advanced,
            "update": update,
            "dedup_audit": incoming_meta.get("dedup_audit") or {},
            "conversion_failures": incoming_meta.get("conversion_failures") or {},
        }
    )
    meta["query_scope"] = {
        "mode": "bounded incremental windows",
        "date_from": update["date_from"],
        "date_to": update["date_to"],
        "max_window_days": SAFE_WINDOW_DAYS,
        "partition_filter": "one exact dt partition per fact query",
        "match_id_scope": "metadata discovery first; finite IDs for every in-match query",
        "dedup": "post-fetch per-table semantic keys; complete incoming matches replace cached matches",
    }
    if "unresolved_inventory_names" in incoming_meta:
        meta["unresolved_inventory_names_latest_increment"] = int(incoming_meta.get("unresolved_inventory_names") or 0)
    return meta


def merge_payloads(existing_core: dict, existing_detail: dict, incoming_core: dict, incoming_detail: dict, *, date_from: str, date_to: str) -> tuple[dict, dict, dict]:
    incoming_rows = list(incoming_core.get("records") or [])
    outside = [row for row in incoming_rows if not (date_from <= str(row.get("d") or "") <= date_to)]
    if outside:
        raise ValueError(f"incoming records fall outside bounded window: {outside[0].get('m')}")
    incoming_counts = Counter(int(row.get("m") or 0) for row in incoming_rows)
    incomplete = {match_id: count for match_id, count in incoming_counts.items() if count < 9}
    if incomplete:
        raise ValueError(f"incoming match is incomplete (<9 player rows): {next(iter(incomplete.items()))}")
    if incoming_rows:
        timed = sum(
            any(isinstance(pair[1], int) for pair in (row.get("i") or []))
            for row in incoming_rows
        )
        snapshots = sum(bool(row.get("g")) for row in incoming_rows)
        if timed / len(incoming_rows) < 0.4:
            raise ValueError(
                f"incoming purchase timing coverage is too low: {timed}/{len(incoming_rows)}"
            )
        if snapshots / len(incoming_rows) < 0.8:
            raise ValueError(
                f"incoming 15-minute snapshot coverage is too low: {snapshots}/{len(incoming_rows)}"
            )
    incoming_match_ids = {int(row.get("m") or 0) for row in incoming_rows}
    old_rows = list(existing_core.get("records") or [])
    old_match_ids = {int(row.get("m") or 0) for row in old_rows}
    kept_rows = [row for row in old_rows if int(row.get("m") or 0) not in incoming_match_ids]
    records = kept_rows + incoming_rows
    records.sort(key=lambda row: (str(row.get("d") or ""), int(row.get("m") or 0), int(row.get("sl") or 0)))

    detail = {"meta": {}, "players": {}, "drafts": {}, "events": {}}
    for section in ("players", "drafts", "events"):
        previous = existing_detail.get(section) or {}
        detail[section] = {
            str(key): value for key, value in previous.items()
            if _match_from_detail_key(str(key)) not in incoming_match_ids
        }
        detail[section].update({str(key): value for key, value in (incoming_detail.get(section) or {}).items()})

    update = {
        "mode": "incremental",
        "date_from": date_from,
        "date_to": date_to,
        "completed_at": utc_now(),
        "incoming_matches": len(incoming_match_ids),
        "new_matches": len(incoming_match_ids - old_match_ids),
        "refreshed_matches": len(incoming_match_ids & old_match_ids),
        "previous_matches": len(old_match_ids),
        "result_matches": len({int(row.get("m") or 0) for row in records}),
        "query_contract": "bounded match scope + exact dt + bounded match_id batches",
    }
    core = {"meta": {}, "records": records}
    core["meta"] = _rebuild_meta(existing_core, incoming_core, records, detail, update)
    detail["meta"] = {
        "generated_at": core["meta"]["generated_at"],
        "players": len(detail["players"]),
        "draft_matches": len(detail["drafts"]),
        "event_matches": len(detail["events"]),
        "update": update,
    }
    validation = validate_payloads(core, detail)
    return core, detail, {**update, **validation}


def recover_if_needed(core_path: Path, detail_path: Path, journal_path: Path) -> bool:
    if not journal_path.exists():
        return False
    journal = read_json(journal_path)
    if journal.get("status") not in {"committing", "pending_quality_gate"}:
        return False
    core_backup = Path(journal["core_backup"])
    detail_backup = Path(journal["detail_backup"])
    if core_backup.exists() and detail_backup.exists():
        copy_with_retry(core_backup, core_path)
        copy_with_retry(detail_backup, detail_path)
        journal.update({"status": "recovered", "recovered_at": utc_now()})
        atomic_write_json(journal_path, journal)
        return True
    raise RuntimeError("unfinished update found but rollback files are missing")


def begin_commit(core_path: Path, detail_path: Path, journal_path: Path, core: dict, detail: dict, *, fail_after_core: bool = False) -> dict:
    core_backup = core_path.with_suffix(core_path.suffix + ".rollback")
    detail_backup = detail_path.with_suffix(detail_path.suffix + ".rollback")
    core_next = core_path.with_suffix(core_path.suffix + ".next")
    detail_next = detail_path.with_suffix(detail_path.suffix + ".next")
    write_json(core_next, core)
    write_json(detail_next, detail)
    validate_payloads(read_json(core_next), read_json(detail_next))
    shutil.copy2(core_path, core_backup)
    shutil.copy2(detail_path, detail_backup)
    journal = {
        "status": "committing", "started_at": utc_now(),
        "core": str(core_path), "detail": str(detail_path),
        "core_backup": str(core_backup), "detail_backup": str(detail_backup),
    }
    atomic_write_json(journal_path, journal)
    replace_with_retry(detail_next, detail_path)
    replace_with_retry(core_next, core_path)
    if fail_after_core:
        raise RuntimeError("simulated failure after cache replacement")
    validate_payloads(read_json(core_path), read_json(detail_path))
    journal.update({"status": "pending_quality_gate", "committed_at": utc_now()})
    atomic_write_json(journal_path, journal)
    return journal


def rollback(core_path: Path, detail_path: Path, journal_path: Path, message: str) -> None:
    journal = read_json(journal_path) if journal_path.exists() else {}
    core_backup = Path(journal.get("core_backup", str(core_path) + ".rollback"))
    detail_backup = Path(journal.get("detail_backup", str(detail_path) + ".rollback"))
    if core_backup.exists():
        copy_with_retry(core_backup, core_path)
    if detail_backup.exists():
        copy_with_retry(detail_backup, detail_path)
    journal.update({"status": "rolled_back", "failed_at": utc_now(), "error": message})
    atomic_write_json(journal_path, journal)


def finalize(journal_path: Path) -> None:
    journal = read_json(journal_path)
    for key in ("core_backup", "detail_backup"):
        Path(journal[key]).unlink(missing_ok=True)
    journal.update({"status": "success", "completed_at": utc_now()})
    atomic_write_json(journal_path, journal)


def date_windows(start: date, end: date, max_days: int = SAFE_WINDOW_DAYS):
    cursor = start
    while cursor <= end:
        window_end = min(end, cursor + timedelta(days=max_days - 1))
        yield cursor, window_end
        cursor = window_end + timedelta(days=1)


def empty_snapshot(start: date, end: date) -> tuple[dict, dict]:
    generated = utc_now()
    return (
        {"meta": {"generated_at": generated, "query_scope": {"date_from": start.isoformat(), "date_to": end.isoformat()}}, "records": []},
        {"meta": {"generated_at": generated, "players": 0, "draft_matches": 0, "event_matches": 0}, "players": {}, "drafts": {}, "events": {}},
    )


def extract_window(start: date, end: date, temp_dir: Path) -> tuple[dict, dict]:
    core_out = temp_dir / f"core-{start}-{end}.json"
    detail_out = temp_dir / f"detail-{start}-{end}.json"
    env = dict(os.environ)
    env.update({
        "PRO_BUILDS_DATE_FROM": start.isoformat(), "PRO_BUILDS_DATE_TO": end.isoformat(),
        "PRO_BUILDS_OUT": str(core_out), "PRO_BUILDS_DETAIL_OUT": str(detail_out),
    })
    result = subprocess.run(
        [sys.executable, str(EXTRACTOR)], cwd=ROOT, env=env,
        text=True, capture_output=True, encoding="utf-8", errors="replace",
    )
    if result.stdout:
        print(result.stdout, end="")
    if result.returncode and "No professional matches found" in (result.stdout + result.stderr):
        print(f"      no matches in {start} .. {end}; keeping cache unchanged")
        return empty_snapshot(start, end)
    if result.returncode:
        raise RuntimeError(f"extractor failed for {start}..{end}: {result.stderr[-2000:]}")
    return read_json(core_out), read_json(detail_out)


def run_quality_gate() -> None:
    commands = (
        [sys.executable, "build_site.py", "pro"],
        [sys.executable, "scripts/audit/check_pro_builds.py"],
    )
    for command in commands:
        subprocess.run(command, cwd=ROOT, check=True)


def publish_final_status() -> None:
    subprocess.run(
        [sys.executable, "-c", "from builders.pro_builds import _write_compact_core; _write_compact_core()"],
        cwd=ROOT, check=True,
    )
    subprocess.run(
        [sys.executable, "scripts/audit/check_pro_builds.py"],
        cwd=ROOT, check=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core", type=Path, default=DEFAULT_CORE)
    parser.add_argument("--detail", type=Path, default=DEFAULT_DETAIL)
    parser.add_argument("--status", type=Path, default=DEFAULT_STATUS)
    parser.add_argument("--journal", type=Path, default=DEFAULT_JOURNAL)
    parser.add_argument("--lock", type=Path)
    parser.add_argument("--incoming-core", type=Path)
    parser.add_argument("--incoming-detail", type=Path)
    parser.add_argument("--date-from")
    parser.add_argument("--date-to")
    parser.add_argument("--overlap-days", type=int, default=DEFAULT_OVERLAP_DAYS)
    parser.add_argument("--skip-build", action="store_true", help="Only for isolated fixture tests")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    lock_path = args.lock or args.journal.with_name(".pro_builds_update.lock")
    with UpdateLock(lock_path):
        return run_update(args)


def run_update(args: argparse.Namespace) -> int:
    if not args.core.exists() or not args.detail.exists():
        raise SystemExit("existing core/detail caches are required for incremental update")
    recovered = recover_if_needed(args.core, args.detail, args.journal)
    existing_core, existing_detail = read_json(args.core), read_json(args.detail)
    latest = date.fromisoformat(existing_core.get("meta", {}).get("date_max") or date.today().isoformat())
    start = date.fromisoformat(args.date_from) if args.date_from else latest - timedelta(days=max(0, args.overlap_days - 1))
    end = date.fromisoformat(args.date_to) if args.date_to else date.today()
    if start > end:
        raise SystemExit("incremental date_from must not be after date_to")
    started_at = utc_now()
    status = {"status": "running", "started_at": started_at, "date_from": start.isoformat(), "date_to": end.isoformat(), "recovered_previous_transaction": recovered}
    atomic_write_json(args.status, status)
    try:
        candidate_core, candidate_detail = existing_core, existing_detail
        aggregate = {"incoming_matches": 0, "new_matches": 0, "refreshed_matches": 0}
        if args.incoming_core or args.incoming_detail:
            if not args.incoming_core or not args.incoming_detail:
                raise ValueError("both --incoming-core and --incoming-detail are required")
            snapshots = [(start, end, read_json(args.incoming_core), read_json(args.incoming_detail))]
            for window_start, window_end, core, detail in snapshots:
                candidate_core, candidate_detail, result = merge_payloads(candidate_core, candidate_detail, core, detail, date_from=window_start.isoformat(), date_to=window_end.isoformat())
                for key in aggregate:
                    aggregate[key] += int(result.get(key) or 0)
        else:
            with tempfile.TemporaryDirectory(prefix="pro-builds-update-") as directory:
                temp_dir = Path(directory)
                for window_start, window_end in date_windows(start, end):
                    core, detail = extract_window(window_start, window_end, temp_dir)
                    candidate_core, candidate_detail, result = merge_payloads(candidate_core, candidate_detail, core, detail, date_from=window_start.isoformat(), date_to=window_end.isoformat())
                    for key in aggregate:
                        aggregate[key] += int(result.get(key) or 0)
        final_update = dict(candidate_core["meta"].get("update") or {})
        final_update.update({"date_from": start.isoformat(), "date_to": end.isoformat(), **aggregate, "windows": sum(1 for _ in date_windows(start, end))})
        candidate_core["meta"]["update"] = final_update
        candidate_core["meta"]["query_scope"].update({"date_from": start.isoformat(), "date_to": end.isoformat()})
        candidate_detail["meta"]["update"] = final_update
        validation = validate_payloads(candidate_core, candidate_detail)
        begin_commit(args.core, args.detail, args.journal, candidate_core, candidate_detail)
        status.update({"status": "running", **aggregate, **validation, "windows": final_update["windows"], "quality_gate": "skipped" if args.skip_build else "running"})
        atomic_write_json(args.status, status)
        if not args.skip_build:
            run_quality_gate()
        status.update({"status": "success", "completed_at": utc_now(), "quality_gate": "skipped" if args.skip_build else "passed"})
        atomic_write_json(args.status, status)
        if not args.skip_build:
            publish_final_status()
        finalize(args.journal)
        print(f"Update complete: {validation['matches']:,} matches / {validation['player_games']:,} player-games; +{aggregate['new_matches']} new, {aggregate['refreshed_matches']} refreshed")
        return 0
    except Exception as exc:
        rollback_error = None
        if args.journal.exists() and read_json(args.journal).get("status") in {"committing", "pending_quality_gate"}:
            try:
                rollback(args.core, args.detail, args.journal, str(exc))
            except Exception as recovery_exc:
                rollback_error = str(recovery_exc)
        status.update({"status": "failed", "failed_at": utc_now(), "error": str(exc)})
        if rollback_error:
            status["rollback_error"] = rollback_error
        atomic_write_json(args.status, status)
        if not args.skip_build:
            try:
                subprocess.run([sys.executable, "build_site.py", "pro"], cwd=ROOT, check=True)
            except subprocess.SubprocessError:
                pass
        raise


if __name__ == "__main__":
    raise SystemExit(main())
