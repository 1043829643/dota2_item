# Dota 2 Enhanced Patch Reader and Materials

A static site that turns Valve's raw Dota 2 patch notes into a readable, filterable changelog. Every change is tagged (BUFF / NERF / REWORK / NEW / DEL / MISC / QoL), every numeric delta is computed as a percentage, every per-level formula is expandable into a per-hero-level table.

**Live site:** <https://sikleq.github.io/Sloppy/>

## What it does differently from dota2.com/patches

- **Direction at a glance.** Each row shows a coloured `+12% BUFF` / `-9% NERF` badge derived from the underlying numbers — no arithmetic required.
- **Per-level scaling unfolded.** Formula rows (`14% + 1% per level`) expand into a full L1–L30 table.
- **Stat changes verified against game data.** Base stat deltas auto-cross-reference `data/stats/<patch>/heroes.json` extracted from Valve's KV files.
- **Ability reworks as before/after panes** with icons stacked side-by-side.
- **Filter by tag.** Click a chip to surface only BUFF, NERF, DEL, etc. rows across the page.
- **Calendar view.** Chronological patch list with lifespans, sparklines, and yearly stats.
- **Terrain comparison.** Side-by-side map diff slider comparing Dota 2 map layouts across patches.
- **Hero/item dynamics matrix.** Tag breakdown per entity across all patches.

## Repository layout

```
build_site.py               ← SINGLE entrypoint: python build_site.py [steps] [--latest]
builders/
  build_patches.py          ← orchestrator: auto-discovers content/p*.py
  creeps.py                 ← generates dist/creeps.html
  heroes_stats.py           ← generates dist/heroes_stats.html
  heroes_dyn.py             ← generates dist/heroes_dyn.html
  items_dyn.py              ← generates dist/items_dyn.html
  hero_lab.py               ← generates dist/hero_lab.html
  mana_items.py             ← generates dist/mana_items.html
  aoe_increase.py           ← generates dist/aoe_increase.html
  terrain.py                ← generates dist/terrain.html
  silent.py                 ← generates dist/patches/silent/{version}.html

generate_patch_code_v2.py   ← KV → Python scaffold + data/normalized/patches/<ver>.json
styles.css                  ← site stylesheet (minified into dist/)
src/scripts.js              ← site JavaScript (minified into dist/)

patch/
  output.py / state.py      ← HTML accumulator + global build state
  api.py                    ← public re-export consumed by content/p*.py
  images.py                 ← HERO_SLUG, ITEM_SLUG, _LOCAL_ABIL_ICONS
  stats.py                  ← stat DB loaders, stat_h/i/u(), bstat_*()
  badges.py                 ← b(), br(), bf(), t(), facet_badge(), scale_pill()
  elements.py               ← HTML builders: li(), section(), ability(), headers…
  meta.py                   ← PATCHES, RELEASE_HISTORY, latest_stats_version()
  page.py                   ← write_head/footer, save_html, asset minification
  calendar.py / index_page.py / rosters.py
  known_exceptions.py       ← shared ability/icon allowlists (audits + builders)

content/p<version>.py       ← per-patch def build(); auto-discovered, no registration
tests/                      ← pytest unit tests (run in CI)

data/
  abilities_slim.json       ← authoritative ability slug → dname + is_innate
  stats/<version>/          ← full per-patch snapshot — see docs/workflow.md
  normalized/patches/*.json ← structured per-patch artifact (CI-required)
  <version>_datafeed.json   ← cached Valve datafeed JSON

icons/                      ← local mirror of hero, item, ability icons
scripts/
  fetch/                    ← data fetchers (fetch_icons, fetch_*_history, …)
  gen/                      ← asset generators (terrain maps, layer icons, …)
  audit/                    ← auditors (audit_all, audit_*, check_icons)

# Build output — not committed:
dist/                       ← everything served by GitHub Pages
```

## Quick start

Requires **Python 3.10+**. The build itself has **no third-party
dependencies** — only the test suite does (`pytest`, `rcssmin`, `rjsmin`).

```powershell
git clone https://github.com/sikleq/Sloppy.git
cd Sloppy

# Build everything — output goes to dist/
python build_site.py

# Serve locally
python -m http.server 8765 --directory dist

# Run tests
pip install -r requirements-dev.txt
python -m pytest tests -q
```

## Professional item-build analytics

