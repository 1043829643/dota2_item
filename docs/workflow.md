# Workflow: adding a new patch

The whole site is built by a single entrypoint:

```powershell
python build_site.py
```

`build_site.py` runs every step (patch pages, tables, calendar, index, terrain,
hero lab, …) and writes output to `dist/`. `builders/build_patches.py`
auto-discovers `content/p*.py` modules and runs them in the chronological
order derived from `patch/meta.py` — there is no manual import list to edit.

## Step 1 — Register patch metadata

Add the new version to `patch/meta.py`:

- Append an entry to `PATCHES` (drives the nav dropdown).
- Append an entry to `RELEASE_HISTORY` with a `filename` field
  (drives chronological ordering and the build-discovery code).

## Step 2 — Fetch the full data snapshot

The strict CI manifest requires `data/stats/<version>/` to contain every
input that builders + audits consume. Refresh the JSON-derived files via
the fetch scripts in `scripts/fetch/`:

```powershell
python scripts/fetch/fetch_npc_history.py     # npc_units.json
python scripts/fetch/fetch_hero_history.py    # heroes_raw.json
python scripts/fetch/fetch_ability_history.py # npc_abilities.json
python scripts/fetch/fetch_itemlist.py        # itemlist.json
```

`data/stats/<version>/` must end up with this exact set of files
(otherwise the "latest patch coverage" audit in CI fails):

```
items.txt, items.json
units.json
npc_units.txt, npc_units.json
npc_abilities.txt, npc_abilities.json
npc_heroes.txt
heroes.json, heroes_raw.json
abilities.json, ability_ids.json
heroes/             ← npc_dota_hero_<slug>.txt per hero entry in heroes.json
```

The per-hero KV files in `heroes/` are checked against the hero list in
`heroes.json`; a single missing hero fails the build.

## Step 3 — Generate the scaffold + normalized JSON

```powershell
python generate_patch_code_v2.py 7.42
```

Produces two artifacts in one pass:

- `_generated_p_7.42_v2.py` — Python scaffold built on the `patch/` helper
  API (review and discard after saving as content).
- `data/normalized/patches/7.42.json` — structured per-change artifact
  (required by CI and consumed by `tools/validate_data.py`).

## Step 4 — Review and save as content

Save the reviewed scaffold body as `content/p742.py`. The minimal wrapper:

```python
from patch.api import *

def build():
    write_head("7.42", "DD.MM.YYYY")
    # ... generated body ...
    write_footer()
    save_html('patches/7.42.html')
```

`builders/build_patches.py` auto-discovers this file — **do not** add an
import anywhere.

Review checklist for the scaffold (auto-detector is right ~80% of the time):

- Tag direction (`t("BUFF")` / `t("NERF")` / `t("REWORK")` / `t("NEW")` /
  `t("DEL")` / `t("MISC")` / `t("QoL")`).
- `l=True` on cooldown / mana cost / BAT / penalty rows.
- Formula rows — `bf()` / `li_formula()` lambdas.
- New hero / item / ability slugs (see Step 5).

## Step 5 — Register new entities and verify icons

New hero or item with a slug that differs from its display name — add the
mapping in `patch/images.py`:

```python
HERO_SLUG["New Hero"] = "new_hero_slug"
ITEM_SLUG["New Item"] = "new_item_slug"
```

Confirm ability slugs against the authoritative source:

```powershell
python -c "import json; print(json.load(open('data/abilities_slim.json'))['<slug>'])"
```

A slug that does not exist in `abilities_slim.json` (the KV-derived
authoritative source per the `sloppy_kv_files_authoritative` convention) is
a real bug — do not work around it by copying another ability's PNG. If the
slug is real but Valve publishes no public CDN icon, add it to
`KNOWN_INNATE_NO_CDN_ICON` in `patch/known_exceptions.py`; the existing
fallback in `patch/elements.py` will render `innate_icon.png` directly.

Fetch any new icons that *do* exist on the CDN:

```powershell
python scripts/fetch/fetch_icons.py
```

## Step 6 — Build and run the gates

```powershell
python -m pytest tests -q
python build_site.py
python tools/validate_data.py
python scripts/audit/check_icons.py
python scripts/audit/audit_all.py
```

Open `dist/patches/7.42.html` in a browser and verify filters, per-level
expanders, icons, and that no Python exceptions surface during the build.

## Step 7 — Commit and deploy

Push to `main` after every gate is green.

## CI gates

Two workflows live in `.github/workflows/`:

- **`build.yml`** — runs on every push to `main` (and on PRs). Required
  before deploy: pytest, full `build_site.py`, minification verification,
  normalized-JSON validation, content-rule audits (tag direction, BAT
  `l=True`, trailing whitespace, ul balance), the strict current-patch
  manifest check, and `check_icons.py`. A failure here blocks the GitHub
  Pages deploy.
- **`audit-live.yml`** — runs on a daily schedule (and on
  `workflow_dispatch`). Performs `audit_all.py`, which makes ~128 live
  HTTP requests to `dota2.com/datafeed/...` to verify display names against
  Valve's live API. **Deliberately decoupled from the deploy path** — a
  Valve outage or rate limit must not block an otherwise-good deploy.

## Common errors

| Error | Cause |
|---|---|
| `RuntimeError: AoE Increase: missing local icon for ability slug …` | A referenced ability PNG isn't present under `icons/abilities/` and isn't on `KNOWN_INNATE_NO_CDN_ICON`. Restore the file or add it to the allowlist. |
| `Latest patch coverage FAILED for 7.42` | One of the required files in `data/stats/7.42/` is missing, or normalized JSON wasn't generated. See Step 2 + Step 3. |
| `KeyError` in `t()` | Unknown tag — only `BUFF`/`NERF`/`REWORK`/`MISC`/`QoL`/`NEW`/`DEL` are valid. |
| Filter doesn't catch a row | `data-tag` attribute missing — check the `b()` / `t()` call on the row. |
| Per-level table doesn't expand | `bf()` table not threaded through `extra=` on the `li()`. |
| BAT row tagged the wrong direction | Missing `l=True` on `b(old, new)`. |
