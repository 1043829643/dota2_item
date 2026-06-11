"""Build heroes_stats.html — the Hero Stats table (Materials sub-tab).

One row per hero, columns = base stats. Two view modes (the same View
dropdown as Neutral Creeps):
  * Standard — HP, MP, attributes (base + gain), armor, magic resistance,
    average damage, projectile speed, attack range, attack speed, BAT,
    move speed, turn rate, vision, collision size, bound radius.
  * Advanced — adds the COMPUTED level-1 columns (HP with Strength, MP with
    Intelligence, armor with Agility, magic resistance with Intelligence),
    the min–max damage column, and per-attribute "level 30" expanders
    (base + 29×gain — the flat +2-all level bonuses are NOT included).

Numeric cells backed by the per-patch scrape (data/stats/<patch>/heroes.json,
7.08 → today) carry the full change history as a `data-hist` hover tooltip
(same stat-hist-tip payload as Neutral Creeps / Mana Items, incl. the
overall first→today summary). Fields only present in the raw KV
(projectile speed, attack speed, turn rate, vision, collision, bound) come
from the LATEST data/stats/<ver>/npc_heroes.txt — snapshot only, no history.

Front-end is the mr-table stack reused wholesale (flat data-sort sorting,
heatmap via th[data-direction] + #mr-heatmap-toggle, #mr-search name filter,
stat-hist tooltips); page-specific JS = the View mode + expanders IIFE in
scripts.js ("HERO STATS").

Run AFTER build_patch.py (needs data/site_meta.json):
    python build_patch.py
    python build_heroes_stats.py
"""
from __future__ import annotations

import html as _html
import json as _json
import re as _re
from pathlib import Path

import site_common as _site

_HERE = Path(__file__).resolve().parent
STATS_DIR = _HERE / "data" / "stats"
ASSET_VERSION = _site.compute_asset_version()

_esc = lambda s: _html.escape(str(s), quote=True)

# ---- engine constants for the computed (Advanced) columns -----------------
# User-correctable. Current-patch values; the computed columns' HISTORY also
# uses these constants for past patches (the historical constants differed —
# noted in the page blurb).
HP_PER_STR = 22.0
MANA_PER_INT = 12.0
ARMOR_PER_AGI = 1 / 6          # 0.1667 armor per Agility point
MR_PER_INT = 0.1               # % magic resistance per Intelligence point


# ---------- patch ordering / dates ----------

def _patch_sort_key(v: str):
    parts = v.split(".")
    major = int(parts[0]) if parts[0].isdigit() else 0
    rest = parts[1] if len(parts) > 1 else "0"
    num, suf = "", ""
    for c in rest:
        if c.isdigit():
            num += c
        else:
            suf += c
    return (major, int(num or 0), suf)


def _load_patch_dates() -> dict[str, str]:
    meta = _HERE / "data" / "site_meta.json"
    try:
        return _json.loads(meta.read_text(encoding="utf-8")).get("patch_dates", {})
    except Exception:
        return {}


def _versions() -> list[str]:
    vers = [p.name for p in STATS_DIR.iterdir()
            if (p / "heroes.json").exists()]
    return sorted(vers, key=_patch_sort_key)


# ---------- hero identity ----------

_NAME_OVERRIDES = {
    "largo": "Largo",
}
_EXCLUDE = {"npc_dota_hero_base", "npc_dota_hero_target_dummy"}


def _load_display_names() -> dict[str, str]:
    out = {}
    try:
        data = _json.loads((_HERE / "data" / "herolist.json").read_text(encoding="utf-8"))
        for h in data["result"]["data"]["heroes"]:
            out[h["name"]] = h.get("name_english_loc") or h.get("name_loc") or h["name"]
    except Exception as exc:
        print(f"  ! herolist.json unreadable ({exc}) — falling back to slugs")
    return out