`pro_builds.html` combines professional match builds and purchase timings with
the current Hero Lab item-stat model. The page starts from three task-oriented
research paths: hero build research, player-plus-hero research, and pre-match
scouting. Each path promotes only its essential filters, opens the most relevant
analysis tab, and moves the remaining controls and exports into an expandable
advanced area. Hero, player, team, and opponent selectors are searchable; a
sticky context strip keeps the active question and sample size visible; small
samples offer one-click range expansion; real matches open in a side drawer so
the selected route and filter context remain intact.

The analysis includes date/patch/player/team/hero/
responsibility-position filters, route flow graphs, current-vs-previous window
comparisons, game-state and matchup splits, skill/item linkage, team and player
style, substitutions, timing scores, sample confidence, recommendations,
single-match timelines, a map heatmap, freshness alerts, and CSV/SVG/HTML
exports. The workspace is split into six URL-persisted tabs, clusters near-match
core routes, renders a branching build tree, and supports head-to-head player or
patch comparison. The browser reads static caches and never connects to
StarRocks.

The large detail cache is not shipped as one eager browser request. During the
`pro` build it is split into deterministic `YYYY-MM` shards plus a small
manifest. Match detail loads one month on click; skills load only the months in
the active filter; the map heatmap requires an explicit load action. The
always-needed core cache is dictionary-encoded during the build so repeated
dates, patches, leagues, teams, players, heroes, role methods, and item IDs are
transferred once and restored in the browser without changing the source cache.
Route clusters use the versioned deterministic `route-cluster-v2` algorithm, expose a
stable URL ID, and drill down to variants, players, teams, situations,
opponents, and source matches. Each selected cluster also compares win rate,
game state, first-core timing, duration, economy, and item adoption against all
other routes in the same filtered sample. A route-lifecycle table tracks the
same stable clusters by week, month, or patch, including adoption sparklines,
recent change, Wilson intervals, and first/last appearance. The player view includes a six-axis
route-style profile and nearest-player recommendations; named filter views can
be saved and restored locally in the browser. The Data Quality tab reports
global and monthly coverage together with source and deduplication provenance.

The extractor writes a compact filter index (`data/pro_builds.json`) and an
on-demand detail cache (`data/pro_builds_detail.json`). Responsibility position
is assigned from league-level `lane_role` plus lane CS; `slot` is only used to
join records inside one match and is never interpreted as a Dota position.

Configure a read-only StarRocks account once. For routine updates, run the
incremental orchestrator; it overlaps the latest two days, catches up through
today in windows of at most seven days, commits both caches together, rebuilds
the page, and rejects the update if the audit fails:

```powershell
$env:STARROCKS_HOST="<host>"
$env:STARROCKS_PORT="9030"
$env:STARROCKS_USER="<read-only-user>"
$env:STARROCKS_PASSWORD="<password>"
python scripts/fetch/update_pro_builds.py
```

This command is suitable for a daily Windows Task Scheduler job. Do not put the
password in the command line; store it in the task account's environment. A
lock prevents concurrent jobs. `data/pro_builds_update_status.json` records
running/success/failure state, range, counts, recovery, and gate result. A
transaction journal plus rollback copies restores the last accepted pair after
an interruption or failed quality gate.

For Task Scheduler, use `scripts/fetch/run_pro_builds_update.ps1` as the daily
entry point. It validates that all four connection variables exist, runs from
the repository root, preserves the exit code, and writes timestamped logs under
the ignored `.cache/pro-builds-logs/` directory. The recommended trigger is
once daily after the replay ingestion window; reruns are safe because the
latest two days are refreshed by complete match replacement.

For a first bootstrap or an intentional historical rebuild, call the bounded
extractor directly with explicit dates, then build and audit:

```powershell
$env:PRO_BUILDS_DATE_FROM="2026-06-01"
$env:PRO_BUILDS_DATE_TO="2026-06-30"
python scripts/fetch/fetch_pro_builds.py
python build_site.py pro
python scripts/audit/check_pro_builds.py
```

The extractor first resolves bounded match IDs, then queries
non-partitioned tables in match-ID batches. Every partitioned fact table is
split into one exact `dt = YYYY-MM-DD` partition per query, further bounded by
that day's match-ID batch, and deduplicated with `ROW_NUMBER()` on the table's
business key. It never performs an unbounded or cross-month combat-log,
interval, status, purchase, or ability scan.

Open `http://localhost:8765/pro_builds.html` while the local server is running.

To repair purchase timings for one already-cached hero/date slice without
replacing unrelated matches, use the bounded route backfill. It queries only
the exact `dt` partitions and cached match IDs in the selection. The optional
OpenDota fallback is used only for selected matches that have no purchase
events in either StarRocks source; its match IDs and counts are recorded in
`meta.advanced.bounded_route_backfill`:

