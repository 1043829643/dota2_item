"""Build the standalone professional/public item-intelligence page.

This page deliberately stays separate from ``pro_builds.html``.  It consumes
credential-free static caches but gives final item combinations their own
hero-first research flow. Professional and public samples remain separate.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

try:
    from . import site_common as _site
    from .pro_builds import (
        DATA_PATH,
        DIST,
        UPDATE_STATUS_PATH,
        _config as _pro_config,
        _latest_href,
        _write_compact_core,
    )
except ImportError:
    import site_common as _site
    from pro_builds import (
        DATA_PATH,
        DIST,
        UPDATE_STATUS_PATH,
        _config as _pro_config,
        _latest_href,
        _write_compact_core,
    )


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DATA_PATH = ROOT / "data" / "opendota_public_items.json"


def _config() -> dict:
    base = _pro_config()
    return {
        "dataUrl": base["dataUrl"],
        "publicDataUrl": "data/opendota_public_items.json",
        "theoryPatch": base["theoryPatch"],
        "comboMinCost": 1020,
        "heroes": base["heroes"],
        "items": base["items"],
    }


def render_html() -> str:
    config = json.dumps(_config(), ensure_ascii=False, separators=(",", ":"))
    config = config.replace("<", "\\u003c")
    nav = _site.render_top_nav(
        "materials", _latest_href(), subtabs_active="item_data", subnav_in_header=False
    )
    subnav = _site.render_materials_subnav("item_data")
    av = _site.compute_asset_version()
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SIKLE | 装备大数据</title>
{_site.favicon_links()}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jersey+10&family=Jersey+25&display=block">
<link rel="stylesheet" href="styles.css?v={av}">
</head>
<body class="item-data-body">
{nav}
<div class="container item-data-page is-unselected">
{subnav}
<main class="id-main">
  <header class="id-hero">
    <div>
      <span class="id-eyebrow">FINAL ITEM INTELLIGENCE</span>
      <h1>装备大数据</h1>
      <p>职业比赛与 OpenDota 高分公开局分开统计，只研究比赛结束时的最终六格装备组合。</p>
    </div>
    <aside id="id-freshness" aria-live="polite"><span></span><div><strong>正在读取职业比赛</strong><small>准备英雄与装备样本</small></div></aside>
  </header>

  <section class="id-setup" id="id-setup" aria-label="装备研究设置">
    <header>
      <div><span>START A STUDY</span><h2>先选择数据源，再生成装备结论</h2></div>
      <p>选择不会触发跳转；两类比赛不会混算。公开局是 OpenDota 随机公开样本，不代表全部玩家比赛。</p>
    </header>
    <div class="id-source-picker" id="id-source-switch" aria-label="数据源">
      <button type="button" data-id-source="pro" class="is-active" aria-pressed="true"><span>PRO MATCHES</span><b>职业比赛</b><small>支持职责位置、选手与战队证据</small><em id="id-source-pro-count">正在读取…</em></button>
      <button type="button" data-id-source="public" aria-pressed="false"><span>PUBLIC SAMPLE</span><b>高分公开局</b><small>OpenDota 超凡及以上随机样本 · 仅终局装备</small><em id="id-source-public-count">按需载入</em></button>
      <aside><b>口径隔离</b><p id="id-source-note">当前统计职业比赛，不与公开局共用分母。</p></aside>
    </div>
    <div class="id-runway">
      <article class="id-step id-step-hero">
        <div class="id-step-index"><span>01</span><i></i></div>
        <div class="id-step-copy"><b>选择英雄</b><small>必选 · 当前研究的主语</small></div>
        <label class="id-hero-search">
          <span>英雄名称</span>
          <input id="id-hero-search" type="search" list="id-hero-list" autocomplete="off" placeholder="搜索英雄，例如 Ember Spirit">
          <datalist id="id-hero-list"></datalist>
        </label>
        <div class="id-hot-heroes"><span id="id-hot-label">近期职业热门</span><div id="id-hot-heroes"><i>正在统计…</i></div></div>
      </article>

      <article class="id-step">
        <div class="id-step-index"><span>02</span><i></i></div>
        <div class="id-step-copy"><b>限定样本</b><small>位置、版本与比赛日期</small></div>
        <div class="id-scope-grid">
          <label><span id="id-role-label">职责位置</span><select id="id-role"><option value="">全部位置</option><option value="1">一号位</option><option value="2">二号位</option><option value="3">三号位</option><option value="4">四号位</option><option value="5">五号位</option></select></label>
          <label><span>版本</span><select id="id-patch"><option value="">全部版本</option></select></label>
          <label><span>开始日期</span><input id="id-date-from" type="date"></label>
          <label><span>结束日期</span><input id="id-date-to" type="date"></label>
        </div>
        <div class="id-date-presets" aria-label="快捷时间范围"><button type="button" data-id-days="30">最近30天</button><button type="button" data-id-days="90">最近90天</button><button type="button" data-id-days="all">全部数据</button></div>
      </article>

      <article class="id-step id-step-generate">
        <div class="id-step-index"><span>03</span></div>
        <div class="id-step-copy"><b>生成研究</b><small>进入终局组合与逐局证据</small></div>
        <div class="id-generate-summary" id="id-generate-summary">先选择一名英雄</div>
        <button type="button" id="id-generate" disabled><span>生成装备大数据</span><small>不会离开当前页面</small></button>
      </article>
    </div>
    <div class="id-load-status" id="id-load-status" role="status">正在载入职业比赛缓存…</div>
  </section>

  <section class="id-results" id="id-results" hidden>
    <header class="id-context-bar">
      <div class="id-context-hero"><img id="id-context-icon" alt=""><div><span>CURRENT STUDY</span><strong id="id-context-title">—</strong><small id="id-context-scope">—</small></div></div>
      <div class="id-context-actions"><span id="id-context-count">—</span><button type="button" id="id-change-study">调整研究范围</button></div>
    </header>

    <section class="id-kpis" aria-label="装备研究关键指标">
      <article><span>终局快照样本</span><strong id="id-kpi-games">—</strong><small>组合统计的真实分母</small></article>
      <article><span>独立比赛</span><strong id="id-kpi-matches">—</strong><small>去重后的比赛数</small></article>
      <article><span>样本胜率</span><strong id="id-kpi-winrate">—</strong><small>仅描述当前样本</small></article>
      <article><span>终局快照覆盖</span><strong id="id-kpi-coverage">—</strong><small>有快照 / 当前筛选全部局</small></article>
      <article><span>六件高价装备局</span><strong id="id-kpi-sixes">—</strong><small>终局至少六件且每件大于1020</small></article>
    </section>

    <section class="id-analysis-shell">
      <header class="id-analysis-head">
        <div><span>FINAL INVENTORY DATASET</span><h2>从终局组合逐层下钻</h2><p>单件与二至六件套都来自同一局的最终背包，不使用购买路线替代。</p></div>
        <div class="id-analysis-tools">
          <label><span>最终单件范围</span><select id="id-item-scope"><option value="core">核心成装</option><option value="completed">扩展装备（含高价组件）</option><option value="regular">全部非消耗品</option></select></label>
          <label><span>最低样本</span><select id="id-min-sample"><option value="1">1局</option><option value="3" selected>3局</option><option value="5">5局</option><option value="10">10局</option><option value="20">20局</option><option value="50">50局</option></select></label>
          <label class="id-analysis-search"><span>结果内搜索</span><input id="id-result-search" type="search" placeholder="装备名称"></label>
        </div>
      </header>

      <details class="id-cost-catalog">
        <summary><span>组合候选装备</span><b>ItemCost &gt; 1020</b><small id="id-cost-catalog-count">正在整理…</small></summary>
        <div id="id-cost-catalog-list"></div>
      </details>

      <nav class="id-tabs" id="id-tabs" aria-label="装备大数据分析步骤">
        <button type="button" data-id-tab="overview" class="is-active" aria-pressed="true"><span>01</span><b>先看结论</b><small>终局主流与差异</small></button>
        <button type="button" data-id-tab="single" aria-pressed="false"><span>02</span><b>最终单件</b><small>终局持有率与表现</small></button>
        <button type="button" data-id-tab="pairs" aria-pressed="false"><span>03</span><b>最终两件套</b><small>每件价格 &gt; 1020</small></button>
        <button type="button" data-id-tab="trios" aria-pressed="false"><span>04</span><b>最终三件套</b><small>每件价格 &gt; 1020</small></button>
        <button type="button" data-id-tab="fours" aria-pressed="false"><span>05</span><b>最终四件套</b><small>每件价格 &gt; 1020</small></button>
        <button type="button" data-id-tab="fives" aria-pressed="false"><span>06</span><b>最终五件套</b><small>每件价格 &gt; 1020</small></button>
        <button type="button" data-id-tab="sixes" aria-pressed="false"><span>07</span><b>最终六件套</b><small>每件价格 &gt; 1020</small></button>
        <button type="button" data-id-tab="evidence" aria-pressed="false"><span>08</span><b>真实比赛</b><small>核对最终背包</small></button>
      </nav>

      <section class="id-panel is-active" data-id-panel="overview">
        <div class="id-conclusion-grid" id="id-conclusions"></div>
        <section class="id-card id-overview-list"><header><div><span>FINAL HOLDING × OUTCOME</span><h3>终局持有率与样本表现</h3></div><small>横条是终局持有率；颜色表示相对未持有样本的胜率差</small></header><div id="id-overview-items"></div></section>
        <aside class="id-method-note"><b>统计口径</b><p>职业局终局六格取比赛时长附近的末次可观察状态；公开局直接取 OpenDota item_0 至 item_5，不含背包和中立物品。缺少终局快照的比赛不会用购买日志补造。最终单件按上方“最终单件范围”统计；最终二至六件套只从单价严格大于1020金币的普通非消耗品中抽取无序组合。“相对未持有”只是描述性对照，仍受经济、比赛时长与胜负局势影响。</p></aside>
      </section>

      <section class="id-panel" data-id-panel="single" hidden>
        <section class="id-card"><header><div><span>FINAL INDIVIDUAL ITEMS</span><h3>最终单件装备</h3></div><small>每局每件装备最多计一次；默认按终局持有样本排序</small></header><div class="id-table-wrap"><table class="id-table" id="id-single-table"><thead><tr><th data-id-sort="name">装备</th><th data-id-sort="rate">终局持有率</th><th data-id-sort="count">样本</th><th data-id-sort="winRate">胜率</th><th data-id-sort="delta" title="终局持有该装备的胜率减去终局未持有该装备的胜率；仅为描述性关联">相对未持有</th><th>95%区间</th><th data-id-sort="duration">中位比赛时长</th></tr></thead><tbody id="id-single-body"></tbody></table></div></section>
      </section>

      <section class="id-panel" data-id-panel="pairs" hidden>
        <section class="id-card"><header><div><span>FINAL TWO-ITEM SETS</span><h3>最终两件套组合</h3></div><small>两件装备均须 ItemCost &gt; 1020，并在同一终局背包中共同出现</small></header><div class="id-table-wrap"><table class="id-table" id="id-pair-table"><thead><tr><th>最终两件套</th><th data-id-sort="rate">终局组合率</th><th data-id-sort="count">样本</th><th data-id-sort="winRate">胜率</th><th data-id-sort="delta">相对未持有</th><th>95%区间</th><th data-id-sort="duration">中位比赛时长</th></tr></thead><tbody id="id-pair-body"></tbody></table></div></section>
      </section>

      <section class="id-panel" data-id-panel="trios" hidden>
        <section class="id-card"><header><div><span>FINAL THREE-ITEM SETS</span><h3>最终三件套组合</h3></div><small>三件装备均须 ItemCost &gt; 1020；高胜率仍可能来自优势局完成偏差</small></header><div class="id-table-wrap"><table class="id-table" id="id-trio-table"><thead><tr><th>最终三件套</th><th data-id-sort="rate">终局组合率</th><th data-id-sort="count">样本</th><th data-id-sort="winRate">胜率</th><th data-id-sort="delta">相对未持有</th><th>95%区间</th><th data-id-sort="duration">中位比赛时长</th></tr></thead><tbody id="id-trio-body"></tbody></table></div></section>
      </section>

      <section class="id-panel" data-id-panel="fours" hidden>
        <section class="id-card"><header><div><span>FINAL FOUR-ITEM SETS</span><h3>最终四件套组合</h3></div><small>四件装备均须 ItemCost &gt; 1020；组合不表示购买顺序</small></header><div class="id-table-wrap"><table class="id-table" id="id-four-table"><thead><tr><th>最终四件套</th><th data-id-sort="rate">终局组合率</th><th data-id-sort="count">样本</th><th data-id-sort="winRate">胜率</th><th data-id-sort="delta">相对未持有</th><th>95%区间</th><th data-id-sort="duration">中位比赛时长</th></tr></thead><tbody id="id-four-body"></tbody></table></div></section>
      </section>

      <section class="id-panel" data-id-panel="fives" hidden>
        <section class="id-card"><header><div><span>FINAL FIVE-ITEM SETS</span><h3>最终五件套组合</h3></div><small>五件装备均须 ItemCost &gt; 1020；低样本组合请结合95%区间阅读</small></header><div class="id-table-wrap"><table class="id-table" id="id-five-table"><thead><tr><th>最终五件套</th><th data-id-sort="rate">终局组合率</th><th data-id-sort="count">样本</th><th data-id-sort="winRate">胜率</th><th data-id-sort="delta">相对未持有</th><th>95%区间</th><th data-id-sort="duration">中位比赛时长</th></tr></thead><tbody id="id-five-body"></tbody></table></div></section>
      </section>

      <section class="id-panel" data-id-panel="sixes" hidden>
        <section class="id-card"><header><div><span>FINAL SIX-ITEM SETS</span><h3>最终六件套组合</h3></div><small>六件装备均须 ItemCost &gt; 1020；六件套受比赛时长与经济偏差影响最大</small></header><div class="id-table-wrap"><table class="id-table" id="id-six-table"><thead><tr><th>最终六件套</th><th data-id-sort="rate">终局组合率</th><th data-id-sort="count">样本</th><th data-id-sort="winRate">胜率</th><th data-id-sort="delta">相对未持有</th><th>95%区间</th><th data-id-sort="duration">中位比赛时长</th></tr></thead><tbody id="id-six-body"></tbody></table></div></section>
      </section>

      <section class="id-panel" data-id-panel="evidence" hidden>
        <section class="id-card"><header><div><span>REAL MATCH EVIDENCE</span><h3>逐局终局六格</h3></div><small id="id-evidence-note">最多展示最近60个有终局快照的选手英雄局</small></header><div class="id-table-wrap"><table class="id-table id-evidence-table"><thead><tr><th>比赛 / 日期</th><th>选手 / 战队</th><th>位置</th><th>最终装备</th><th>结果</th><th></th></tr></thead><tbody id="id-evidence-body"></tbody></table></div></section>
      </section>
    </section>
  </section>
</main>
</div>
<script id="item-data-config" type="application/json">{config}</script>
<script defer src="src/scripts.js?v={av}"></script>
</body>
</html>
"""


