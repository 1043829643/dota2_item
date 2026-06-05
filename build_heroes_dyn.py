"""Build heroes_dyn.html — the Hero Dynamics matrix.

A matrix table: ROWS = every hero (icon + name, alphabetical), COLUMNS = every
patch (version + release date), and each CELL = that hero's patch-dynamics
"dyn-cell" for that patch (the same diamond-pill widget used on patch pages).
Lets you read at a glance how a hero was buffed/nerfed/reworked across the whole
patch history.

Data comes entirely from `_dynamics.json` (written by build_patch.py):
  - `patches`  : ordered newest-first list of {version, filename, date}
  - `entities` : per-entity tag tallies, keyed "hero|<slug>"
  - `heroes`   : full alphabetical roster [{name, icon, key}]

The coloured pills + tooltips are built client-side by scripts.js (dynBuildMatrix),
which reuses the exact same dyn-cell rendering as the patch pages — so this builder
only emits the table skeleton: marked data cells (the hero changed that patch) and
static empty diamonds (everything else).

Run AFTER build_patch.py (it needs the fresh _dynamics.json + site_meta.json):
    python build_patch.py
    python build_heroes_dyn.py
"""
import html as _html
import json as _json
import os as _os
import re as _re

import site_common as _site

_HERE = _os.path.dirname(_os.path.abspath(__file__))
ASSET_VERSION = _site.compute_asset_version()


def _esc(s):
    return _html.escape(str(s), quote=True)


def _base_version(ver):
    """Strip a trailing letter suffix: 7.41c → 7.41, 7.39e → 7.39, 7.08 → 7.08."""
    return _re.sub(r"[a-z]+$", "", ver)


def _latest_href():
    """Latest patch page href for the Changelogs nav tab (from site_meta.json)."""
    meta_path = _os.path.join(_HERE, "data", "site_meta.json")
    try:
        meta = _json.loads(open(meta_path, encoding="utf-8").read())
        return meta.get("latest_patch_filename", "patches/7.41c.html")
    except Exception:
        return "patches/7.41c.html"


def _load_manifest():
    with open(_os.path.join(_HERE, "_dynamics.json"), encoding="utf-8") as f:
        return _json.load(f)


def _hero_roster(manifest):
    """Full alphabetical hero list as [{name, icon, key}]. Prefer the explicit
    roster build_patch.py writes; fall back to deriving it from the hero
    entities if an older _dynamics.json is in place."""
    roster = manifest.get("heroes")
    if roster:
        return sorted(roster, key=lambda h: h["name"].lower())
    derived = []
    for key, rec in manifest.get("entities", {}).items():
        if rec.get("kind") != "hero":
            continue
        name = rec.get("name", key.split("|", 1)[-1])
        icon = rec.get("icon", name.lower().replace(" ", "_")
                        .replace("'", "").replace("-", ""))
        derived.append({"name": name, "icon": icon, "key": key})
    return sorted(derived, key=lambda h: h["name"].lower())


