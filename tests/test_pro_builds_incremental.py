from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

from scripts.fetch.update_pro_builds import (
    UpdateLock,
    begin_commit,
    date_windows,
    merge_payloads,
    read_json,
    rollback,
    validate_payloads,
)
from scripts.fetch.fetch_pro_builds import _display_path


ROOT = Path(__file__).resolve().parents[1]
UPDATER = ROOT / "scripts" / "fetch" / "update_pro_builds.py"


def record(match_id: int, slot: int, day: str, hero: str, networth: int) -> dict:
    item_uses = None if slot == 8 else [] if slot == 9 else [["item_blink", 930]]
    return {
        "m": match_id, "d": day, "p": "7.41", "li": 99, "l": "Fixture League",
        "t": "Fixture Team", "s": str(1000 + slot), "n": f"Player {slot}",
        "h": hero, "hi": slot + 1, "sl": slot, "tm": 2 if slot < 5 else 3,
        "r": slot % 5 + 1, "rm": "lanes", "rc": 0.9, "w": 1,
        "lv": 20, "nw": networth, "du": 1800,
        "i": [["item_blink", 900]], "g": [15, networth // 2, 100, 2, 1, 5, 1000],
        "u": item_uses,
    }


def match_rows(match_id: int, day: str, hero: str, networth: int) -> list[dict]:
    return [record(match_id, slot, day, hero if slot == 0 else f"fixture_hero_{slot}", networth + slot) for slot in range(10)]


def payloads(rows: list[dict], marker: str) -> tuple[dict, dict]:
    match_ids = {row["m"] for row in rows}
    core = {
        "meta": {
            "generated_at": "2026-07-01T00:00:00+00:00", "source": marker,
            "matches": len(match_ids), "player_games": len(rows),
            "date_min": min(row["d"] for row in rows), "date_max": max(row["d"] for row in rows),
            "positions": {}, "advanced": {},
        },
        "records": rows,
    }
    players = {f"{row['m']}:{row['sl']}": {"q": [[900, 15, row["nw"], 100, 2, 1, 5, 0, 0, 1000]], "a": [[60, "axe_berserkers_call", 1]]} for row in rows}
    detail = {
        "meta": {"generated_at": core["meta"]["generated_at"], "players": len(players), "draft_matches": len(match_ids), "event_matches": len(match_ids)},
        "players": players,
        "drafts": {str(match_id): {"p": [[0, 2, 2, "axe"]], "b": []} for match_id in match_ids},
        "events": {str(match_id): [[120, "d", "axe", "lion", "", ""]] for match_id in match_ids},
    }
    return core, detail


def write(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


class IncrementalUpdateTests(unittest.TestCase):
    def test_merge_replaces_complete_matches_and_adds_new_matches(self):
        old_core, old_detail = payloads(match_rows(1, "2026-07-01", "axe", 10000) + match_rows(3, "2026-07-01", "lion", 8000), "old")
        new_core, new_detail = payloads(match_rows(1, "2026-07-01", "axe", 13000) + match_rows(2, "2026-07-02", "mars", 11000), "new")
        core, detail, result = merge_payloads(old_core, old_detail, new_core, new_detail, date_from="2026-07-01", date_to="2026-07-02")
        self.assertEqual(result["new_matches"], 1)
        self.assertEqual(result["refreshed_matches"], 1)
        self.assertEqual(result["matches"], 3)
        self.assertEqual(next(row for row in core["records"] if row["m"] == 1 and row["sl"] == 0)["nw"], 13000)
        self.assertEqual(next(row for row in core["records"] if row["m"] == 1 and row["sl"] == 0)["u"], [["item_blink", 930]])
        self.assertEqual(next(row for row in core["records"] if row["m"] == 3 and row["sl"] == 0)["u"], [["item_blink", 930]])
        self.assertIsNone(next(row for row in core["records"] if row["m"] == 1 and row["sl"] == 8)["u"])
        self.assertEqual(next(row for row in core["records"] if row["m"] == 1 and row["sl"] == 9)["u"], [])
        self.assertEqual(detail["players"]["1:0"]["q"][0][2], 13000)
        self.assertEqual({row["m"] for row in core["records"]}, {1, 2, 3})
        validate_payloads(core, detail)

    def test_recovery_rollback_restores_both_files(self):
        with tempfile.TemporaryDirectory() as directory:
            tmp_path = Path(directory)
            old_core, old_detail = payloads(match_rows(1, "2026-07-01", "axe", 10000), "old")
            new_core, new_detail = payloads(match_rows(2, "2026-07-02", "mars", 11000), "new")
            core_path, detail_path, journal = tmp_path / "core.json", tmp_path / "detail.json", tmp_path / "journal.json"
            write(core_path, old_core)
            write(detail_path, old_detail)
            with self.assertRaisesRegex(RuntimeError, "simulated failure"):
                begin_commit(core_path, detail_path, journal, new_core, new_detail, fail_after_core=True)
            rollback(core_path, detail_path, journal, "test failure")
            self.assertEqual(read_json(core_path), old_core)
            self.assertEqual(read_json(detail_path), old_detail)
            self.assertEqual(read_json(journal)["status"], "rolled_back")

    def test_windows_are_strictly_bounded(self):
        windows = list(date_windows(date(2026, 6, 1), date(2026, 6, 19), max_days=7))
        self.assertEqual(windows, [
            (date(2026, 6, 1), date(2026, 6, 7)),
            (date(2026, 6, 8), date(2026, 6, 14)),
            (date(2026, 6, 15), date(2026, 6, 19)),
        ])

    def test_rejects_incomplete_or_out_of_window_snapshots(self):
        old_core, old_detail = payloads(match_rows(1, "2026-07-01", "axe", 10000), "old")
        short_core, short_detail = payloads(match_rows(2, "2026-07-02", "mars", 11000)[:8], "short")
        with self.assertRaisesRegex(ValueError, "incomplete"):
            merge_payloads(old_core, old_detail, short_core, short_detail, date_from="2026-07-02", date_to="2026-07-02")
        future_core, future_detail = payloads(match_rows(2, "2026-07-03", "mars", 11000), "future")
        with self.assertRaisesRegex(ValueError, "outside bounded window"):
            merge_payloads(old_core, old_detail, future_core, future_detail, date_from="2026-07-02", date_to="2026-07-02")
        untimed_rows = match_rows(2, "2026-07-02", "mars", 11000)
        for row in untimed_rows:
            row["i"] = [["item_blink", None]]
        untimed_core, untimed_detail = payloads(untimed_rows, "untimed")
        with self.assertRaisesRegex(ValueError, "purchase timing coverage"):
            merge_payloads(old_core, old_detail, untimed_core, untimed_detail, date_from="2026-07-02", date_to="2026-07-02")

    def test_concurrent_update_lock_is_exclusive(self):
        with tempfile.TemporaryDirectory() as directory:
            lock_path = Path(directory) / "update.lock"
            with UpdateLock(lock_path):
                with self.assertRaisesRegex(RuntimeError, "another professional-build update"):
                    with UpdateLock(lock_path):
                        pass
            self.assertFalse(lock_path.exists())

    def test_extractor_can_report_staging_paths_outside_workspace(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.json"
            self.assertEqual(_display_path(path), str(path))

    def test_cli_fixture_update_is_end_to_end(self):
        with tempfile.TemporaryDirectory() as directory:
            tmp_path = Path(directory)
            old_core, old_detail = payloads(match_rows(1, "2026-07-01", "axe", 10000), "old")
            incoming_core, incoming_detail = payloads(match_rows(2, "2026-07-02", "mars", 11000), "incoming")
            paths = {name: tmp_path / f"{name}.json" for name in ("core", "detail", "incoming_core", "incoming_detail", "status", "journal")}
            for path, value in ((paths["core"], old_core), (paths["detail"], old_detail), (paths["incoming_core"], incoming_core), (paths["incoming_detail"], incoming_detail)):
                write(path, value)
            result = subprocess.run(
                [
                    sys.executable, str(UPDATER), "--core", str(paths["core"]),
                    "--detail", str(paths["detail"]), "--status", str(paths["status"]),
                    "--journal", str(paths["journal"]), "--incoming-core", str(paths["incoming_core"]),
                    "--incoming-detail", str(paths["incoming_detail"]), "--date-from", "2026-07-02",
                    "--date-to", "2026-07-02", "--skip-build",
                ],
                cwd=ROOT, text=True, capture_output=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            core, detail, status = read_json(paths["core"]), read_json(paths["detail"]), read_json(paths["status"])
            self.assertEqual({row["m"] for row in core["records"]}, {1, 2})
            new_player = next(row for row in core["records"] if row["m"] == 2 and row["sl"] == 0)
            self.assertEqual((new_player["h"], new_player["n"], new_player["p"]), ("mars", "Player 0", "7.41"))
            self.assertEqual(new_player["i"], [["item_blink", 900]])
            self.assertEqual(new_player["u"], [["item_blink", 930]])
            self.assertIn("2:0", detail["players"])
            self.assertTrue(detail["players"]["2:0"]["q"])
            self.assertIn("2", detail["drafts"])
            self.assertIn("2", detail["events"])
            self.assertEqual(status["status"], "success")
            self.assertEqual(status["quality_gate"], "skipped")
            self.assertEqual(status["new_matches"], 1)

    def test_cli_quality_failure_keeps_last_good_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            tmp_path = Path(directory)
            old_core, old_detail = payloads(match_rows(1, "2026-07-01", "axe", 10000), "old")
            bad_rows = match_rows(2, "2026-07-02", "mars", 11000)
            for row in bad_rows:
                row["i"] = [["item_blink", None]]
            incoming_core, incoming_detail = payloads(bad_rows, "bad")
            paths = {name: tmp_path / f"{name}.json" for name in ("core", "detail", "incoming_core", "incoming_detail", "status", "journal")}
            for path, value in ((paths["core"], old_core), (paths["detail"], old_detail), (paths["incoming_core"], incoming_core), (paths["incoming_detail"], incoming_detail)):
                write(path, value)
            result = subprocess.run(
                [
                    sys.executable, str(UPDATER), "--core", str(paths["core"]),
                    "--detail", str(paths["detail"]), "--status", str(paths["status"]),
                    "--journal", str(paths["journal"]), "--incoming-core", str(paths["incoming_core"]),
                    "--incoming-detail", str(paths["incoming_detail"]), "--date-from", "2026-07-02",
                    "--date-to", "2026-07-02", "--skip-build",
                ],
                cwd=ROOT, text=True, capture_output=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(read_json(paths["core"]), old_core)
            self.assertEqual(read_json(paths["detail"]), old_detail)
            status = read_json(paths["status"])
            self.assertEqual(status["status"], "failed")
            self.assertIn("purchase timing coverage", status["error"])


if __name__ == "__main__":
    unittest.main()