```powershell
python scripts/fetch/backfill_pro_build_routes.py `
  --hero sven `
  --date-from 2026-06-12 `
  --date-to 2026-07-11 `
  --opendota-fallback
python build_site.py pro
python scripts/audit/check_pro_builds.py
```

First recognizable item-use timestamps are stored in the core cache as
`u: [[item_id, absolute_replay_seconds]]`. The UI subtracts the matching first
purchase timestamp to show the arithmetic mean purchase-to-first-use interval
in both the popular-item table and each player's representative route. The
field is nullable: `null` means that a compatible combat-log timeline was not
available, `[]` means that the timeline was scanned but no recognized use was
found, and a non-empty list contains validated events. Passive items therefore
remain unknown instead of being treated as zero seconds. Echo Sabre's explicit
debuff trigger is mapped; OpenDota aggregate `item_uses` counts are never
invented into timestamps.

To populate this field for an existing cache, run the bounded historical
backfill. With no filters it covers every cached match; optional hero/date
arguments narrow a repair. Each query still uses one exact `dt` partition and
cached match IDs only:

```powershell
python scripts/fetch/backfill_pro_build_item_uses.py
python build_site.py pro
python scripts/audit/check_pro_builds.py
```

## Adding a new patch

Short version (full guide: [docs/workflow.md](docs/workflow.md)):

1. Register the version in `patch/meta.py` (`PATCHES` + `RELEASE_HISTORY`).
2. Refresh `data/stats/<version>/` via the `scripts/fetch/` helpers — the
   strict CI manifest checks every required JSON/TXT.
3. Generate the scaffold + normalized JSON:
   ```powershell
   python generate_patch_code_v2.py 7.42
   ```
4. Review the scaffold and save it as `content/p742.py` (auto-discovered;
   no registration in any builder).
5. Register any new slugs in `HERO_SLUG` / `ITEM_SLUG`; confirm new ability
   slugs against `data/abilities_slim.json`.
6. Run the gates:
   ```powershell
   python -m pytest tests -q
   python build_site.py
   python tools/validate_data.py
   python scripts/audit/check_icons.py
   python scripts/audit/audit_all.py
   ```

## Architecture & data format

- [docs/architecture.md](docs/architecture.md) — how the modules fit together.
- [docs/data-format.md](docs/data-format.md) — Valve KV format, the `b()` / `bf()` / `t()` helper API, the `l=True` flag rules.

## CI

Two GitHub Actions workflows:

- **`.github/workflows/build.yml`** — runs on every push to `main` and on
  PRs. Required before deploy: pytest, full `build_site.py`,
  minification verification, normalized-JSON validation, content-rule
  audits (tag direction, BAT `l=True`, trailing whitespace, ul balance),
  the strict current-patch stats manifest, and `check_icons.py`. On `main`,
  the resulting `dist/` is published to GitHub Pages.
- **`.github/workflows/audit-live.yml`** — runs on a daily schedule (and
  on `workflow_dispatch`). Performs `audit_all.py`, which makes live HTTP
  requests to `dota2.com/datafeed/...` to verify display names against
  Valve's API. **Deliberately decoupled from the deploy path** — a Valve
  outage or rate limit must not block a good deploy.

## Contributing

Pull requests welcome. Most useful:

- **Patch ports** for older versions (anything pre-7.33 lacks the stats DB layer).
- **Tag corrections** when the autodetector mislabels a change.
- **Icon mirror updates** for new innate ability icons.

Bug reports: include the patch version, hero/item/ability, and expected vs rendered output.

## License

**PolyForm Noncommercial 1.0.0** — see [LICENSE](LICENSE).

Source is open for reading, learning, hobby and educational use. **Commercial use is not permitted** without a separate license.
Contact [@sikleq](https://github.com/sikleq) for commercial licensing inquiries.

## Acknowledgements

- Game data extracted via [muk-as/DOTA2_CLIENT](https://github.com/muk-as/DOTA2_CLIENT) (npc_heroes.txt / items.txt history since 7.33).
- Icons from Valve's official `cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/` CDN.
- Landing-page inventory UI uses the [Gothic Pixel UI](https://abyssowl.itch.io/gothic-pixel-ui) pack by **abyssowl**.
- Patch notes © Valve Corporation. Unofficial fan project, not affiliated with or endorsed by Valve.
