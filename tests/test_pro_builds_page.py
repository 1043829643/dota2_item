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
        "pb-workspace-title",
        "pb-workspace-description",
        "pb-jump-matches",
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
    assert tabs == ["routes", "overview", "people", "situations", "matches", "quality"]
    assert "完整路线与版本变化" in page_html
    assert "热门装备、时点与属性" in page_html
    assert "逐局记录与复盘" in page_html
    assert "核心出装时间线" in page_html


def test_only_routes_tab_is_initially_selected(page_html: str) -> None:
    selected = re.findall(
        r'<button[^>]*data-pb-tab="([^"]+)"[^>]*aria-pressed="true"',
        page_html,
    )
    assert selected == ["routes"]
