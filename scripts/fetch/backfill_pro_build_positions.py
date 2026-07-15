"""Recompute cached Dota positions for leagues present in one date slice.

Only the league/team/player position fields are changed.  Each selected league
is recomputed from its complete ``dwd_match_player_positions`` history using
five-minute hits and DWD lanes.  Missing participants/hits use bounded
``players`` plus ten-minute ``player_intervals2``; OpenDota lanes are adopted
only when they recover a strict 2-1-2 aggregate.  Slot is only a join key.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from scripts.fetch.fetch_pro_builds import ROOT, _connect, _load_positions


DEFAULT_CORE = ROOT / "data" / "pro_builds.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core", type=Path, default=DEFAULT_CORE)
    parser.add_argument("--date-from", required=True)
    parser.add_argument("--date-to", required=True)
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
    payload = json.loads(args.core.read_text(encoding="utf-8"))
    selected = [
        row for row in payload.get("records") or []
        if args.date_from <= str(row.get("d") or "") <= args.date_to
        and int(row.get("li") or 0) > 0
    ]
    if not selected:
        raise SystemExit("No cached league player-games matched the bounded date selection")

    league_by_match = {
        int(row["m"]): int(row["li"])
        for row in selected
    }
    partition_date_by_match = {
        int(row["m"]): str(row["d"])
        for row in selected
    }
    scoped_players_by_match = defaultdict(set)
    for row in selected:
        if row.get("s"):
            scoped_players_by_match[int(row["m"])].add(str(row["s"]))
    connection = _connect()
    try:
        with connection.cursor() as cursor:
            roles, roles_by_player, source_stats = _load_positions(
                cursor, league_by_match, partition_date_by_match,
                scoped_players_by_match,
            )
    finally:
        connection.close()

    before = Counter(str(row.get("rm") or "none") for row in selected)
    changed = 0
    assigned = 0
    for row in selected:
        league_id = int(row.get("li") or 0)
        steam = str(row.get("s") or "")
        # The compact cache intentionally stores a display tag, not an
        # organization ID.  Use the safe league+player projection returned by
        # the source computation; ambiguous multi-team players stay unknown.
        role = roles_by_player.get((league_id, steam))
        values = (
            role.get("position") if role else None,
            role.get("method") if role else None,
            role.get("confidence") if role else None,
        )
        old = (row.get("r"), row.get("rm"), row.get("rc"))
        if old != values:
            changed += 1
        row["r"], row["rm"], row["rc"] = values
        assigned += int(values[0] is not None)

    after = Counter(str(row.get("rm") or "none") for row in selected)
    meta = payload.setdefault("meta", {})
    positions = meta.setdefault("positions", {})
    positions.update(
        {
            "assigned_player_games": sum(
                row.get("r") is not None for row in payload.get("records") or []
            ),
            "lane_method_player_games": sum(
                str(row.get("rm") or "").startswith("lanes")
                for row in payload.get("records") or []
            ),
            "opendota_lane_player_games": sum(
                row.get("rm") == "lanes_opendota"
                for row in payload.get("records") or []
            ),
            "hits_fallback_player_games": sum(
                row.get("rm") == "hits" for row in payload.get("records") or []
            ),
            "source_stats": source_stats,
            "bounded_backfill": {
                "completed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "date_from": args.date_from,
                "date_to": args.date_to,
                "player_games": len(selected),
                "changed_player_games": changed,
                "assigned_player_games": assigned,
                "before_methods": dict(before),
                "after_methods": dict(after),
            },
        }
    )
    meta["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    atomic_write_json(args.core, payload)
    print(
        f"Position backfill changed {changed}/{len(selected)} player-games; "
        f"assigned {assigned}; methods {dict(before)} -> {dict(after)}; "
        f"DWD rows {source_stats['dwd']['player_rows']}; "
        f"OpenDota recovered {source_stats['opendota']['recovered_212_teams']} teams"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
