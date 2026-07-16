"""Incrementally collect final-item snapshots from OpenDota public samples.

Only basic match-detail fields are retained.  The output deliberately excludes
account IDs, purchase timelines, combat logs, and replay-derived events because
the Item Data page needs only the final six inventory slots.

Examples:

    python scripts/fetch/fetch_opendota_public_items.py --matches 100
    python scripts/fetch/fetch_opendota_public_items.py --matches 500 --min-rank 80

Set ``OPENDOTA_API_KEY`` when using an API key.  Exact match responses share the
same ignored ``.cache/opendota_matches`` directory as the professional-build
fallback scripts, so already-downloaded matches are never fetched twice.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "data" / "opendota_public_items.json"
MATCH_CACHE = ROOT / ".cache" / "opendota_matches"
PATCH_CACHE = ROOT / ".cache" / "opendota_constants_patch.json"
API_ROOT = "https://api.opendota.com/api"
USER_AGENT = "sikle-item-data-public-sampler/1.0"
FINAL_ITEM_FIELDS = tuple(f"item_{index}" for index in range(6))
FINAL_ITEM_ALIASES = {
    # OpenDota exposes upgrade-level IDs while the current site catalog keeps
    # one canonical row/icon for these items.
    "item_dagon_2": "item_dagon",
    "item_dagon_3": "item_dagon",
    "item_dagon_4": "item_dagon",
    "item_dagon_5": "item_dagon",
    "item_travel_boots_2": "item_travel_boots",
}
_REQUEST_LOCK = threading.Lock()
_LAST_REQUEST_AT = 0.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--matches",
        type=int,
        default=100,
        help="Number of new completed matches to add (default: 100).",
    )
    parser.add_argument(
        "--min-rank",
        type=int,
        default=70,
        help="OpenDota minimum average rank: 70=Divine, 80=Immortal.",
    )
    parser.add_argument("--max-rank", type=int)
    parser.add_argument(
        "--min-duration",
        type=int,
        default=600,
        help="Ignore matches shorter than this many seconds (default: 600).",
    )
    parser.add_argument("--max-pages", type=int, default=30)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument(
        "--request-gap",
        type=float,
        default=0.15,
        help="Minimum gap between network requests across workers.",
    )
    return parser.parse_args()


def _atomic_write_json(path: Path, payload: dict) -> None:
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


def _api_json(path: str, query: dict | None, request_gap: float) -> object:
    params = dict(query or {})
    api_key = os.environ.get("OPENDOTA_API_KEY")
    if api_key:
        params["api_key"] = api_key
    suffix = f"?{urllib.parse.urlencode(params)}" if params else ""
    request = urllib.request.Request(
        f"{API_ROOT}{path}{suffix}",
        headers={"Accept": "application/json", "User-Agent": USER_AGENT},
    )
    for attempt in range(5):
        _rate_limit(request_gap)
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code not in {429, 500, 502, 503, 504} or attempt == 4:
                raise
            retry_after = exc.headers.get("Retry-After")
            delay = float(retry_after) if retry_after and retry_after.isdigit() else 2 ** attempt
            time.sleep(min(30.0, max(1.0, delay)) + random.random() * 0.3)
        except (urllib.error.URLError, TimeoutError):
            if attempt == 4:
                raise
            time.sleep(min(12.0, 1.5 * (attempt + 1)))
    raise RuntimeError(f"OpenDota request failed: {path}")


def _load_existing(path: Path) -> dict:
    if not path.exists():
        return {"schema": "opendota-public-items-v1", "meta": {}, "records": []}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schema") != "opendota-public-items-v1":
        raise ValueError(f"Unsupported existing schema in {path}: {payload.get('schema')!r}")
    if not isinstance(payload.get("records"), list):
        raise ValueError(f"Invalid records in {path}")
    return payload


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


def _load_match(match_id: int, request_gap: float) -> tuple[dict, bool]:
    MATCH_CACHE.mkdir(parents=True, exist_ok=True)
    path = MATCH_CACHE / f"{match_id}.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8")), True
        except (OSError, json.JSONDecodeError):
            path.unlink(missing_ok=True)
    payload = _api_json(f"/matches/{match_id}", None, request_gap)
    if not isinstance(payload, dict):
        raise ValueError(f"OpenDota match {match_id} returned non-object JSON")
    _atomic_write_json(path, payload)
    return payload, False


def _rank_label(min_rank: int | None, max_rank: int | None) -> str:
    labels = {
        10: "先锋", 20: "卫士", 30: "中军", 40: "统帅",
        50: "传奇", 60: "万古流芳", 70: "超凡入圣", 80: "冠绝一世",
    }
    if min_rank is None and max_rank is None:
        return "全部段位"
    low = labels.get((int(min_rank or 10) // 10) * 10, str(min_rank or "不限"))
    if max_rank is None:
        return f"{low}及以上"
    high = labels.get((int(max_rank) // 10) * 10, str(max_rank))
    return low if min_rank == max_rank else f"{low}至{high}"


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
    counters = {"players": 0, "leavers": 0, "unknown_heroes": 0, "unknown_items": 0}
    try:
        match_id = int(match.get("match_id") or public_row["match_id"])
        duration = int(match.get("duration") or public_row.get("duration") or 0)
    except (TypeError, ValueError):
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
        final_items: list[str] = []
        for field in FINAL_ITEM_FIELDS:
            try:
                numeric = int(player.get(field) or 0)
            except (TypeError, ValueError):
                numeric = 0
            if not numeric:
                continue
            item = item_ids.get(numeric)
            if not item:
                counters["unknown_items"] += 1
                continue
            final_items.append(_canonical_item_id(item))
        is_radiant = slot < 128
        won = radiant_win if is_radiant else not radiant_win
        result.append(
            {
                "m": match_id,
                "d": date,
                "p": patch,
                "l": "OpenDota 高分公开局",
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
                "f": final_items,
                "ft": duration,
                "src": "opendota",
            }
        )
        counters["players"] += 1
    return result, counters


def main() -> int:
    args = parse_args()
    if args.matches < 0 or args.workers < 1 or args.max_pages < 1:
        raise SystemExit("--matches must be >= 0; --workers and --max-pages must be >= 1")
    payload = _load_existing(args.out)
    existing_records = payload.get("records") or []
    existing_meta = payload.get("meta") or {}
    if existing_records:
        requested_cohort = {
            "min_rank": args.min_rank,
            "max_rank": args.max_rank,
            "min_duration": args.min_duration,
        }
        changed = {
            key: (existing_meta.get(key), value)
            for key, value in requested_cohort.items()
            if existing_meta.get(key) != value
        }
        if changed:
            details = ", ".join(
                f"{key}: existing={old!r}, requested={new!r}"
                for key, (old, new) in changed.items()
            )
            raise SystemExit(
                "Refusing to mix different public cohorts in one file ("
                f"{details}). Use a different --out file or remove the old sample intentionally."
            )
    for row in existing_records:
        if isinstance(row.get("f"), list):
            row["f"] = [_canonical_item_id(str(item)) for item in row["f"]]
    existing_keys = {
        (int(row["m"]), int(row["sl"]))
        for row in existing_records
        if row.get("m") is not None and row.get("sl") is not None
    }
    existing_matches = {match_id for match_id, _slot in existing_keys}
    item_ids = _load_item_ids()
    hero_ids = _load_hero_ids()
    patch_names = _load_patch_names(args.request_gap)

    candidates: list[dict] = []
    seen_matches = set(existing_matches)
    cursor: int | None = None
    pages_scanned = 0
    while len(candidates) < args.matches and pages_scanned < args.max_pages:
        query: dict[str, int] = {"min_rank": args.min_rank}
        if args.max_rank is not None:
            query["max_rank"] = args.max_rank
        if cursor is not None:
            query["less_than_match_id"] = cursor
        page = _api_json("/publicMatches", query, args.request_gap)
        pages_scanned += 1
        if not isinstance(page, list) or not page:
            break
        page_ids: list[int] = []
        for row in page:
            if not isinstance(row, dict):
                continue
            try:
                match_id = int(row["match_id"])
                duration = int(row.get("duration") or 0)
            except (KeyError, TypeError, ValueError):
                continue
            page_ids.append(match_id)
            if match_id in seen_matches or duration < args.min_duration:
                continue
            seen_matches.add(match_id)
            candidates.append(row)
            if len(candidates) >= args.matches:
                break
        if not page_ids:
            break
        next_cursor = min(page_ids)
        if cursor is not None and next_cursor >= cursor:
            break
        cursor = next_cursor

    failures: list[dict] = []
    details: list[tuple[dict, dict, bool]] = []
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        future_rows = {
            executor.submit(_load_match, int(row["match_id"]), args.request_gap): row
            for row in candidates
        }
        for completed, future in enumerate(as_completed(future_rows), start=1):
            row = future_rows[future]
            try:
                match, cached = future.result()
                details.append((match, row, cached))
            except Exception as exc:  # keep the rest of an incremental batch
                failures.append({"match_id": int(row["match_id"]), "error": str(exc)[:240]})
            if completed % 25 == 0 or completed == len(future_rows):
                print(f"  OpenDota match details: {completed}/{len(future_rows)}")

    added_records: list[dict] = []
    aggregate = {"players": 0, "leavers": 0, "unknown_heroes": 0, "unknown_items": 0}
    cached_matches = 0
    accepted_matches = 0
    for match, public_row, cached in details:
        rows, counters = _normalise_match(
            match, public_row, hero_ids, item_ids, patch_names
        )
        if rows:
            accepted_matches += 1
            cached_matches += int(cached)
        for key, value in counters.items():
            aggregate[key] += value
        for row in rows:
            key = (int(row["m"]), int(row["sl"]))
            if key not in existing_keys:
                existing_keys.add(key)
                added_records.append(row)

    records = existing_records + added_records
    records.sort(key=lambda row: (str(row.get("d") or ""), int(row.get("m") or 0), int(row.get("sl") or 0)))
    dates = [str(row.get("d") or "") for row in records if row.get("d")]
    match_ids = {int(row["m"]) for row in records if row.get("m") is not None}
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    meta = {
        "source": "OpenDota /publicMatches + /matches/{match_id}",
        "source_kind": "random_public_sample",
        "sampled": True,
        "cohort": _rank_label(args.min_rank, args.max_rank),
        "min_rank": args.min_rank,
        "max_rank": args.max_rank,
        "min_duration": args.min_duration,
        "final_inventory_fields": list(FINAL_ITEM_FIELDS),
        "includes_backpack": False,
        "includes_neutral_items": False,
        "position_available": False,
        "matches": len(match_ids),
        "records": len(records),
        "date_min": min(dates) if dates else "",
        "date_max": max(dates) if dates else "",
        "generated_at": generated_at,
        "last_update": {
            "requested_matches": args.matches,
            "pages_scanned": pages_scanned,
            "candidate_matches": len(candidates),
            "accepted_matches": accepted_matches,
            "cached_matches": cached_matches,
            "network_matches": max(0, accepted_matches - cached_matches),
            "added_player_games": len(added_records),
            "excluded_leavers": aggregate["leavers"],
            "unknown_heroes": aggregate["unknown_heroes"],
            "unknown_item_slots": aggregate["unknown_items"],
            "failed_matches": failures,
        },
    }
    output = {"schema": "opendota-public-items-v1", "meta": meta, "records": records}
    _atomic_write_json(args.out, output)
    print(
        f"OpenDota public item sample: +{accepted_matches:,} matches / "
        f"+{len(added_records):,} player-games; total {len(match_ids):,} matches / "
        f"{len(records):,} player-games -> {args.out}"
    )
    if failures:
        print(f"  {len(failures)} match request(s) failed; rerun to fill them later")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
