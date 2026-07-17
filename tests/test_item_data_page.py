from __future__ import annotations

import json
import re
from pathlib import Path

from builders.item_data import render_html
from builders.site_common import render_materials_subnav


ROOT = Path(__file__).resolve().parents[1]


def test_item_data_page_has_explicit_three_step_flow() -> None:
    html = render_html()
    assert "装备大数据" in html
    assert "先选择数据源，再生成装备结论" in html
    assert 'id="id-hero-search"' in html
    assert 'id="id-generate"' in html
    assert "选择不会触发跳转" in html


def test_item_data_page_focuses_only_on_final_inventory_combinations() -> None:
    html = render_html()
    assert 'data-id-tab="single"' in html
    assert 'data-id-tab="pairs"' in html
    assert 'data-id-tab="trios"' in html
    assert 'data-id-tab="fours"' in html
    assert 'data-id-tab="fives"' in html
    assert 'data-id-tab="sixes"' in html
    assert 'data-id-tab="timing"' not in html
    assert "九格装备池" in html
    assert "主栏6＋背包3" in html
    assert "不使用购买路线替代" in html
    assert "相对未持有" in html


def test_item_data_dynamic_targets_are_unique() -> None:
    html = render_html()
    ids = re.findall(r'\bid="([^"]+)"', html)
    assert len(ids) == len(set(ids))


def test_item_data_is_a_separate_materials_destination() -> None:
    subnav = render_materials_subnav("item_data")
    assert 'href="item_data.html"' in subnav
    assert '>Item Data</a>' in subnav
    assert 'href="pro_builds.html"' in subnav


def test_item_data_keeps_pro_and_public_sources_separate() -> None:
    html = render_html()
    script = (ROOT / "src" / "scripts.js").read_text(encoding="utf-8")
    assert 'data-id-source="pro"' in html
    assert 'data-id-source="public"' in html
    assert '"publicDataUrl":"data/opendota_public_items.json"' in html
    assert "OpenDota 高端天梯" in html
    assert "state.datasets" in script
    assert "opendota-public-items-manifest-v3" in script
    assert "opendota-public-items-manifest-v4" in script
    assert "opendota-public-hero-v3" in script
    assert "opendota-public-hero-v4" in script
    assert "loadPublicHero" in script
    assert "position_available" not in script  # page trusts source mode, not a lane-role shortcut
    assert "row.src === 'opendota'" in script


def test_public_rank_cohort_filter_is_explicit_and_persistent() -> None:
    html = render_html()
    script = (ROOT / "src" / "scripts.js").read_text(encoding="utf-8")
    assert 'id="id-public-cohort-wrap"' in html
    assert 'id="id-public-cohort"' in html
    assert 'value="pure_immortal"' in html
    assert 'value="immortal_divine"' in html
    assert "params.get('cohort')" in script
    assert "row[10]" in script
    assert "row[11]" in script
    assert "'pure_immortal'" in script
    assert "'immortal_divine'" in script
    assert "row.c === controls.cohort.value" in script
    assert "summary?.cohorts?.[cohort]" in script
    assert "url.searchParams.set('cohort', controls.cohort.value)" in script
    assert "document.getElementById('id-public-cohort-wrap').hidden = !isPublic" in script
    assert "剔除混合段位" not in script


def test_public_v4_decoder_combines_nine_slots_but_keeps_v3_compatible() -> None:
    script = (ROOT / "src" / "scripts.js").read_text(encoding="utf-8")
    assert "opendota-public-hero-v3" in script
    assert "opendota-public-hero-v4" in script
    assert "rawMain" in script
    assert "rawBackpack" in script
    assert "fi:" in script
    assert "row[9]" in script
    assert "row[10]" in script
    assert "row[11]" in script
    assert "const cohortCode = v4 ? row[11] : row[10]" in script
    assert "const rawBackpack = v4 ? decodeSlots(row[10], 3) : Array(3).fill('')" in script
    assert "fi: [...main, ...backpack]" in script
    # Empty slots are represented by -1 in v4 and must not become item IDs.
    assert "index < 0" in script


