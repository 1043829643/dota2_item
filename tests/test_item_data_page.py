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
    assert "只研究比赛结束时的最终六格装备组合" in html
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
    assert "OpenDota 随机公开样本" in html
    assert "state.datasets" in script
    assert "position_available" not in script  # page trusts source mode, not a lane-role shortcut
    assert "row.src === 'opendota'" in script


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
    assert "item.completed === true" in script
    assert "Number(item.cost || 0) > comboMinCost" in script
    assert "row.f.map(canonicalFinalItemId).filter(comboEligible)" in script
    assert "['item_dagon_5', 'item_dagon']" in script
    assert "['item_travel_boots_2', 'item_travel_boots']" in script
    assert "['item_caster_rapier', 'item_rapier']" in script
    assert "const comboIds = comboItems(row)" in script
    assert "function addCombinations" in script
    assert "sixes: 6" in script
