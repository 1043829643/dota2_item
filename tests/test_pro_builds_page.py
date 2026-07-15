from __future__ import annotations

import re

import pytest

from builders.pro_builds import render_html


@pytest.fixture(scope="module")
def page_html() -> str:
    return render_html()


def test_hero_profile_shell_has_unique_dynamic_targets(page_html: str) -> None:
    targets = (
        "pb-profile",
        "pb-profile-portrait",
        "pb-profile-name",
        "pb-profile-summary",
        "pb-role-cards",
        "pb-profile-insights",
        "pb-pro-brief",
        "pb-brief-route",
        "pb-brief-timings",
        "pb-brief-pivots",
        "pb-brief-matches",
        "pb-research-drawer",
        "pb-research-step",
        "pb-research-summary",
        "pb-research-summary-note",
        "pb-start-data-note",
        "pb-hero-shortcuts",
        "pb-workspace-title",
        "pb-workspace-description",
        "pb-jump-matches",
        "pb-complete-build",
        "pb-lineup-decisions",
        "pb-performance-summary",
        "pb-economy-curve",
        "pb-damage-curve",
        "pb-matchup-plot",
        "pb-patch-meta",
        "pb-off-meta",
        "pb-match-search",
        "pb-match-summary",
        "pb-matches-head",
        "pb-matches-more",
    )
    for target in targets:
        assert page_html.count(f'id="{target}"') == 1


def test_role_cards_follow_dota_position_order(page_html: str) -> None:
    roles = re.findall(r'data-pb-role-card="([^"]*)"', page_html)
    assert roles == ["", "1", "2", "3", "4", "5"]
    assert page_html.count("data-pb-role-games") == 6
    assert page_html.count("data-pb-role-winrate") == 6


def test_analysis_tabs_keep_expected_flow_and_descriptions(page_html: str) -> None:
    tabs = re.findall(r'data-pb-tab="([^"]+)"', page_html)
    assert tabs == ["routes", "situations", "people", "matches", "quality"]
    assert "职业路线" in page_html
    assert "出装顺序、时点与装备速查" in page_html
    assert "逐局路线、阵容与比赛证据" in page_html
    assert "主线、关键时点与局势变化先回答“这局怎么出”" in page_html
    assert "核心出装时间线" in page_html


def test_research_flow_starts_with_a_primary_object(page_html: str) -> None:
    assert 'class="container pro-builds-page is-pb-unselected"' in page_html
    assert "第一步：选择研究对象" in page_html
    assert "英雄是默认入口，也可以切换到选手或战队" in page_html
    assert "设定英雄与比赛范围" in page_html
    assert "默认最近30天" not in page_html  # populated from the loaded dataset at runtime


def test_only_routes_tab_is_initially_selected(page_html: str) -> None:
    selected = re.findall(
        r'<button[^>]*data-pb-tab="([^"]+)"[^>]*aria-pressed="true"',
        page_html,
    )
    assert selected == ["routes"]


def test_new_decision_modules_explain_their_data_boundaries(page_html: str) -> None:
    assert "完整职业出装卡" in page_html
    assert "开局、阶段选择、技能天赋与中立物品" in page_html
    assert "15分钟同位置经济差是对线代理指标，不代表因果" in page_html
    assert "只看15分钟落后后取胜" in page_html
    assert "只看可还原路线" in page_html
    assert "显示字段" in page_html
    assert page_html.count("data-pb-complete-jump=") == 4
    assert "技能与天赋" in page_html
    assert "中立物品与附魔" in page_html