def save_heroes_dyn_html():
    manifest = _load_manifest()
    # Columns: every patch, OLDEST on the left → NEWEST on the right (so the
    # latest patch is the rightmost column; scripts.js keeps it flush right).
    patches = list(reversed(manifest.get("patches", [])))
    entities = manifest.get("entities", {})
    heroes = _hero_roster(manifest)

    nav = _site.render_top_nav('materials', _latest_href(),
                               patch_context=False, subtabs_active='heroes_dyn',
                               subnav_in_header=False)
    subnav = _site.render_materials_subnav('heroes_dyn')

    # ---- super-category row: base version spanning its lettered variants ----
    # Patches are oldest→newest, so variants of one base (7.41, 7.41a, 7.41b,
    # 7.41c) are consecutive. A base with >1 patch gets a spanning header
    # labelled with the bare version; a base with a single patch (no letters)
    # gets an empty cell — no super-label. scripts.js dynLayoutMatrix recomputes
    # the colspans to the VISIBLE columns after the fit-to-width hide.
    groups = []                      # [(base, [patch, ...]), ...] in column order
    for p in patches:
        b = _base_version(p["version"])
        if groups and groups[-1][0] == b:
            groups[-1][1].append(p)
        else:
            groups.append((b, [p]))
    # First patch version of each base group EXCEPT the first group → gets a
    # full-height vertical divider on its left (separates super-categories, like
    # the category dividers on Neutral Creeps). The first group abuts the Hero
    # divider already, so it's skipped.
    gsep_vers = {ps[0]["version"] for gi, (base, ps) in enumerate(groups) if gi > 0}
    supercat_cells = [
        # sits over the frozen Hero column (sticky, empty, carries the divider)
        '<th class="cat-head hd-hero-cat sticky-col" aria-hidden="true"></th>'
    ]
    for base, ps in groups:
        if len(ps) > 1:
            supercat_cells.append(
                f'<th class="cat-head hd-supercat" colspan="{len(ps)}" '
                f'data-base="{_esc(base)}">{_esc(base)}</th>')
        else:
            supercat_cells.append(
                f'<th class="cat-head hd-supercat hd-supercat-solo" '
                f'data-base="{_esc(base)}" aria-hidden="true"></th>')
    # Trailing spacer column (fills the right hover-pop gutter as a clipped
    # empty-column piece — see styles.css .hd-spacer).
    supercat_cells.append('<th class="cat-head hd-spacer" aria-hidden="true"></th>')
    supercat_html = "".join(supercat_cells)

    # ---- column row: Hero | <version> per patch (release date on hover) ----
    # Which patches are visible (and the latest-flush-right fit) is decided at
    # runtime by scripts.js dynLayoutMatrix() — it depends on the viewport width.
    head_cells = ['<th class="hd-hero sortable sticky-col" data-col="name" '
                  'data-idx="0">Hero<span class="sort-ind"></span></th>']
    for p in patches:
        sep = ' hd-gsep' if p["version"] in gsep_vers else ''
        head_cells.append(
            f'<th class="hd-patch{sep}" tabindex="0" '
            f'data-base="{_esc(_base_version(p["version"]))}" '
            f'data-tooltip="{_esc(p["date"])}">{_esc(p["version"])}</th>')
    head_cells.append('<th class="hd-spacer" aria-hidden="true"></th>')
    head_html = "".join(head_cells)

    # ---- body: one row per hero ----
    rows = []
    for h in heroes:
        key = h["key"]
        slug = key.split("|", 1)[-1]
        eid = f"dyn-hero-{slug}"
        per_patch = (entities.get(key, {}) or {}).get("patches", {})
        img = (f'<img src="icons/heroes/{_esc(h["icon"])}.png" '
               f'alt="{_esc(h["name"])}" loading="lazy">')
        cells = [
            f'<td class="hd-hero sticky-col" data-col="name" '
            f'data-sort="{_esc(h["name"])}">'
            f'<span class="hd-hero-inner">{img}'
            f'<span class="hd-hero-name">{_esc(h["name"])}</span></span></td>'
        ]
        for p in patches:
            ver = p["version"]
            sep = ' hd-gsep' if ver in gsep_vers else ''
            counts = per_patch.get(ver)
            if counts:
                # Touched this patch → JS fills a coloured pill.
                cells.append(
                    f'<td class="hd-cell{sep}" data-ver="{_esc(ver)}" '
                    f'data-hkey="{_esc(key)}" data-eid="{_esc(eid)}"></td>')
            else:
                # Untouched → static empty diamond (CSS ::after).
                cells.append(f'<td class="hd-cell hd-empty{sep}"></td>')
        cells.append('<td class="hd-cell hd-empty hd-spacer"></td>')
        rows.append(f'<tr>{"".join(cells)}</tr>')

    # Toggles — styled like the Neutral Creeps / Unit Abilities switches.
    def _switch(sw_id, label, title, checked):
        ck = ' checked' if checked else ''
        return (f'<label class="ua-upgrades-toggle" title="{_esc(title)}">'
                f'<span class="ua-upgrades-label">{label}</span>'
                f'<input type="checkbox" id="{sw_id}" class="ua-switch-input"{ck}>'
                f'<span class="ua-switch" aria-hidden="true"></span></label>')
    # "Remove" tag chips — click a tag to drop it from the diamonds (sinks +
    # greys out). Same badges as the patch pages. Order matches DYN_TAG_ORDER.
    _TAG_CHIPS = [
        ('buff', 'buff-text', 'BUFF'), ('nerf', 'nerf-text', 'NERF'),
        ('new', 'new', 'NEW'), ('del', 'del', 'DEL'),
        ('rework', 'rework', 'REWORK'), ('misc', 'misc', 'MISC'),
        ('qol', 'qol', 'QoL'),
    ]
    tag_chips = ''.join(
        f'<button type="button" class="badge {cls} hd-tag" data-tag="{tag}">{label}</button>'
        for tag, cls, label in _TAG_CHIPS)
    remove_block = (
        '<span class="hd-remove-group" '
        'title="Click a tag to drop it from the diamonds (hover still shows it)">'
        '<strong>Remove</strong>' + tag_chips + '</span>')
    search_block = (
        '<span class="search-box hd-search">'
        '<input type="text" id="hd-hero-search" autocomplete="off" spellcheck="false" '
        'placeholder="Search heroes — anci, aba, brood…">'
        '</span>')
    toolbar = (
        '<div class="cal-toggle-bar inbox-bar hd-toolbar">'
        + _switch('hd-hide-old', 'Hide old',
                  'Show only the most recent patches that fit the width '
                  '(latest at the right edge); off shows every patch', True)
        + _switch('hd-bn-only', 'Buff/nerf only',
                  'Fill cells with buff/nerf colours only — NEW counts as buff, '
                  'DEL as nerf (hover still shows every tag)', False)
        + remove_block
        + search_block
        + '</div>\n')

    page = (
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n'
        '<title>SIKLE | Hero Dynamics</title>\n'
        + _site.favicon_links() +
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link rel="stylesheet" '
        'href="https://fonts.googleapis.com/css2?family=Jersey+10&family=Jersey+25&display=block">\n'
        f'<link rel="stylesheet" href="styles.css?v={ASSET_VERSION}">\n'
        '</head>\n'
        # data-dyn-path tells scripts.js where to fetch the manifest from (this
        # page is at site root, patch pages are under /patches/ and use ../).
        '<body data-dyn-path="_dynamics.json">\n'
        f'{nav}\n'
        '<div class="container creeps-page hd-page">\n'
        '<div class="sticky-frame" aria-hidden="true"></div>\n'
        '<div class="sticky-frame-top" aria-hidden="true"></div>\n'
        '<div class="creeps-scroll">\n'
        f'{subnav}'
        '<p class="mr-blurb inbox-bar">Every hero down the side, every patch '
        'across the top. Each diamond is that hero’s balance-change summary '
        'for that patch — hover it for the buff/nerf/rework breakdown, click '
        'to jump to the hero on that patch page. Hover a patch column for its '
        'release date. Empty diamonds mean the hero was untouched. '
        '<strong>Remove</strong> drops any tag from the diamonds (it still shows '
        'on hover); the <strong>search</strong> box filters heroes by name — '
        'comma-separate for several (partial names work: <em>anci, aba, brood</em>).</p>\n'
        f'{toolbar}'
        # Column visibility + fit-to-width is set by scripts.js dynLayoutMatrix().
        '<table class="creeps-table heroes-dyn-table">\n'
        f'<thead><tr class="cat-row">{supercat_html}</tr>'
        f'<tr class="col-row">{head_html}</tr></thead>\n'
        f'<tbody>\n{chr(10).join(rows)}\n</tbody>\n'
        '</table>\n</div>\n</div>\n'
        f'<script src="scripts.js?v={ASSET_VERSION}"></script>\n'
        '</body>\n</html>\n'
    )
    out = _os.path.join(_HERE, "heroes_dyn.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    print(f"  -> heroes_dyn.html: {len(page):,} bytes "
          f"({len(heroes)} heroes x {len(patches)} patches)")


if __name__ == "__main__":
    save_heroes_dyn_html()