def _display_name(internal: str, names: dict[str, str]) -> str:
    if internal in names:
        return names[internal]
    slug = internal.replace("npc_dota_hero_", "")
    if slug in _NAME_OVERRIDES:
        return _NAME_OVERRIDES[slug]
    pretty = slug.replace("_", " ").title()
    print(f"  ! no display name for {internal} — using '{pretty}' "
          f"(add to _NAME_OVERRIDES)")
    return pretty


# ---------- per-patch field access (heroes.json) ----------

_NUM_RE = _re.compile(r"-?\d+(?:\.\d+)?")


def _to_float(v):
    """Robust numeric parse — old KV scrapes occasionally carry typo'd
    values like '21a' (Valve's own files). Take the leading number."""
    try:
        return float(v)
    except (TypeError, ValueError):
        m = _NUM_RE.search(str(v))
        return float(m.group(0)) if m else None


_FIELD_DEFAULTS = {
    "ArmorPhysical": -1, "AttackDamageMin": 0, "AttackDamageMax": 0,
    "AttackRate": 1.7, "AttackRange": 150, "MovementSpeed": 300,
    "AttributeBaseStrength": 0, "AttributeStrengthGain": 0,
    "AttributeBaseAgility": 0, "AttributeAgilityGain": 0,
    "AttributeBaseIntelligence": 0, "AttributeIntelligenceGain": 0,
    "StatusHealth": 120, "StatusMana": 75,
    "StatusHealthRegen": 0.25, "StatusManaRegen": 0,
    "MagicalResistance": 25,
}


def _field(snap: dict, hero: str, f: str):
    """Hero's value for field f in one patch snapshot, falling back to
    npc_dota_hero_base (the engine default block) and then to the static
    defaults table."""
    h = snap.get(hero) or {}
    if f in h:
        v = _to_float(h[f])
        if v is not None:
            return v
    base = snap.get("npc_dota_hero_base") or {}
    if f in base:
        v = _to_float(base[f])
        if v is not None:
            return v
    return float(_FIELD_DEFAULTS.get(f, 0))


_ATTR_META = {
    "DOTA_ATTRIBUTE_STRENGTH": ("str", "Strength", "strength.webp", 0),
    "DOTA_ATTRIBUTE_AGILITY":  ("agi", "Agility", "agility.webp", 1),
    "DOTA_ATTRIBUTE_INTELLECT": ("int", "Intelligence", "intelligence.webp", 2),
    "DOTA_ATTRIBUTE_ALL":      ("uni", "Universal", "universal.webp", 3),
}


def _attr_of(snap: dict, hero: str):
    raw = (snap.get(hero) or {}).get("AttributePrimary", "")
    return _ATTR_META.get(raw)


# ---------- raw KV (npc_heroes.txt, LATEST patch only — no history) ----------

# Hull name → collision radius (engine table; heroes are all _HERO = 24).
_HULL_RADIUS = {
    "DOTA_HULL_SIZE_HERO": 24, "DOTA_HULL_SIZE_REGULAR": 16,
    "DOTA_HULL_SIZE_SMALL": 8, "DOTA_HULL_SIZE_SIEGE": 16,
    "DOTA_HULL_SIZE_HUGE": 80, "DOTA_HULL_SIZE_BUILDING": 81,
}
_RAW_DEFAULTS = {
    "ProjectileSpeed": 900, "BaseAttackSpeed": 100, "MovementTurnRate": 0.6,
    "VisionDaytimeRange": 1800, "VisionNighttimeRange": 800, "RingRadius": 70,
    "BoundsHullName": "DOTA_HULL_SIZE_HERO", "MagicalResistance": 25,
}

def _load_raw_heroes(version: str) -> dict[str, dict]:
    """Raw-only hero fields for one patch, from the pre-parsed
    data/stats/<version>/heroes_raw.json (produced by
    scripts/fetch_hero_history.py from d2vpkr's historical npc_heroes.txt).
    Empty dict if that patch wasn't fetched yet."""
    path = STATS_DIR / version / "heroes_raw.json"
    if not path.exists():
        return {}
    try:
        return _json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"  ! {path} unreadable ({exc})")
        return {}


