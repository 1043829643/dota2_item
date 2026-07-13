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


def test_player_brief_is_route_first_and_keeps_evidence_honest() -> None:
    brief = _function_source("renderProBrief", "renderSequences")
    assert "coreRoutePairs(row, 5).length >= 2" in brief
    assert "pct(topRoute.games, timedRows.length)" in brief
    assert "不代表所有 ${rows.length} 局都按此路线出装" in brief
    assert "仅描述样本差异" in brief
    assert "data-pb-brief-match" in brief
    assert "matchItemTimeline(row, true)" in brief


def test_compact_match_timeline_falls_back_to_final_items() -> None:
    timeline = _function_source("matchItemTimeline", "renderMatches")
    assert "const allPairs = (row.i || [])" in timeline
    assert "if (compact && !pairs.length) pairs = allPairs.slice(0, 5);" in timeline
    assert "终局出现 / 无购买时点" in timeline
    assert "该局没有可展示的装备记录" in timeline


def test_complete_build_keeps_opening_and_stage_evidence_honest() -> None:
    complete = _function_source("renderCompleteBuild", "routeSimilarity")
    assert "0–3分钟开局与首轮补给" in complete
    assert "不等同于出生时库存" in complete
    assert "每个阶段独立统计，不能连读为唯一固定路线" in complete
    assert "special_bonus_" in complete
    assert "item.class === className" in complete
    assert "ensureDetailRows(rows)" in complete
    assert "这不表示该英雄没有技能路线" in complete


def test_lineup_decisions_use_same_role_networth_proxy() -> None:
    lineup = _function_source("renderLineupDecisions", "renderSkills")
    assert "sameRoleOpponent(row)" in lineup
    assert "Number(row.g[1]) - Number(laneOpponent.g[1])" in lineup
    assert "15m同位置经济差" in lineup
    assert "描述性比较" in lineup


def test_match_explorer_supports_local_filters_sort_columns_and_paging() -> None:
    matches = _function_source("renderMatches", "setMatchDetailHtml")
    assert "matchComebackOnly" in matches
    assert "matchRouteOnly" in matches
    assert "data-pb-match-column" in matches
    assert "data-pb-match-sort" in matches
    assert "matchVisibleLimit" in matches
    assert "平均15m团队经济差" in matches


def test_research_flow_hides_analysis_until_primary_selection() -> None:
    source = SCRIPTS.read_text(encoding="utf-8")
    flow = _function_source("updateResearchFlowState", "renderContext")
    pro_start = source.index("// ---- PRO BUILDS")
    render_start = source.index("  function render() {", pro_start)
    render_end = source.index("\n  page.addEventListener('click'", render_start)
    render = source[render_start:render_end]
    filters = _function_source("populateFilters", "applyUrlFilters")
    assert "page.classList.toggle('is-pb-unselected', !ready)" in flow
    assert "if (!ready)" in render
    assert "dashboard.hidden = true" in render
    assert "mainFlow.prepend(researchDrawer)" in source
    assert "profileInsightsSection.before(proBriefSection)" in source
    assert "29 * 86400000" in filters
    assert "data-pb-select-hero" in source
    assert ".slice(0, 6)" in source


def test_scout_flow_requires_target_hero_and_explicit_submit() -> None:
    source = SCRIPTS.read_text(encoding="utf-8")
    flow = _function_source("updateResearchFlowState", "renderContext")
    shortcuts = _function_source("refreshHeroShortcuts", "renderHeroShortcuts")
    assert "(controls.team.value || controls.player.value) && controls.hero.value" in source
    assert "researchMode !== 'scout' || scoutAnalysisSubmitted" in flow
    assert "STEP 02 / HERO" in flow
    assert "点击“生成赛前准备分析”进入结果" in flow
    assert "选择目标和热门英雄时保持在当前页，点击生成后才进入分析" in source
    assert "row.t === controls.team.value" in shortcuts
    assert "String(row.s) === String(controls.player.value)" in shortcuts
    assert "scoutAnalysisSubmitted = true" in source
    assert "params.set('run', '1')" in source
    assert "|| (researchMode === 'scout' && (key === 'team' || key === 'player'))" not in source