def test_evidence_renders_raw_main_six_and_backpack_three_separately() -> None:
    html = render_html()
    script = (ROOT / "src" / "scripts.js").read_text(encoding="utf-8")
    assert "逐局终局" in html
    assert "主栏6" in html
    assert "背包3" in html
    assert "id-inventory-slots" in script
    assert "id-inventory-main" in script
    assert "id-inventory-backpack" in script
    render_evidence = re.search(
        r"function renderEvidence\(rows\) \{(.*?)\n  \}", script, re.S
    )
    assert render_evidence is not None
    evidence_source = render_evidence.group(1)
    assert "rawMain" in evidence_source
    assert "rawBackpack" in evidence_source
    assert "const publicInventory" in evidence_source
    assert "? publicInventory" in evidence_source
    # Professional evidence keeps its existing scoped six-slot rendering;
    # only the public v4 branch is the raw, unfiltered 6+3 slot view.
    assert "const proInventory = finalItems(" in evidence_source


def test_final_combinations_use_completed_items_and_strict_cost_threshold() -> None:
    html = render_html()
    script = (ROOT / "src" / "scripts.js").read_text(encoding="utf-8")
    config_text = re.search(
        r'<script id="item-data-config" type="application/json">(.*?)</script>', html
    )
    assert config_text is not None
    items = json.loads(config_text.group(1))["items"]
    assert '"comboMinCost":1020' in html
    assert 'id="id-cost-catalog-list"' in html
    assert "ItemCost &gt; 1020" in html
    assert items["item_black_king_bar"]["completed"] is True
    assert items["item_blink"]["completed"] is True
    assert items["item_ghost"]["completed"] is True
    assert items["item_claymore"]["completed"] is False
    assert items["item_platemail"]["completed"] is False
    assert items["item_mystic_staff"]["completed"] is False
    assert items["item_reaver"]["completed"] is False
    assert items["item_aghanims_shard"]["completed"] is False
    assert items["item_ultimate_scepter_2"]["completed"] is False
    assert "rule.completed" in script
    assert "rule.cost > comboMinCost" in script
    assert "finalInventory(row)" in script
    assert "comboEligible(id, row)" in script
    assert "['item_dagon_5', 'item_dagon']" in script
    assert "['item_travel_boots_2', 'item_travel_boots']" in script
    assert "['item_caster_rapier', 'item_rapier']" in script
    assert "const comboIds = comboItems(row)" in script
    assert "function addCombinations" in script
    assert "sixes: 6" in script
    combo_items = re.search(r"function comboItems\(row\) \{(.*?)\n  \}", script, re.S)
    assert combo_items is not None
    # Slot multiplicity is meaningful (for example two Divine Rapiers), while
    # identical index choices from one player must still count only once.
    assert "new Set" not in combo_items.group(1)
    add_combinations = re.search(
        r"function addCombinations\(map, ids, size, row\) \{(.*?)\n  \}",
        script,
        re.S,
    )
    assert add_combinations is not None
    assert "seen" in add_combinations.group(1)


def test_item_rules_follow_each_match_effective_patch() -> None:
    html = render_html()
    script = (ROOT / "src" / "scripts.js").read_text(encoding="utf-8")
    config_text = re.search(
        r'<script id="item-data-config" type="application/json">(.*?)</script>', html
    )
    assert config_text is not None
    config = json.loads(config_text.group(1))
    rules = config["itemRulesByPatch"]
    timeline = config["patchTimeline"]
    assert rules
    assert "7.41" in timeline
    assert timeline["7.41"] == sorted(timeline["7.41"], key=lambda row: row[0])
    assert any(effective == "7.41d" for _, effective in timeline["7.41"])
    assert "7.41d" in rules
    assert all(
        isinstance(rule, list)
        and len(rule) == 2
        and isinstance(rule[0], (int, float))
        and rule[1] in {0, 1}
        for patch_rules in rules.values()
        for rule in patch_rules.values()
    )
    assert "itemRulesByPatch" in script
    assert "patchTimeline" in script
    assert "effectivePatch" in script
    assert "itemRule" in script
    assert "finalInventory" in script
    assert "comboEligible(id, row)" in script
    assert "effectivePatch(row)" in script
    assert "effectivePatch(row) === controls.patch.value" in script
