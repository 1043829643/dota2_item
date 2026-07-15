from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.fetch.backfill_pro_build_item_uses import (
    atomic_write_json,
    build_item_use_query,
    mark_scanned,
    merge_first_use,
    selected_rows,
    update_metadata,
)


VALID_ITEMS = {"item_blink", "item_black_king_bar", "item_echo_sabre"}


def player_row(
    match_id: int = 100,
    hero: str = "sven",
    day: str = "2026-07-01",
) -> dict:
    return {
        "m": match_id,
        "d": day,
        "h": hero,
        "i": [
            ["item_echo_sabre", 200],
            ["item_blink", 100],
            ["item_black_king_bar", None],
        ],
        "u": None,
    }


class ProBuildItemUseBackfillTests(unittest.TestCase):
    def test_selection_defaults_to_all_and_supports_optional_bounds(self):
        rows = [
            player_row(1, "sven", "2026-06-30"),
            player_row(2, "axe", "2026-07-01"),
            player_row(3, "sven", "2026-07-02"),
        ]
        payload = {"records": rows}
        self.assertEqual(selected_rows(payload), rows)
        self.assertEqual(
            [row["m"] for row in selected_rows(payload, "npc_dota_hero_sven")],
            [1, 3],
        )
        self.assertEqual(
            [
                row["m"]
                for row in selected_rows(
                    payload, date_from="2026-07-01", date_to="2026-07-01"
                )
            ],
            [2],
        )

    def test_merge_is_validated_deduplicated_sorted_and_idempotent(self):
        row = player_row()
        self.assertFalse(merge_first_use(row, "item_blink", 120, VALID_ITEMS))
        mark_scanned(row)
        self.assertTrue(merge_first_use(row, "item_echo_sabre", 230, VALID_ITEMS))
        self.assertTrue(merge_first_use(row, "item_blink", 140, VALID_ITEMS))
        self.assertFalse(merge_first_use(row, "item_blink", 160, VALID_ITEMS))
        self.assertFalse(merge_first_use(row, "item_blink", 140, VALID_ITEMS))
        self.assertTrue(merge_first_use(row, "item_blink", 130, VALID_ITEMS))
        self.assertEqual(
            row["u"],
            [["item_blink", 130], ["item_echo_sabre", 230]],
        )

    def test_merge_rejects_unknown_missing_untimed_and_pre_purchase_items(self):
        row = player_row()
        mark_scanned(row)
        self.assertFalse(merge_first_use(row, "item_unknown", 300, VALID_ITEMS))
        self.assertFalse(merge_first_use(row, "item_black_king_bar", 300, VALID_ITEMS))
        self.assertFalse(merge_first_use(row, "item_echo_sabre", 199, VALID_ITEMS))
        self.assertFalse(merge_first_use(row, "item_echo_sabre", None, VALID_ITEMS))
        # A pre-purchase event must not hide a later valid first use.
        self.assertTrue(merge_first_use(row, "item_echo_sabre", 220, VALID_ITEMS))
        self.assertFalse(merge_first_use(row, "item_blink", True, VALID_ITEMS))
        self.assertEqual(row["u"], [["item_echo_sabre", 220]])

    def test_query_is_exact_partition_bounded_and_raw(self):
        query = build_item_use_query("2026-07-01", [22, 11, 22])
        self.assertIn("dt = '2026-07-01'", query)
        self.assertIn("match_id IN ('11','22')", query)
        self.assertIn("SELECT match_id, time, log_index, type", query)
        self.assertNotIn("ROW_NUMBER", query)
        self.assertIn("type = 'DOTA_COMBATLOG_ITEM'", query)
        self.assertNotIn("DOTA_COMBATLOG_MODIFIER_ADD", query)
        self.assertNotIn("MIN(GREATEST", query)
        self.assertNotIn("GROUP BY", query)
        self.assertNotIn("SELECT *", query.upper())
        filtered = build_item_use_query(
            "2026-07-01", [11], {"item_blink", "item_echo_sabre"}
        )
        self.assertIn(
            "inflictor IN ('item_blink','item_echo_sabre')", filtered
        )
        with self.assertRaisesRegex(ValueError, "exact dt"):
            build_item_use_query("2026-07-01' OR 1=1", [11])
        with self.assertRaisesRegex(ValueError, "bounded match-ID"):
            build_item_use_query("2026-07-01", [])

    def test_metadata_counts_preserve_null_vs_empty_provenance(self):
        unknown = player_row(1)
        scanned_empty = player_row(2)
        scanned_empty["u"] = []
        populated = player_row(3)
        populated["u"] = [["item_blink", 130]]
        payload = {
            "meta": {"advanced": {}},
            "records": [unknown, scanned_empty, populated],
        }
        backfill = update_metadata(
            payload,
            selected=[unknown, scanned_empty, populated],
            hero=None,
            date_from=None,
            date_to=None,
            source_match_ids={2, 3},
            query_batches=1,
            source_rows=2,
        )
        advanced = payload["meta"]["advanced"]
        self.assertEqual(advanced["item_use_source_matches"], 2)
        self.assertEqual(advanced["item_use_source_player_games"], 2)
        self.assertEqual(advanced["item_use_matches"], 1)
        self.assertEqual(advanced["item_use_player_games"], 1)
        self.assertEqual(advanced["item_use_records"], 1)
        self.assertEqual(backfill["unscanned_matches"], 1)
        self.assertIn("exact dt partition", backfill["query_contract"])
        self.assertIn("missing_semantics", backfill["provenance"])

    def test_atomic_write_replaces_json_without_leaving_temp_files(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "core.json"
            path.write_text('{"old":true}', encoding="utf-8")
            atomic_write_json(path, {"new": [1, 2, 3]})
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"new": [1, 2, 3]})
            self.assertEqual(list(Path(directory).glob(".core.json.*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