def _raw_field(raw: dict, hero: str, key: str):
    h = raw.get(hero) or {}
    if key in h:
        return h[key]
    base = raw.get("npc_dota_hero_base") or {}
    if key in base:
        return base[key]
    return _RAW_DEFAULTS.get(key)


def _raw_num(raw: dict, hero: str, key: str) -> float:
    v = _to_float(_raw_field(raw, hero, key))
    return v if v is not None else float(_RAW_DEFAULTS.get(key, 0))


# ---------- value formatting ----------

def _g(v: float) -> str:
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return s if s else "0"


def _g1(v: float) -> str:
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return s if s else "0"


# ---------- column model ----------
# (key, label, mode, pol, fmt, value_fn, display_fn, hist, raw)
#   mode:  'std' (always shown) | 'adv' (Expanded only)
#   value_fn(snap, hero, raw) -> float; display_fn(snap, hero, raw) -> HTML.
#   hist:  True → emit a per-patch change-history tooltip for the cell.
#   raw:   True → value comes from heroes_raw.json (vision/projectile/…), so
#          history iterates only the patches that carry it; False → from the
#          per-patch heroes.json (full 7.08→today coverage).

def _f(field):
    return lambda s, h, r: _field(s, h, field)


def _mk_attr_cols(short: str, label: str, base_f: str, gain_f: str):
    return [
        (f"{short}_base", label, "std", "hi", _g, _f(base_f), None, True, False),
        (f"{short}_gain", f"{label}/lvl", "std", "hi", _g, _f(gain_f), None, True, False),
        # Level-30 column — a plain Expanded column (revealed with the View
        # dropdown alongside the other Expanded columns).
        (f"{short}30", f"{label} 30", "adv", "hi", _g1,
         lambda s, h, r, b=base_f, g=gain_f:
             round(_field(s, h, b) + 29 * _field(s, h, g), 1),
         None, True, False),
    ]


def _dmg_avg(s, h, r):
    return (_field(s, h, "AttackDamageMin") + _field(s, h, "AttackDamageMax")) / 2


def _dmg_range(s, h, r):
    return f'{_g(_field(s, h, "AttackDamageMin"))}–{_g(_field(s, h, "AttackDamageMax"))}'


def _vision_disp(s, h, r):
    return (f'{_g(_raw_num(r, h, "VisionDaytimeRange"))}'
            f'<span class="hs-dim">/</span>'
            f'{_g(_raw_num(r, h, "VisionNighttimeRange"))}')


def _hp_l1(s, h, r):
    return round(_field(s, h, "StatusHealth")
                 + HP_PER_STR * _field(s, h, "AttributeBaseStrength"))


def _mp_l1(s, h, r):
    return round(_field(s, h, "StatusMana")
                 + MANA_PER_INT * _field(s, h, "AttributeBaseIntelligence"))


def _collision(s, h, r):
    return float(_HULL_RADIUS.get(str(_raw_field(r, h, "BoundsHullName")), 24))