def _ensure_compact_core() -> None:
    target = DIST / "data" / DATA_PATH.name
    sources = [DATA_PATH]
    if UPDATE_STATUS_PATH.exists():
        sources.append(UPDATE_STATUS_PATH)
    newest_source = max(path.stat().st_mtime for path in sources)
    if not target.exists() or target.stat().st_mtime < newest_source:
        _write_compact_core()


def _ensure_public_data() -> None:
    """Publish the credential-free OpenDota sample beside the pro cache."""
    target = DIST / "data" / PUBLIC_DATA_PATH.name
    if PUBLIC_DATA_PATH.exists():
        if not target.exists() or target.stat().st_mtime < PUBLIC_DATA_PATH.stat().st_mtime:
            shutil.copy2(PUBLIC_DATA_PATH, target)
        return
    target.write_text(
        json.dumps(
            {
                "schema": "opendota-public-items-v1",
                "meta": {
                    "source": "OpenDota public sample",
                    "sampled": True,
                    "matches": 0,
                    "records": 0,
                    "date_min": "",
                    "date_max": "",
                    "position_available": False,
                },
                "records": [],
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )


def main() -> int:
    if not DATA_PATH.exists():
        raise SystemExit(
            "Missing data/pro_builds.json; run scripts/fetch/fetch_pro_builds.py first"
        )
    DIST.mkdir(exist_ok=True)
    (DIST / "data").mkdir(exist_ok=True)
    _ensure_compact_core()
    _ensure_public_data()
    html = render_html()
    target = DIST / "item_data.html"
    target.write_text(html, encoding="utf-8")
    print(f"  -> dist/item_data.html: {len(html):,} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
