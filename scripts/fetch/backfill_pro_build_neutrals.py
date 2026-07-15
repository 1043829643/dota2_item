"""Backfill exact neutral-item and enchantment choices from OpenDota caches."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from scripts.fetch.fetch_pro_builds import (
    OPENDOTA_MATCH_CACHE,
    ROOT,
    _load_item_catalog,
    _load_opendota_match,
    _parse_opendota_neutral_choices,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core", type=Path, default=ROOT / "data" / "pro_builds.json")
    parser.add_argument("--detail", type=Path, default=ROOT / "data" / "pro_builds_detail.json")
    parser.add_argument("--date-from")
    parser.add_argument("--date-to")
    parser.add_argument("--hero", help="Optional canonical hero slug")
    parser.add_argument(
        "--fetch-missing",
        action="store_true",
        help="Fetch absent exact matches from OpenDota; default is cached-only.",
    )
    return parser.parse_args()


def atomic_write_json(path: Path, payload: dict) -> None:
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


def main() -> int:
    args = parse_args()
    core = json.loads(args.core.read_text(encoding="utf-8"))
    detail = json.loads(args.detail.read_text(encoding="utf-8"))
    players = detail.setdefault("players", {})
    selected = [
        row for row in core.get("records") or []
        if (not args.date_from or str(row.get("d") or "") >= args.date_from)
        and (not args.date_to or str(row.get("d") or "") <= args.date_to)
        and (not args.hero or str(row.get("h") or "") == args.hero)
    ]
    rows_by_match: dict[int, list[dict]] = {}
    for row in selected:
        rows_by_match.setdefault(int(row["m"]), []).append(row)

    catalog = _load_item_catalog()
    cached_matches = 0
    source_matches = 0
    updated_player_games = 0
    records_added = 0
    failed_matches: list[int] = []
    for match_id, rows in sorted(rows_by_match.items()):
        cache_path = OPENDOTA_MATCH_CACHE / f"{match_id}.json"
        if not cache_path.exists() and not args.fetch_missing:
            continue
        if cache_path.exists():
            cached_matches += 1
        try:
            match = _load_opendota_match(match_id)
        except (OSError, ValueError, json.JSONDecodeError):
            failed_matches.append(match_id)
            continue
        match_updated = False
        for row in rows:
            choices = _parse_opendota_neutral_choices(
                match, int(row.get("hi") or 0), catalog
            )
            if not choices:
                continue
            key = f"{match_id}:{int(row['sl'])}"
            player = players.setdefault(
                key, {"q": [], "a": [], "iv": [], "dm": [], "ni": []}
            )
            player["ni"] = choices
            player["ni_src"] = "opendota"
            updated_player_games += 1
            records_added += len(choices)
            match_updated = True
        source_matches += match_updated

    neutral_players = {
        key: value for key, value in players.items() if bool((value or {}).get("ni"))
    }
    neutral_matches = {int(key.split(":", 1)[0]) for key in neutral_players}
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    detail_meta = detail.setdefault("meta", {})
    detail_meta.update(
        {
            "generated_at": generated_at,
            "players": len(players),
            "neutral_history_matches": len(neutral_matches),
            "neutral_history_player_games": len(neutral_players),
            "neutral_history_records": sum(
                len((value or {}).get("ni") or []) for value in neutral_players.values()
            ),
        }
    )
    meta = core.setdefault("meta", {})
    advanced = meta.setdefault("advanced", {})
    advanced.update(
        {
            "neutral_history_matches": detail_meta["neutral_history_matches"],
            "neutral_history_player_games": detail_meta["neutral_history_player_games"],
            "neutral_history_records": detail_meta["neutral_history_records"],
            "neutral_history_backfill": {
                "completed_at": generated_at,
                "hero": args.hero or "all",
                "date_from": args.date_from or "all",
                "date_to": args.date_to or "all",
                "selected_matches": len(rows_by_match),
                "cached_matches": cached_matches,
                "matches_with_history": source_matches,
                "updated_player_games": updated_player_games,
                "records_added": records_added,
                "failed_match_ids": failed_matches,
                "source": "OpenDota neutral_item_history; latest valid choice per tier",
                "cached_only": not args.fetch_missing,
            },
        }
    )
    meta["generated_at"] = generated_at
    atomic_write_json(args.detail, detail)
    atomic_write_json(args.core, core)
    print(
        f"Neutral history backfill updated {updated_player_games:,} player-games / "
        f"{records_added:,} tier choices from {source_matches:,} matches; "
        f"{len(failed_matches)} failed"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
