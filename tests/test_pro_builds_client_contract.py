from __future__ import annotations

from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1] / "src" / "scripts.js"


def _function_source(name: str, next_name: str) -> str:
    source = SCRIPTS.read_text(encoding="utf-8")
    start = source.index(f"  function {name}(")
    end = source.index(f"\n  function {next_name}(", start)
    return source[start:end]


def test_profile_duration_and_role_coverage_are_explicit() -> None:
    role = _function_source("renderHeroProfile", "renderProfileInsights")
    assert "const assignedRoleRows" in role
    assert "assignedRoleRows !== roleRows.length" in role
    assert "已判位覆盖" in role
    assert "未判位不纳入1–5号位卡" in role

    insights = _function_source("renderProfileInsights", "renderSampleGuidance")
    assert "Number.isFinite(seconds) && seconds > 0" in insights
    assert "durationRows.filter" in insights
    assert "有效时长 ${durationRows.length.toLocaleString()}/${rows.length.toLocaleString()}局" in insights
    assert "const situationRows = rows.filter(row => situation(row) !== 'unknown')" in insights
    assert "快照覆盖 ${situationRows.length.toLocaleString()}/${rows.length.toLocaleString()}局" in insights


def test_route_adoption_uses_only_reconstructable_matches() -> None:
    cards = _function_source("renderSequences", "renderRouteDrilldown")
    assert "coreRoutePairs(row, 5).length >= 2" in cards
    assert "pct(entry.games, timedRows.length)" in cards
    assert "${timedRows.length.toLocaleString()}/${rows.length.toLocaleString()}" in cards

    trends = _function_source("renderRouteTrends", "renderBranchTree")
    assert "coreRoutePairs(row, 5).length >= 2" in trends
    assert "timedRows.forEach(row =>" in trends
    assert "const bucketMap = new Map();\n    timedRows.forEach(row =>" in trends
    assert "各时间桶的采用率分母仅包含可还原路线的比赛" in trends


def test_compact_match_timeline_falls_back_to_final_items() -> None:
    timeline = _function_source("matchItemTimeline", "renderMatches")
    assert "const allPairs = (row.i || [])" in timeline
    assert "if (compact && !pairs.length) pairs = allPairs.slice(0, 5);" in timeline
    assert "终局出现 / 无购买时点" in timeline
    assert "该局没有可展示的装备记录" in timeline
