"""Validate professional-build caches, shards, and required UI contracts."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "data" / "pro_builds.json"
DETAIL = ROOT / "data" / "pro_builds_detail.json"
DIST_DATA = ROOT / "dist" / "data"
DIST_CORE = DIST_DATA / "pro_builds.json"
MANIFEST = DIST_DATA / "pro_builds_detail_manifest.json"
FETCHER = ROOT / "scripts" / "fetch" / "fetch_pro_builds.py"
UPDATER = ROOT / "scripts" / "fetch" / "update_pro_builds.py"
UPDATE_STATUS = ROOT / "data" / "pro_builds_update_status.json"


def fail(message: str, errors: list[str]) -> None:
    errors.append(message)
    print(f"ERROR: {message}")


def main() -> int:
    errors: list[str] = []
    for path in (CORE, DETAIL, DIST_CORE, MANIFEST, FETCHER, UPDATER, UPDATE_STATUS, ROOT / "dist" / "pro_builds.html"):
        if not path.exists():
            fail(f"missing {path.relative_to(ROOT)}", errors)
    if errors:
        return 1

    core = json.loads(CORE.read_text(encoding="utf-8"))
    compact = json.loads(DIST_CORE.read_text(encoding="utf-8"))
    detail = json.loads(DETAIL.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    records = core.get("records") or []
    meta = core.get("meta") or {}
    if len(records) != int(meta.get("player_games") or -1):
        fail("core player_games does not match record count", errors)
    if len({row.get("m") for row in records}) != int(meta.get("matches") or -1):
        fail("core match count does not match distinct record matches", errors)
    if compact.get("schema") != "pro-builds-core-v2":
        fail("dist core cache is not dictionary-encoded v2", errors)
    dictionaries = compact.get("dictionaries") or {}
    compact_rows = compact.get("records") or []
    update_status = (compact.get("meta") or {}).get("update_status") or {}
    if update_status.get("status") not in {"baseline", "running", "success", "failed", "invalid"}:
        fail("compact core is missing a recognized update status", errors)
    if len(compact_rows) != len(records):
        fail("compact core record count does not match source", errors)
    else:
        def lookup(field: str, index) -> str:
            values = dictionaries.get(field) or []
            return values[index] if isinstance(index, int) and 0 <= index < len(values) else ""

        fields = ("m", "d", "p", "li", "l", "t", "s", "n", "h", "hi", "sl", "tm", "r", "rm", "rc", "w", "lv", "nw", "du", "i", "g")
        for source, encoded in zip(records, compact_rows):
            decoded = [
                encoded[0], lookup("d", encoded[1]), lookup("p", encoded[2]), encoded[3],
                lookup("l", encoded[4]), lookup("t", encoded[5]), lookup("s", encoded[6]),
                lookup("n", encoded[7]), lookup("h", encoded[8]), encoded[9], encoded[10],
                encoded[11], encoded[12], lookup("rm", encoded[13]), encoded[14], encoded[15],
                encoded[16], encoded[17], encoded[18],
                [[lookup("item", encoded[19][index]), encoded[19][index + 1] if index + 1 < len(encoded[19]) else None] for index in range(0, len(encoded[19] or []), 2)],
                encoded[20],
            ]
            expected = [source.get(field) if source.get(field) is not None or field not in {"d", "p", "l", "t", "s", "n", "h", "rm"} else "" for field in fields]
            if decoded != expected:
                fail(f"compact round-trip mismatch at match {source.get('m')}", errors)
                break
    if DIST_CORE.stat().st_size >= CORE.stat().st_size * 0.75:
        fail("compact core cache did not achieve at least 25% size reduction", errors)
    bad_text = []
    for row in records:
        for field in ("l", "t", "n"):
            value = str(row.get(field) or "")
            if "\ufffd" in value:
                bad_text.append((field, value))
    if bad_text:
        fail(f"source contains replacement-character mojibake: {bad_text[:3]}", errors)
    status = json.loads(UPDATE_STATUS.read_text(encoding="utf-8"))
    if status.get("status") != update_status.get("status"):
        fail("published update status does not match source status", errors)
    if status.get("status") == "success" and status.get("quality_gate") != "passed":
        fail("successful update status is missing a passed quality gate", errors)
    timed = sum(
        any(isinstance(pair[1], int) for pair in (row.get("i") or []))
        for row in records
    )
    if records and timed / len(records) < 0.5:
        fail(f"global purchase timing coverage below 50%: {timed}/{len(records)}", errors)
    latest_date = meta.get("date_max") or ""
    latest_rows = [row for row in records if row.get("d") == latest_date]
    latest_timed = sum(
        any(isinstance(pair[1], int) for pair in (row.get("i") or []))
        for row in latest_rows
    )
    if latest_rows and latest_timed / len(latest_rows) < 0.4:
        fail(f"latest-day purchase timing coverage below 40%: {latest_timed}/{len(latest_rows)}", errors)
    match_sizes: dict[int, int] = {}
    for row in records:
        match_id = int(row.get("m") or 0)
        match_sizes[match_id] = match_sizes.get(match_id, 0) + 1
    incomplete_matches = sum(count < 9 for count in match_sizes.values())
    if match_sizes and incomplete_matches / len(match_sizes) > 0.005:
        fail(f"too many incomplete matches: {incomplete_matches}/{len(match_sizes)}", errors)

    aggregate = {"players": 0, "drafts": 0, "events": 0}
    for month, info in sorted((manifest.get("buckets") or {}).items()):
        path = ROOT / "dist" / info["url"]
        if not path.exists():
            fail(f"manifest shard missing: {info['url']}", errors)
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("meta", {}).get("month") != month:
            fail(f"shard month mismatch: {month}", errors)
        if path.stat().st_size != int(info.get("bytes") or -1):
            fail(f"shard byte count mismatch: {month}", errors)
        for section in aggregate:
            count = len(payload.get(section) or {})
            aggregate[section] += count
            manifest_key = "players" if section == "players" else f"{section[:-1]}_matches"
            if count != int(info.get(manifest_key) or 0):
                fail(f"manifest {section} count mismatch: {month}", errors)

    for section, count in aggregate.items():
        if count != len(detail.get(section) or {}):
            fail(f"sharded {section} count does not match source detail", errors)
    if (DIST_DATA / "pro_builds_detail.json").exists():
        fail("legacy monolithic detail cache must not be copied to dist", errors)

    html = (ROOT / "dist" / "pro_builds.html").read_text(encoding="utf-8")
    js = (ROOT / "src" / "scripts.js").read_text(encoding="utf-8")
    required_html = (
        'id="pb-route-detail"', 'id="pb-quality-summary"',
        'id="pb-style-radar"', 'id="pb-saved-view"',
        'id="pb-route-trends"', 'id="pb-route-trend-grain"',
        'id="pb-freshness"',
        'data-pb-mode="hero"', 'data-pb-mode="player"', 'data-pb-mode="scout"',
        'id="pb-analysis-context"', 'id="pb-sample-guidance"',
        'id="pb-match-drawer"', 'id="pb-advanced-filters"',
        'detailManifestUrl',
    )
    for marker in required_html:
        if marker not in html:
            fail(f"missing UI contract: {marker}", errors)
    required_js = (
        "route-cluster-v2", "ensureDetailRows", "renderRouteDrilldown",
        "renderDataQuality", "renderPlayerStyle", "saveCurrentView",
        "renderRouteTrends", "routeTrendBucket",
        "decodeCorePayload", "pro-builds-core-v2",
        "renderFreshness",
        "setResearchMode", "renderContext", "renderSampleGuidance",
        "openMatchDrawer", "commitSearchControl",
    )
    for marker in required_js:
        if marker not in js:
            fail(f"missing JS contract: {marker}", errors)

    fetcher = FETCHER.read_text(encoding="utf-8")
    updater = UPDATER.read_text(encoding="utf-8")
    required_query_contracts = (
        "match_time >= '{date_from}'", "match_time < '{date_to_exclusive}'",
        "WHERE dt = '{partition_date}'", "match_id IN ({ids})",
        "ROW_NUMBER() OVER (",
    )
    for marker in required_query_contracts:
        if marker not in fetcher:
            fail(f"missing bounded query contract: {marker}", errors)
    if "WHERE dt BETWEEN" in fetcher or "WHERE dt >=" in fetcher:
        fail("partitioned fetch queries must use one exact dt, not ranges", errors)
    required_update_contracts = (
        "SAFE_WINDOW_DAYS = 7", "class UpdateLock", "recover_if_needed",
        "begin_commit", "pending_quality_gate", "run_quality_gate",
        "complete incoming matches replace cached matches",
    )
    for marker in required_update_contracts:
        if marker not in updater:
            fail(f"missing incremental update contract: {marker}", errors)

    if errors:
        print(f"FAILED: {len(errors)} issue(s)")
        return 1
    print(
        "OK: pro builds "
        f"{meta.get('matches', 0):,} matches / {len(records):,} player-games / "
        f"{len(manifest.get('buckets') or {}):,} detail shards / "
        f"{DIST_CORE.stat().st_size / 1048576:.1f} MiB compact core"
    )
    print(
        "OK: shard conservation "
        f"players={aggregate['players']:,}, drafts={aggregate['drafts']:,}, "
        f"events={aggregate['events']:,}"
    )
    print(
        "OK: update quality "
        f"status={status.get('status')} gate={status.get('quality_gate')} / "
        f"timed-items={timed / max(1, len(records)):.1%} global, "
        f"{latest_timed / max(1, len(latest_rows)):.1%} on {latest_date}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