COLUMNS = (
    [
        # HP/MP show the LEVEL-1 value directly (base 120 + Strength, base
        # mana + Intelligence) — every hero starts at 120 base HP so the bare
        # base is uninformative; the L1 value is what players read. History
        # still tracks every patch (it captures base-str / base-int changes).
        ("hp",   "HP",  "std", "hi", _g, _hp_l1, None, True, False),
        ("mana", "MP",  "std", "hi", _g, _mp_l1, None, True, False),
    ]
    + _mk_attr_cols("str", "STR", "AttributeBaseStrength", "AttributeStrengthGain")
    + _mk_attr_cols("agi", "AGI", "AttributeBaseAgility", "AttributeAgilityGain")
    + _mk_attr_cols("int", "INT", "AttributeBaseIntelligence", "AttributeIntelligenceGain")
    + [
        ("armor",    "Armor",       "std", "hi", _g, _f("ArmorPhysical"), None, True, False),
        ("armor_l1", "Armor lvl 1", "adv", "hi", _g1,
         lambda s, h, r: round(_field(s, h, "ArmorPhysical")
                               + ARMOR_PER_AGI * _field(s, h, "AttributeBaseAgility"), 1),
         None, True, False),
        ("mr",      "Magic Res %",  "std", "hi", _g, _f("MagicalResistance"), None, True, False),
        ("mr_l1",   "MR lvl 1 %",   "adv", "hi", _g1,
         lambda s, h, r: round(_field(s, h, "MagicalResistance")
                               + MR_PER_INT * _field(s, h, "AttributeBaseIntelligence"), 1),
         None, True, False),
        ("dmg",     "Damage",       "std", "hi", _g, _dmg_avg, None, True, False),
        ("dmg_mm",  "Min–Max",      "adv", "hi", _g, _dmg_avg, _dmg_range, True, False),
        ("ms",      "Move Speed",   "std", "hi", _g, _f("MovementSpeed"), None, True, False),
        ("aspd",    "Attack Speed", "std", "hi", _g,
         lambda s, h, r: _raw_num(r, h, "BaseAttackSpeed"), None, True, True),
        ("bat",     "BAT",          "std", "lo", _g, _f("AttackRate"), None, True, False),
        ("vision",  "Vision",       "std", "hi", _g,
         lambda s, h, r: _raw_num(r, h, "VisionDaytimeRange"), _vision_disp, True, True),
        ("proj",    "Projectile",   "std", "hi", _g,
         lambda s, h, r: _raw_num(r, h, "ProjectileSpeed"), None, True, True),
        ("range",   "Attack Range", "std", "hi", _g, _f("AttackRange"), None, True, False),
        ("turn",    "Turn Rate",    "std", "hi", _g,
         lambda s, h, r: _raw_num(r, h, "MovementTurnRate"), None, True, True),
        ("collision", "Collision",  "std", "lo", _g, _collision, None, True, True),
        ("bound",   "Bound Radius", "std", "lo", _g,
         lambda s, h, r: _raw_num(r, h, "RingRadius"), None, True, True),
    ]
)


# ---------- history ----------

def _col_history(snaps, versions, dates, hero, col, raws) -> str:
    """Per-patch change history for one hero×column. `raws` maps ver→raw
    dict; for `raw` columns the iteration restricts to versions that have
    raw data (the rest are heroes.json-backed and span every patch). The
    very first observed patch where the column has data and the hero exists
    is marked ADDED unless it's the earliest tracked patch."""
    key, label, mode, pol, fmt, value_fn, display_fn, hist, is_raw = col
    if not hist:
        return ""
    iter_versions = ([v for v in versions if raws.get(v)] if is_raw else versions)
    if not iter_versions:
        return ""
    parts = []
    prev_val = None
    prev_disp = None
    seen = False
    first_ver = iter_versions[0]
    for ver in iter_versions:
        snap = snaps[ver]
        if hero not in snap:
            continue
        rw = raws.get(ver, {})
        date = dates.get(ver, "")
        if not seen:
            seen = True
            if ver != first_ver:
                parts.append(f"{ver}|{date}|A|New hero")
            prev_val = value_fn(snap, hero, rw)
            prev_disp = display_fn(snap, hero, rw) if display_fn else None
            continue
        v = value_fn(snap, hero, rw)
        d = display_fn(snap, hero, rw) if display_fn else None
        if abs(v - prev_val) > 1e-9 or (d is not None and d != prev_disp):
            if display_fn and key == "vision":
                # Vision packs day/night; the sort value is daytime only, so a
                # % would be wrong (night-only changes show 0%). Show the
                # combined old → new with no percentage (kind N).
                po = _re.sub(r"<[^>]+>", "", prev_disp)
                dn = _re.sub(r"<[^>]+>", "", d)
                parts.append(f"{ver}|{date}|N|{po}|{dn}")
            elif display_fn:
                po = _re.sub(r"<[^>]+>", "", prev_disp)
                dn = _re.sub(r"<[^>]+>", "", d)
                parts.append(f"{ver}|{date}|C|{po}|{dn}|{prev_val:g}|{v:g}|{pol}")
            else:
                parts.append(f"{ver}|{date}|V|{fmt(prev_val)}|{fmt(v)}|{pol}")
            prev_val, prev_disp = v, d
    return ";".join(parts)


