"""Backfill missing professional skill routes from exact OpenDota matches."""

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
    _load_ability_ids,
    _load_opendota_match,
    _parse_opendota_ability_route,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core", type=Path, default=ROOT / "data" / "pro_builds.json")
    parser.add_argument("--detail", type=Path, default=ROOT / "data" / "pro_builds_detail.json")
    parser.add_argument("--date-from", required=True)
    parser.add_argument("--date-to", required=True)
    parser.add_argument("--hero", help="Optional canonical hero slug")
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
        if args.date_from <= str(row.get("d") or "") <= args.date_to
        and (not args.hero or str(row.get("h") or "") == args.hero)
    ]
    missing_by_match = defaultdict(list)
    for row in selected:
        key = f"{int(row['m'])}:{int(row['sl'])}"
        player = players.setdefault(key, {"q": [], "a": [], "iv": [], "dm": []})
        if not player.get("a"):
            missing_by_match[int(row["m"])].append((key, row))

    ability_ids = _load_ability_ids()
    updated = 0
    events = 0
    failed_matches = []
    for match_id, rows in sorted(missing_by_match.items()):
        try:
            match = _load_opendota_match(match_id)
        except (OSError, ValueError, json.JSONDecodeError):
            failed_matches.append(match_id)
            continue
        for key, row in rows:
            route = _parse_opendota_ability_route(
                match, int(row.get("hi") or 0), ability_ids
            )
            if not route:
                continue
            players[key]["a"] = route
            players[key]["a_src"] = "opendota"
            updated += 1
            events += len(route)

    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    detail_meta = detail.setdefault("meta", {})
    detail_meta.update(
        {
            "generated_at": generated_at,
            "players": len(players),
            "ability_events": sum(len((value or {}).get("a") or []) for value in players.values()),
            "ability_player_games": sum(bool((value or {}).get("a")) for value in players.values()),
            "opendota_ability_player_games": sum(
                (value or {}).get("a_src") == "opendota" for value in players.values()
            ),
        }
    )
    advanced = core.setdefault("meta", {}).setdefault("advanced", {})
    advanced["ability_events"] = detail_meta["ability_events"]
    advanced["ability_player_games"] = detail_meta["ability_player_games"]
    advanced["opendota_ability_player_games"] = detail_meta["opendota_ability_player_games"]
    advanced["bounded_skill_backfill"] = {
        "completed_at": generated_at,
        "hero": args.hero or "all",
        "date_from": args.date_from,
        "date_to": args.date_to,
        "selected_player_games": len(selected),
        "missing_before": sum(len(rows) for rows in missing_by_match.values()),
        "updated_player_games": updated,
        "ability_events_added": events,
        "failed_match_ids": failed_matches,
        "source": "OpenDota ability_upgrades_arr; StarRocks rows preserved",
    }
    core["meta"]["generated_at"] = generated_at
    atomic_write_json(args.detail, detail)
    atomic_write_json(args.core, core)
    print(
        f"Skill backfill added {events} level-ups to {updated}/{len(selected)} "
        f"player-games; failed matches {len(failed_matches)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