def _attr_history(snaps, versions, dates, hero) -> str:
    parts = []
    prev = None
    for ver in versions:
        snap = snaps[ver]
        if hero not in snap:
            continue
        meta = _attr_of(snap, hero)
        if meta is None:
            continue
        if prev is not None and meta[1] != prev:
            parts.append(f"{ver}|{dates.get(ver, '')}|N|{prev}|{meta[1]}")
        prev = meta[1]
    return ";".join(parts)


# ---------- render ----------

def _mode_cls(mode) -> str:
    return " hs-adv" if mode == "adv" else ""


def render_html() -> str:
    versions = _versions()
    dates = _load_patch_dates()
    snaps = {v: _json.loads((STATS_DIR / v / "heroes.json").read_text(encoding="utf-8"))
             for v in versions}
    raws = {v: _load_raw_heroes(v) for v in versions}
    latest = versions[-1]
    cur = snaps[latest]
    raw = raws[latest]
    names = _load_display_names()

    heroes = sorted(
        (h for h in cur if h.startswith("npc_dota_hero_") and h not in _EXCLUDE),
        key=lambda h: _display_name(h, names).lower())

    nav = _site.render_top_nav('materials', _latest_href(),
                               patch_context=False, subtabs_active='heroes_stats',
                               subnav_in_header=False)
    subnav = _site.render_materials_subnav('heroes_stats')

    # ---- header ----
    head = [
        f'<th class="mr-th hs-th hs-name sortable" data-col="name">'
        f'<span class="th-label">Hero</span><span class="sort-ind"></span></th>',
        f'<th class="mr-th hs-th hs-col-attr sortable" data-col="attr">'
        f'<span class="th-label">Attr</span><span class="sort-ind"></span></th>',
    ]
    for col in COLUMNS:
        key, label, mode, pol, *_rest = col
        direction = "lower" if pol == "lo" else "higher"
        head.append(
            f'<th class="mr-th hs-th hs-col-{key}{_mode_cls(mode)} sortable" '
            f'data-col="{key}" data-direction={direction}>'
            f'<span class="th-label">{label}</span>'
            f'<span class="sort-ind"></span></th>')
    thead = "".join(head)

    # ---- body ----
    body = []
    for hero in heroes:
        slug = hero.replace("npc_dota_hero_", "")
        name = _display_name(hero, names)
        icon = (f'<img class="mr-ico hs-ico" src="icons/heroes/{slug}.png" '
                f'alt="" loading="lazy">'
                if (_HERE / "icons" / "heroes" / f"{slug}.png").exists()
                else '<span class="mr-ico mr-ico-blank"></span>')
        cells = [
            f'<td class="mr-name hs-name" data-sort="{_esc(name)}">'
            f'{icon}<span class="mr-name-text">{_esc(name)}</span></td>'
        ]
        meta = _attr_of(cur, hero) or ("uni", "Universal", "universal.webp", 3)
        ah = _attr_history(snaps, versions, dates, hero)
        attr_attrs = (f' class="hs-attr-cell has-history" data-hist="{_esc(ah)}"'
                      if ah else ' class="hs-attr-cell"')
        cells.append(
            f'<td{attr_attrs} data-sort="{meta[3]}">'
            f'<img class="hs-attr-ico" src="icons/{meta[2]}" alt="{meta[1]}" '
            f'title="{meta[1]}" width="20" height="20"></td>')
        for col in COLUMNS:
            key, label, mode, pol, fmt, value_fn, display_fn, hist, is_raw = col
            v = value_fn(cur, hero, raw)
            disp = display_fn(cur, hero, raw) if display_fn else fmt(v)
            payload = _col_history(snaps, versions, dates, hero, col, raws)
            cls = f"hs-col-{key}{_mode_cls(mode)}"
            if payload:
                cells.append(
                    f'<td class="{cls} has-history" data-sort="{v}" '
                    f'data-net="" data-hist="{_esc(payload)}">{disp}</td>')
            else:
                cells.append(f'<td class="{cls}" data-sort="{v}">{disp}</td>')
        body.append(f'<tr data-slug="{slug}">{"".join(cells)}</tr>')

    table = (
        '<table class="mr-table hs-table sortable-table">'
        f'<thead><tr>{thead}</tr></thead>'
        f'<tbody>{"".join(body)}</tbody>'
        '</table>'
    )

    blurb = (
        '<p class="mr-blurb inbox-bar">Every hero with their base stats from the '
        f'game files (current patch <strong>{latest}</strong>). Hover any value for '
        'its full change history since 7.08 — patch by patch, with the overall '
        'first&#8201;→&#8201;today delta on top. The <strong>View</strong> dropdown '
        'switches to <em>Expanded</em>: computed level-1 columns (HP with Strength, '
        'MP with Intelligence, armor with Agility, magic resistance with '
        'Intelligence — today’s engine constants), the min–max damage spread, and '
        'the level-30 attribute columns (base + 29&nbsp;×&nbsp;gain; flat +2-all '
        'level bonuses not included). Vision / projectile / attack speed / '
        'turn rate / collision history goes back to 7.36 (when that data was '
        'first captured); everything else to 7.08. Click a column header to '
        'sort.</p>\n'
    )
    toolbar = (
        '<div class="cal-toggle-bar mr-toolbar inbox-bar"><div class="toolbar-panel">'
        '<span class="view-group">'
        '<strong>View</strong>'
        '<select class="cal-mode-select" id="hs-view-mode">'
        '<option value="standard">Standard</option>'
        '<option value="expanded">Expanded</option>'
        '</select>'
        '</span>'
        '<label class="ua-upgrades-toggle">'
        '<span class="ua-upgrades-label">Heatmap</span>'
        '<input type="checkbox" id="mr-heatmap-toggle" class="ua-switch-input">'
        '<span class="ua-switch" aria-hidden="true"></span>'
        '</label>'
        '<span class="search-box hd-search">'
        '<input type="text" id="mr-search" autocomplete="off" spellcheck="false" '
        'placeholder="Search heroes — axe, crystal, wisp…">'
        '</span>'
        '</div></div>\n'
    )

    return (
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n'
        '<title>SIKLE | Hero Stats</title>\n'
        + _site.favicon_links() +
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link rel="stylesheet" '
        'href="https://fonts.googleapis.com/css2?family=Jersey+10&family=Jersey+25&display=block">\n'
        f'<link rel="stylesheet" href="styles.css?v={ASSET_VERSION}">\n'
        '</head>\n<body>\n'
        f'{nav}\n'
        '<div class="container creeps-page">\n'
        '<div class="creeps-scroll">\n'
        f'{subnav}'
        f'{blurb}'
        f'{toolbar}'
        f'{table}\n'
        '</div>\n'
        '</div>\n'
        f'<script src="scripts.js?v={ASSET_VERSION}"></script>\n'
        '</body>\n</html>\n'
    )


def _latest_href() -> str:
    meta_path = _HERE / "data" / "site_meta.json"
    try:
        meta = _json.loads(meta_path.read_text(encoding="utf-8"))
        return meta.get("latest_patch_filename", "patches/7.41d.html")
    except Exception:
        return "patches/7.41d.html"


def main() -> int:
    html = render_html()
    out = _HERE / "heroes_stats.html"
    out.write_text(html, encoding="utf-8")
    n_rows = html.count("<tr data-slug=")
    print(f"  -> heroes_stats.html: {len(html):,} bytes ({n_rows} heroes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
