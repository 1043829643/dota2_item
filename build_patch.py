#!/usr/bin/env python3
"""Generate annotated Dota 2 7.41c patch notes HTML."""

# ---------- IMAGE URL HELPERS ----------

HERO_CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/"
ITEM_CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/"
ABIL_CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/"

HERO_SLUG = {
    "Abaddon": "abaddon", "Alchemist": "alchemist",
    "Ancient Apparition": "ancient_apparition", "Anti-Mage": "antimage",
    "Arc Warden": "arc_warden", "Bane": "bane", "Batrider": "batrider",
    "Beastmaster": "beastmaster", "Bounty Hunter": "bounty_hunter",
    "Brewmaster": "brewmaster", "Bristleback": "bristleback",
    "Broodmother": "broodmother", "Centaur Warrunner": "centaur",
    "Chaos Knight": "chaos_knight", "Dark Seer": "dark_seer",
    "Dark Willow": "dark_willow", "Dawnbreaker": "dawnbreaker",
    "Doom": "doom_bringer", "Drow Ranger": "drow_ranger",
    "Earth Spirit": "earth_spirit", "Elder Titan": "elder_titan",
    "Ember Spirit": "ember_spirit", "Faceless Void": "faceless_void",
    "Gyrocopter": "gyrocopter", "Hoodwink": "hoodwink", "Huskar": "huskar",
    "Invoker": "invoker", "Io": "wisp", "Jakiro": "jakiro",
    "Juggernaut": "juggernaut", "Keeper of the Light": "keeper_of_the_light",
    "Kunkka": "kunkka", "Largo": "largo", "Lich": "lich", "Lina": "lina",
    "Lone Druid": "lone_druid", "Lycan": "lycan", "Magnus": "magnataur",
    "Marci": "marci", "Mars": "mars", "Mirana": "mirana",
    "Monkey King": "monkey_king", "Morphling": "morphling", "Muerta": "muerta",
    "Nature's Prophet": "furion", "Ogre Magi": "ogre_magi",
    "Omniknight": "omniknight", "Outworld Destroyer": "obsidian_destroyer",
    "Pangolier": "pangolier", "Phantom Assassin": "phantom_assassin",
    "Phantom Lancer": "phantom_lancer", "Phoenix": "phoenix",
    "Primal Beast": "primal_beast", "Puck": "puck",
    "Queen of Pain": "queenofpain", "Razor": "razor", "Rubick": "rubick",
    "Sand King": "sand_king", "Shadow Fiend": "nevermore",
    "Skywrath Mage": "skywrath_mage", "Slardar": "slardar",
    "Snapfire": "snapfire", "Spectre": "spectre", "Storm Spirit": "storm_spirit",
    "Sven": "sven", "Techies": "techies", "Templar Assassin": "templar_assassin",
    "Tidehunter": "tidehunter", "Timbersaw": "shredder", "Tinker": "tinker",
    "Tiny": "tiny", "Treant Protector": "treant", "Troll Warlord": "troll_warlord",
    "Tusk": "tusk", "Vengeful Spirit": "vengefulspirit", "Venomancer": "venomancer",
    "Viper": "viper", "Weaver": "weaver", "Windranger": "windrunner",
    "Winter Wyvern": "winter_wyvern", "Witch Doctor": "witch_doctor",
}

ITEM_SLUG = {
    "Bloodstone": "bloodstone",
    "Boots of Bearing": "boots_of_bearing",
    "Crella's Crozier": "crellas_crozier",
    "Disperser": "disperser",
    "Essence Distiller": "essence_distiller",
    "Harpoon": "harpoon",
    "Heart of Tarrasque": "heart",
    "Mage Slayer": "mage_slayer",
    "Shiva's Guard": "shivas_guard",
    "Silver Edge": "silver_edge",
    "Soul Ring": "soul_ring",
    "Specialist's Array": "specialists_array",
}


def hero_img(name):
    slug = HERO_SLUG.get(name, name.lower().replace(" ", "_").replace("'", ""))
    return f"{HERO_CDN}{slug}.png"


def item_img(name):
    slug = ITEM_SLUG.get(name, name.lower().replace(" ", "_").replace("'", ""))
    return f"{ITEM_CDN}{slug}.png"


# ---------- BADGE HELPERS ----------

def gradient_class(magnitude, is_buff):
    """10-tier gradient based on absolute %. Covers 0-100%+ smoothly."""
    prefix = "buff" if is_buff else "nerf"
    if magnitude == 0:
        return "neutral"
    if magnitude <= 5:    return f"{prefix}1"
    if magnitude <= 10:   return f"{prefix}2"
    if magnitude <= 15:   return f"{prefix}3"
    if magnitude <= 20:   return f"{prefix}4"
    if magnitude <= 25:   return f"{prefix}5"
    if magnitude <= 33:   return f"{prefix}6"
    if magnitude <= 45:   return f"{prefix}7"
    if magnitude <= 60:   return f"{prefix}8"
    if magnitude <= 80:   return f"{prefix}9"
    return f"{prefix}10"


def b(old, new, l=False):
    """Generate per-level badges. old/new can be scalar or list.
    l=True means lower-is-buff (cooldowns, mana costs, penalties).
    If all per-level badges turn out identical, collapses to a single badge.
    Determines OVERALL buff/nerf tag for filtering:
      - avg of signed per-level %s; sign decides
      - if avg rounds to 0 → use last non-zero level"""
    if not isinstance(old, (list, tuple)):
        old = [old]
    if not isinstance(new, (list, tuple)):
        new = [new]
    if len(old) == 1 and len(new) > 1:
        old = old * len(new)
    if len(new) == 1 and len(old) > 1:
        new = new * len(old)

    parts = []
    keys = []
    signed_pcts = []
    for o, n in zip(old, new):
        if o == 0 or n == o:
            parts.append('<span class="badge neutral">0%</span>')
            keys.append(("neutral", "0%"))
            signed_pcts.append(0)
            continue
        raw = (n - o) / o * 100
        pct = round(raw)
        if pct == 0:
            parts.append('<span class="badge neutral">0%</span>')
            keys.append(("neutral", "0%"))
            signed_pcts.append(0)
            continue
        is_buff = (n < o) if l else (n > o)
        magnitude = abs(pct)
        signed_pcts.append(magnitude if is_buff else -magnitude)
        sign = "+" if is_buff else "-"
        cls = gradient_class(magnitude, is_buff)
        display = f"{sign}{magnitude}%"
        parts.append(f'<span class="badge {cls}">{display}</span>')
        keys.append((cls, display))

    # Determine overall tag
    overall = ""
    if signed_pcts:
        avg = sum(signed_pcts) / len(signed_pcts)
        if round(avg) > 0:
            overall = "buff"
        elif round(avg) < 0:
            overall = "nerf"
        else:
            # avg ≈ 0 — fall back to last non-zero
            for v in reversed(signed_pcts):
                if v > 0:
                    overall = "buff"
                    break
                if v < 0:
                    overall = "nerf"
                    break

    # Collapse if every level produced an identical badge
    if len(keys) > 1 and len(set(keys)) == 1:
        parts = [parts[0]]

    overall_attr = f' data-overall="{overall}"' if overall else ""
    return f'<span class="badge-group"{overall_attr}>' + "".join(parts) + "</span>"


def br(old_min, old_max, new_min, new_max, l=False):
    """Damage range (min-max). Computes single % from midpoint average.
    Use this for 'Damage at level 1: 51-57 to 52-58' style lines."""
    old_avg = (old_min + old_max) / 2
    new_avg = (new_min + new_max) / 2
    return b(old_avg, new_avg, l=l)


def _compute_pct(old_v, new_v, l):
    """Return (cls, display, signed_pct, overall_tag)."""
    if old_v == 0 or new_v == old_v:
        return ("neutral", "0%", 0, "")
    raw = (new_v - old_v) / old_v * 100
    pct = round(raw)
    if pct == 0:
        return ("neutral", "0%", 0, "")
    is_buff = (new_v < old_v) if l else (new_v > old_v)
    magnitude = abs(pct)
    sign = "+" if is_buff else "-"
    cls = gradient_class(magnitude, is_buff)
    return (cls, f"{sign}{magnitude}%", magnitude if is_buff else -magnitude,
            "buff" if is_buff else "nerf")


_formula_id_counter = [0]

def fold(text):
    """Wrap an OLD formula in a span with subtle dotted underline (visual reference only)."""
    return f'<span class="formula-old">{text}</span>'


def bf(old_fn, new_fn, formula_text, levels=None, l=False, value_fmt="{:g}"):
    """Formula-based change. Returns (trigger_html, badge_html, table_html).
    The trigger wraps formula_text as a clickable pill that toggles the table.
    Tag is determined by LEVEL 1 (per user spec).
    levels: list of int levels to show; defaults to L1-15 + L20, L25, L30.
            Can also pass an int N → range(1, N+1).
    value_fmt: format string for level values (e.g. '{:.2f}%' or '{:g}')."""
    if levels is None:
        levels = list(range(1, 16)) + [20, 25, 30]
    elif isinstance(levels, int):
        levels = list(range(1, levels + 1))

    _formula_id_counter[0] += 1
    fid = f"f{_formula_id_counter[0]}"

    # Level 1 inline badge
    cls1, disp1, _, overall1 = _compute_pct(old_fn(1), new_fn(1), l)
    overall_attr = f' data-overall="{overall1}"' if overall1 else ""
    badge = f'<span class="badge-group"{overall_attr}><span class="badge {cls1}">{disp1}</span></span>'

    # Trigger
    trigger = f'<span class="formula-trigger" data-formula="{fid}">{formula_text}</span>'

    # Mark boundary class on first level >= 20 (visual jump from L15 → L20)
    def cls_for(L):
        return ' class="lvl-jump"' if L == 20 else ''

    head_cells = "".join(f'<th{cls_for(L)}>L{L}</th>' for L in levels)
    old_cells = "".join(f'<td{cls_for(L)}>{value_fmt.format(old_fn(L))}</td>' for L in levels)
    new_cells = "".join(f'<td{cls_for(L)}>{value_fmt.format(new_fn(L))}</td>' for L in levels)
    pct_cells = []
    for L in levels:
        cls, disp, _, _ = _compute_pct(old_fn(L), new_fn(L), l)
        pct_cells.append(f'<td{cls_for(L)}><span class="badge {cls}">{disp}</span></td>')

    table = (
        f'<table class="formula-table" id="{fid}" hidden>'
        f'<thead><tr><th></th>{head_cells}</tr></thead>'
        f'<tbody>'
        f'<tr><th class="row-label-old">old</th>{old_cells}</tr>'
        f'<tr><th class="row-label-new">new</th>{new_cells}</tr>'
        f'<tr><th>Δ %</th>{"".join(pct_cells)}</tr>'
        f'</tbody>'
        f'</table>'
    )

    return trigger, badge, table


def t(tag):
    """Text-only tag for non-numeric changes."""
    cls_map = {
        "BUFF":   ("buff-text", "buff"),
        "NERF":   ("nerf-text", "nerf"),
        "REWORK": ("rework",    "rework"),
        "MISC":   ("misc",      "misc"),
        "QoL":    ("qol",       "qol"),
    }
    color_cls, tag_id = cls_map[tag]
    return f'<span class="badge {color_cls}" data-tag="{tag_id}">{tag}</span>'


# ---------- HTML BUILDING ----------

class _State:
    block_open = False

def _open_block():
    s = ('</div>\n' if _State.block_open else '') + '<div class="entity-block">\n'
    _State.block_open = True
    return s

def _close_block():
    if _State.block_open:
        _State.block_open = False
        return '</div>\n'
    return ''


def hero_header(name):
    return _open_block() + f'''<div class="entity hero-entity">
  <div class="entity-icon hero-icon"><img src="{hero_img(name)}" alt="{name}" loading="lazy"></div>
  <div class="entity-name">{name}</div>
</div>'''


def unit_header(name, icon_url):
    """Header for a separate summoned unit (e.g. Spirit Bear) with custom icon URL."""
    return _open_block() + f'''<div class="entity hero-entity">
  <div class="entity-icon ability-icon"><img src="{icon_url}" alt="{name}" loading="lazy"></div>
  <div class="entity-name">{name}</div>
</div>'''


def item_header(name):
    return _open_block() + f'''<div class="entity item-entity">
  <div class="entity-icon item-icon"><img src="{item_img(name)}" alt="{name}" loading="lazy"></div>
  <div class="entity-name">{name}</div>
</div>'''


def plain_header(name):
    return _open_block() + f'<div class="entity plain-entity"><div class="entity-name">{name}</div></div>'


def section(title):
    return _close_block() + f'<h2 class="section">{title}</h2>'


def subgroup(title):
    return f'<h4 class="subgroup">{title}</h4>'


def ability(title):
    return f'<h4 class="ability-title">{title}</h4>'


def ul_open():
    return '<ul class="changes">'


def ul_close():
    return '</ul>'


import re

def li(text, badge="", extra="", force_tag=None):
    """Generate <li>. Auto-extracts data-tag from badges for filtering.
    Priority: force_tag > data-overall > data-tag (text tags) > buff*/nerf* class scan.
    extra: optional HTML appended inside the li (e.g. correction note)."""
    if force_tag is not None:
        tag_str = force_tag
    else:
        tags = set()
        overalls = re.findall(r'data-overall="(\w+)"', badge)
        for o in overalls:
            tags.add(o)
        for tag_id in re.findall(r'data-tag="(\w+)"', badge):
            tags.add(tag_id)
        if not overalls:
            for cls in re.findall(r'badge (buff|nerf)\d+', badge):
                tags.add(cls)
        tag_str = " ".join(sorted(tags))
    attr = f' data-tag="{tag_str}"' if tag_str else ""
    return f'<li{attr}>{text} {badge}{extra}</li>'


def subnote(text):
    return f'<ul class="subnotes"><li>{text}</li></ul>'


# ---------- CSS ----------

CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #0a0e13;
  background-image:
    radial-gradient(at 20% 0%, rgba(179, 45, 35, 0.08) 0, transparent 50%),
    radial-gradient(at 80% 100%, rgba(255, 100, 50, 0.05) 0, transparent 50%);
  background-attachment: fixed;
  color: #c9d1d9;
  font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.55;
  font-size: 15px;
  min-height: 100vh;
}

.container {
  max-width: 1080px;
  margin: 0 auto;
  padding: 32px 28px 80px;
}

/* PAGE HEAD */
header.page-head {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding: 14px 0 6px;
  margin-bottom: 16px;
}
header.page-head .release-date {
  color: #8b949e;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.3px;
}
header.page-head .version {
  color: #c9d1d9;
  font-size: 26px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
  background: rgba(48, 54, 61, 0.45);
  border: 1px solid #30363d;
  padding: 4px 14px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s ease;
}
header.page-head .version:hover {
  background: rgba(48, 54, 61, 0.7);
  border-color: #58a6ff;
}
header.page-head .version-chev {
  font-size: 14px;
  color: #8b949e;
  line-height: 1;
  margin-top: 2px;
  font-weight: 600;
}

/* VERSION DROPDOWN MENU */
.version-dropdown {
  position: relative;
  display: inline-block;
}
.version-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 180px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  padding: 6px;
  display: none;
  z-index: 100;
}
.version-menu.open {
  display: block;
}
.version-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 4px;
  text-decoration: none;
  color: #c9d1d9;
  font-size: 14px;
  transition: background 0.12s ease;
}
.version-item:hover {
  background: #21262d;
}
.version-item.current {
  background: rgba(88, 166, 255, 0.10);
  color: #58a6ff;
  cursor: default;
  pointer-events: none;
}
.version-item .vi-name {
  font-weight: 700;
  letter-spacing: 0.3px;
}
.version-item .vi-date {
  color: #6e7681;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  margin-left: 14px;
}
.version-item.current .vi-date {
  color: rgba(88, 166, 255, 0.6);
}

/* LEGEND */
.legend {
  background: #161b22;
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 28px;
  border: 1px solid #30363d;
  font-size: 13px;
  color: #8b949e;
}
.legend-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.legend-tags strong {
  color: #c9d1d9;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-right: 4px;
}

/* SEARCH BOX */
.search-box {
  position: relative;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #21262d;
}
.search-box input {
  width: 100%;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 7px 12px;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 13px;
  transition: border-color 0.15s;
}
.search-box input::placeholder { color: #6e7681; }
.search-box input:focus {
  outline: none;
  border-color: #58a6ff;
  box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.2);
}
.search-results {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  margin-top: 4px;
  max-height: 320px;
  overflow-y: auto;
  z-index: 50;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
}
.search-results.show { display: block; }
.search-results .result-item {
  padding: 6px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #c9d1d9;
  border-bottom: 1px solid #21262d;
}
.search-results .result-item:last-child { border-bottom: none; }
.search-results .result-item:hover,
.search-results .result-item.active {
  background: rgba(88, 166, 255, 0.1);
  color: #fff;
}
.search-results .result-item img {
  width: 32px;
  height: 18px;
  object-fit: cover;
  border-radius: 2px;
  background: #21262d;
  flex-shrink: 0;
}
.search-results .result-item .kind {
  margin-left: auto;
  font-size: 10.5px;
  color: #6e7681;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.search-results .empty {
  padding: 10px 12px;
  color: #8b949e;
  font-style: italic;
  font-size: 12.5px;
}
.search-results mark {
  background: rgba(240, 198, 116, 0.25);
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
}

/* MAJOR SECTION */
h2.section {
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.45) 0%, transparent 18%, transparent 82%, rgba(0, 0, 0, 0.45) 100%),
    linear-gradient(180deg, #b53528 0%, #4a120c 100%);
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  padding: 12px 18px;
  margin: 36px 0 20px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 -1px 0 rgba(0, 0, 0, 0.4),
    0 2px 8px rgba(0, 0, 0, 0.4);
  text-shadow:
    1px 1px 0 rgba(0, 0, 0, 0.55),
    -1px 0 0 rgba(0, 0, 0, 0.35),
    0 -1px 0 rgba(0, 0, 0, 0.3),
    0 0 8px rgba(0, 0, 0, 0.5);
}

/* ENTITY (HERO/ITEM HEADER WITH ICON) */
.entity {
  display: flex;
  align-items: center;
  gap: 14px;
  background: linear-gradient(90deg, #1a1f29 0%, #161b22 100%);
  border-left: 3px solid #f0c674;
  border-radius: 4px;
  padding: 8px 14px;
  margin: 20px 0 8px;
}
.entity-name {
  color: #f0c674;
  font-size: 19px;
  font-weight: 700;
}
.entity-icon img {
  display: block;
  border-radius: 3px;
}
.hero-icon img {
  width: 80px;
  height: 45px;
  object-fit: cover;
}
.item-icon img {
  width: 50px;
  height: 36px;
  object-fit: cover;
}
.ability-icon img {
  width: 45px;
  height: 45px;
  object-fit: cover;
  border-radius: 4px;
}
.plain-entity {
  border-left-color: #79c0ff;
}
.plain-entity .entity-name {
  color: #79c0ff;
}

/* SUBGROUPS */
h4.subgroup {
  color: #79c0ff;
  font-size: 14px;
  font-weight: 700;
  margin: 16px 0 4px 14px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  border-bottom: 1px solid #21262d;
  padding-bottom: 4px;
}
h4.ability-title {
  color: #d2a8ff;
  font-size: 15px;
  font-weight: 600;
  margin: 12px 0 4px 14px;
}

/* CHANGES LIST */
ul.changes {
  list-style: none;
  margin: 4px 0 4px 30px;
}
ul.changes li {
  padding: 4px 0;
  color: #c9d1d9;
}
ul.subnotes {
  list-style: none;
  margin: -2px 0 6px 50px;
}
ul.subnotes li {
  color: #8b949e;
  font-size: 13.5px;
  padding: 2px 0;
}
ul.subnotes li::before { content: "↳ "; color: #6e7681; }

/* BADGES */
.badge-group {
  display: inline-flex;
  gap: 3px;
  margin-left: 6px;
  flex-wrap: wrap;
  vertical-align: middle;
}
.badge {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  vertical-align: middle;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  margin-left: 4px;
}
.badge-group .badge { margin-left: 0; }

/* NEUTRAL & TEXT TAGS */
.badge.neutral {
  background: rgba(139, 148, 158, 0.12);
  color: #8b949e;
  border: 1px solid rgba(139, 148, 158, 0.3);
}
.badge.rework {
  background: rgba(180, 145, 220, 0.07);
  color: #9988aa;
  border: 1px solid rgba(180, 145, 220, 0.22);
}
.badge.misc {
  background: rgba(139, 148, 158, 0.10);
  color: #8b949e;
  border: 1px solid rgba(139, 148, 158, 0.28);
}
.badge.qol {
  background: rgba(121, 192, 255, 0.10);
  color: #a8c0d8;
  border: 1px solid rgba(121, 192, 255, 0.32);
}

/* BUFF GRADIENT (10 tiers, soft-saturated greens) */
.badge.buff1  { background: rgba(120, 215, 145, 0.10); color: #b2d8b8; border: 1px solid rgba(120, 215, 145, 0.26); }
.badge.buff2  { background: rgba(115, 215, 140, 0.13); color: #b4dab6; border: 1px solid rgba(115, 215, 140, 0.32); }
.badge.buff3  { background: rgba(110, 215, 135, 0.17); color: #b2dab2; border: 1px solid rgba(110, 215, 135, 0.38); }
.badge.buff4  { background: rgba(105, 215, 130, 0.22); color: #aedaa8; border: 1px solid rgba(105, 215, 130, 0.44); }
.badge.buff5  { background: rgba(95, 210, 125, 0.27);  color: #a8d6a0; border: 1px solid rgba(95, 210, 125, 0.50); }
.badge.buff6  { background: rgba(85, 205, 115, 0.32);  color: #a4d496; border: 1px solid rgba(85, 205, 115, 0.55); }
.badge.buff7  { background: rgba(75, 200, 105, 0.36);  color: #9cd28a; border: 1px solid rgba(75, 200, 105, 0.60); }
.badge.buff8  { background: rgba(65, 195, 95, 0.40);   color: #94d07c; border: 1px solid rgba(65, 195, 95, 0.65); }
.badge.buff9  { background: rgba(55, 190, 85, 0.45);   color: #88cc6e; border: 1px solid rgba(55, 190, 85, 0.70); }
.badge.buff10 { background: rgba(45, 185, 75, 0.50);   color: #7ec862; border: 1px solid rgba(45, 185, 75, 0.78); }

/* NERF GRADIENT (10 tiers, soft-saturated reds) */
.badge.nerf1  { background: rgba(230, 130, 120, 0.10); color: #d8b0ac; border: 1px solid rgba(230, 130, 120, 0.24); }
.badge.nerf2  { background: rgba(228, 122, 110, 0.13); color: #dcaca8; border: 1px solid rgba(228, 122, 110, 0.30); }
.badge.nerf3  { background: rgba(225, 115, 100, 0.16); color: #dca8a0; border: 1px solid rgba(225, 115, 100, 0.36); }
.badge.nerf4  { background: rgba(225, 108, 92, 0.20);  color: #dca298; border: 1px solid rgba(225, 108, 92, 0.42); }
.badge.nerf5  { background: rgba(225, 100, 85, 0.25);  color: #de9c8e; border: 1px solid rgba(225, 100, 85, 0.50); }
.badge.nerf6  { background: rgba(225, 90, 75, 0.30);   color: #e09484; border: 1px solid rgba(225, 90, 75, 0.56); }
.badge.nerf7  { background: rgba(225, 80, 65, 0.34);   color: #e08c78; border: 1px solid rgba(225, 80, 65, 0.62); }
.badge.nerf8  { background: rgba(225, 70, 55, 0.38);   color: #e08470; border: 1px solid rgba(225, 70, 55, 0.68); }
.badge.nerf9  { background: rgba(225, 60, 45, 0.42);   color: #e07c66; border: 1px solid rgba(225, 60, 45, 0.74); }
.badge.nerf10 { background: rgba(225, 50, 35, 0.46);   color: #e0745c; border: 1px solid rgba(225, 50, 35, 0.80); }

/* Make digits readable on saturated backgrounds */
.badge.buff1, .badge.buff2, .badge.buff3, .badge.buff4, .badge.buff5,
.badge.buff6, .badge.buff7, .badge.buff8, .badge.buff9, .badge.buff10,
.badge.nerf1, .badge.nerf2, .badge.nerf3, .badge.nerf4, .badge.nerf5,
.badge.nerf6, .badge.nerf7, .badge.nerf8, .badge.nerf9, .badge.nerf10 {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
}

/* Text-tag versions of BUFF/NERF (used by t() for non-numeric changes; pick mid tier) */
.badge.buff-text { background: rgba(85, 205, 115, 0.22); color: #74bd80; border: 1px solid rgba(85, 205, 115, 0.50); }
.badge.nerf-text { background: rgba(225, 90, 75, 0.22);  color: #b87468; border: 1px solid rgba(225, 90, 75, 0.50); }

/* TYPO NOTE */
.typo-note {
  color: #f0c674;
  font-size: 11px;
  font-style: italic;
  margin-left: 6px;
}

/* WRONG-CHANGE LINE + CORRECTION NOTE — subtle gray */
.wrong-line {
  text-decoration: line-through;
  text-decoration-color: rgba(201, 209, 217, 0.5);
  text-decoration-thickness: 1px;
  opacity: 0.55;
}
.correction-note {
  display: block;
  margin: 6px 0 4px 0;
  padding: 6px 12px;
  background: rgba(139, 148, 158, 0.05);
  border-left: 2px solid rgba(139, 148, 158, 0.40);
  border-radius: 0 3px 3px 0;
  color: #7c8590;
  font-size: 12.5px;
  font-style: italic;
  line-height: 1.5;
}
.correction-note .badge {
  font-style: normal;
}
.correction-label {
  display: inline-block;
  font-style: normal;
  font-weight: 700;
  font-size: 10.5px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: #8b949e;
  margin-right: 4px;
}

/* IMAGE FALLBACK STYLE */
.entity-icon img[alt]:not([src*="//"]) { background: #21262d; }
img { max-width: 100%; }

/* BACK TO TOP — fixed bottom-right */
.back-to-top {
  position: fixed;
  bottom: 22px;
  right: 22px;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(22, 27, 34, 0.92);
  border: 1px solid rgba(121, 192, 255, 0.45);
  color: #79c0ff;
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  transition: all 0.18s ease;
  z-index: 100;
  font-family: inherit;
  padding: 0;
  padding-bottom: 3px;
}
.back-to-top:hover {
  background: rgba(121, 192, 255, 0.2);
  border-color: #79c0ff;
  transform: translateY(-2px);
}
.back-to-top.visible {
  display: flex;
}

/* WRONG-WORD HIGHLIGHT — subtle, just to mark it (no italic, gray) */
.wrong-word {
  background: rgba(139, 148, 158, 0.08);
  color: #8b949e;
  padding: 0 5px;
  border-radius: 3px;
  text-decoration: line-through;
  text-decoration-color: rgba(139, 148, 158, 0.45);
  text-decoration-thickness: 1px;
}

/* FORMULA TRIGGER (clickable pill on the formula text itself) */
.formula-trigger {
  display: inline-block;
  padding: 0 8px;
  border-radius: 10px;
  background: rgba(200, 130, 60, 0.07);
  color: #d4a070;
  border: 1px solid rgba(200, 130, 60, 0.22);
  font-size: 13.5px;
  cursor: pointer;
  text-decoration: underline dotted rgba(212, 160, 112, 0.55);
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  transition: all 0.14s;
  font-variant-numeric: tabular-nums;
  user-select: none;
}
.formula-trigger:hover {
  background: rgba(200, 130, 60, 0.14);
  border-color: rgba(200, 130, 60, 0.42);
  color: #e0b080;
}
.formula-trigger.active {
  background: rgba(200, 130, 60, 0.20);
  border-color: rgba(200, 130, 60, 0.55);
  color: #ecbe8a;
}
/* OLD FORMULA — just a subtle dotted underline so it stands out as "the old one" */
.formula-old {
  text-decoration: underline dotted rgba(139, 148, 158, 0.45);
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
}

/* FORMULA COMPARISON TABLE */
.formula-table {
  margin: 10px 0 6px 4px;
  border-collapse: separate;
  border-spacing: 2px;
  font-size: 11px;
  width: 100%;
  max-width: 1020px;
  table-layout: fixed;
  font-variant-numeric: tabular-nums;
}
.formula-table[hidden] { display: none; }
.formula-table thead th {
  background: rgba(48, 54, 61, 0.55);
  color: #79c0ff;
  font-weight: 600;
  font-size: 10.5px;
  padding: 4px 0;
  text-align: center;
  border-radius: 3px;
}
.formula-table tbody th {
  width: 42px;
  text-align: left;
  padding: 4px 8px;
  background: rgba(48, 54, 61, 0.5);
  color: #c9d1d9;
  font-weight: 700;
  font-size: 10.5px;
  border-radius: 3px;
  letter-spacing: 0.3px;
}
.formula-table tbody td {
  padding: 4px 4px;
  text-align: center;
  background: rgba(48, 54, 61, 0.30);
  color: #c9d1d9;
  border-radius: 3px;
  font-size: 11px;
}
.formula-table tbody td .badge {
  margin-left: 0;
  padding: 1px 4px;
  font-size: 10.5px;
  border-radius: 8px;
  display: inline-block;
}
.formula-table .row-label-old { color: #ff9a8c; }
.formula-table .row-label-new { color: #92c89e; }
/* Visual gap before L20 (after L1-15 sequential block) */
.formula-table .lvl-jump {
  border-left: 6px solid transparent;
  background-clip: padding-box !important;
}

/* FILTER BUTTONS in legend — make tags clickable */
.legend-tags .badge.filter-btn {
  cursor: pointer;
  user-select: none;
  font-family: inherit;
  font-size: 11px;
  padding: 2px 9px;
  transition: filter 0.12s, transform 0.12s;
}
.legend-tags .badge.filter-btn:hover {
  filter: brightness(1.18);
  transform: translateY(-1px);
}
.legend-tags .badge.filter-btn.active {
  outline: 2px solid currentColor;
  outline-offset: 2px;
  filter: brightness(1.35);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4) inset;
}

/* ENTITY-BLOCK wrapper (used for filtering hide/show) */
.entity-block { margin-bottom: 6px; }

/* === FILTER MODE === */
body.filter-active h2.section { display: none; }
body.filter-active h4.subgroup { display: none; }
body.filter-active ul.subnotes { display: none; }
/* Hide filtered elements via .f-hide class set by JS */
.f-hide { display: none !important; }

/* MOBILE: stack legend label above strip so 10 segments fit */
@media (max-width: 540px) {
  .legend-strip {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  .legend-label {
    min-width: 0;
    font-size: 10px;
  }
  .gradient-strip { height: 12px; }
  .gradient-strip .seg { font-size: 8px; }
}
"""

# ---------- CONTENT ----------

H = []
def W(s): H.append(s)


# ============================================================
# MULTI-PATCH SUPPORT
# ============================================================

PATCHES = [
    {"version": "7.41c", "date": "06.05.2026", "filename": "7.41c.html"},
    {"version": "7.41b", "date": "07.04.2026", "filename": "7.41b.html"},
]

def _dropdown_options_html(current_version):
    """Render menu items list for the version dropdown."""
    items = []
    for p in PATCHES:
        cls = "version-item current" if p["version"] == current_version else "version-item"
        href = "#" if p["version"] == current_version else p["filename"]
        items.append(
            f'<a class="{cls}" href="{href}">'
            f'<span class="vi-name">{p["version"]}</span>'
            f'<span class="vi-date">{p["date"]}</span>'
            f'</a>'
        )
    return "".join(items)


def write_head(version, date):
    """Render head + opening container + version dropdown + tags."""
    options = _dropdown_options_html(version)
    W(f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Dota Patch Notes - {version}</title>
<style>{CSS}</style>
</head>
<body>
<div class="container">

<header class="page-head">
  <span class="release-date">{date}</span>
  <div class="version-dropdown">
    <button class="version" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Select patch version">
      {version} <span class="version-chev">▾</span>
    </button>
    <div class="version-menu" role="menu">
      {options}
    </div>
  </div>
</header>

<div class="legend">
  <div class="legend-tags">
    <strong>Tags:</strong>
    <button class="badge buff-text filter-btn" data-filter="buff">BUFF</button>
    <button class="badge nerf-text filter-btn" data-filter="nerf">NERF</button>
    <button class="badge rework filter-btn" data-filter="rework">REWORK</button>
    <button class="badge misc filter-btn" data-filter="misc">MISC</button>
    <button class="badge qol filter-btn" data-filter="qol">QoL</button>
  </div>
  <div class="search-box">
    <input type="text" id="entity-search" placeholder="Search heroes, items, mechanics…" autocomplete="off" spellcheck="false">
    <div class="search-results" id="search-results"></div>
  </div>
</div>
''')


JS_BLOCK = '''
<script>
(function() {
  // ---- BACK TO TOP visibility ----
  const btt = document.querySelector('.back-to-top');
  function updateBtt() {
    btt.classList.toggle('visible', window.scrollY > 400);
  }
  window.addEventListener('scroll', updateBtt, { passive: true });
  updateBtt();
  // ---- TAG FILTERING (multi-select, OR semantics) ----
  const buttons = document.querySelectorAll('.filter-btn');
  const activeFilters = new Set();
  function applyFilter() {
    const isActive = activeFilters.size > 0;
    document.body.classList.toggle('filter-active', isActive);
    document.querySelectorAll('.f-hide').forEach(el => el.classList.remove('f-hide'));
    if (!isActive) return;
    document.querySelectorAll('ul.changes > li').forEach(li => {
      const tags = (li.dataset.tag || '').split(' ').filter(Boolean);
      const matches = tags.some(t => activeFilters.has(t));
      if (!matches) li.classList.add('f-hide');
    });
    document.querySelectorAll('ul.changes').forEach(ul => {
      const hasVisible = Array.from(ul.children).some(c => !c.classList.contains('f-hide'));
      if (!hasVisible) ul.classList.add('f-hide');
    });
    document.querySelectorAll('h4.ability-title').forEach(h => {
      let nx = h.nextElementSibling;
      while (nx && nx.tagName !== 'UL') nx = nx.nextElementSibling;
      if (!nx || nx.classList.contains('f-hide')) h.classList.add('f-hide');
    });
    document.querySelectorAll('.entity-block').forEach(block => {
      const visible = block.querySelectorAll('ul.changes > li:not(.f-hide)').length;
      if (!visible) block.classList.add('f-hide');
    });
  }
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.filter;
      if (activeFilters.has(tag)) {
        activeFilters.delete(tag);
        btn.classList.remove('active');
      } else {
        activeFilters.add(tag);
        btn.classList.add('active');
      }
      applyFilter();
    });
  });

  // ---- FORMULA TABLES (click pill to toggle table) ----
  document.querySelectorAll('.formula-trigger').forEach(trig => {
    trig.addEventListener('click', () => {
      const id = trig.dataset.formula;
      const table = document.getElementById(id);
      if (!table) return;
      const wasHidden = table.hasAttribute('hidden');
      if (wasHidden) {
        table.removeAttribute('hidden');
        trig.classList.add('active');
      } else {
        table.setAttribute('hidden', '');
        trig.classList.remove('active');
      }
    });
  });

  // ---- ENTITY SEARCH ----
  const searchInput = document.getElementById('entity-search');
  const resultsBox = document.getElementById('search-results');
  const entities = [];
  document.querySelectorAll('.entity').forEach(entity => {
    const nameEl = entity.querySelector('.entity-name');
    const imgEl = entity.querySelector('.entity-icon img');
    if (!nameEl) return;
    let kind = 'mechanic';
    if (entity.classList.contains('hero-entity')) kind = 'hero';
    else if (entity.classList.contains('item-entity')) kind = 'item';
    entities.push({
      name: nameEl.textContent.trim(),
      element: entity,
      icon: imgEl ? imgEl.src : null,
      kind: kind
    });
  });

  function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function highlight(name, q) {
    const idx = name.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return escapeHtml(name);
    return escapeHtml(name.slice(0, idx)) +
           '<mark>' + escapeHtml(name.slice(idx, idx + q.length)) + '</mark>' +
           escapeHtml(name.slice(idx + q.length));
  }

  let activeIdx = -1;

  function render(query) {
    if (!query) {
      resultsBox.classList.remove('show');
      resultsBox.innerHTML = '';
      activeIdx = -1;
      return;
    }
    const q = query.toLowerCase();
    const matches = entities.filter(e => e.name.toLowerCase().includes(q)).slice(0, 12);
    if (matches.length === 0) {
      resultsBox.innerHTML = '<div class="empty">no matches</div>';
      resultsBox.classList.add('show');
      activeIdx = -1;
      return;
    }
    resultsBox.innerHTML = matches.map((m, i) =>
      `<div class="result-item" data-idx="${i}">${
        m.icon ? `<img src="${m.icon}" alt="">` : '<span style="width:32px;display:inline-block"></span>'
      }<span>${highlight(m.name, query)}</span><span class="kind">${m.kind}</span></div>`
    ).join('');
    resultsBox.classList.add('show');
    activeIdx = -1;

    resultsBox.querySelectorAll('.result-item').forEach((el, i) => {
      el.addEventListener('mouseenter', () => { setActive(i); });
      el.addEventListener('click', () => { jumpTo(matches[i]); });
    });
    window._currentMatches = matches;
  }

  function setActive(i) {
    activeIdx = i;
    resultsBox.querySelectorAll('.result-item').forEach((el, idx) => {
      el.classList.toggle('active', idx === i);
    });
  }

  function jumpTo(target) {
    if (!target) return;
    target.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.element.style.transition = 'box-shadow 0.4s';
    target.element.style.boxShadow = '0 0 0 2px #58a6ff';
    setTimeout(() => target.element.style.boxShadow = '', 1400);
    searchInput.value = '';
    resultsBox.classList.remove('show');
    resultsBox.innerHTML = '';
  }

  searchInput.addEventListener('input', () => render(searchInput.value));
  searchInput.addEventListener('keydown', (e) => {
    const items = resultsBox.querySelectorAll('.result-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((activeIdx + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((activeIdx - 1 + items.length) % items.length); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = activeIdx >= 0 ? activeIdx : 0;
      if (window._currentMatches && window._currentMatches[idx]) jumpTo(window._currentMatches[idx]);
    }
    else if (e.key === 'Escape') {
      searchInput.value = '';
      render('');
    }
  });
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !resultsBox.contains(e.target)) {
      resultsBox.classList.remove('show');
    }
  });
})();
</script>
'''

def write_footer():
    """Render close-block + back-to-top button + JS + closing tags."""
    W(_close_block())
    W('<button class="back-to-top" aria-label="Back to top" onclick="window.scrollTo({top:0, behavior:\'smooth\'})">↑</button>')
    W(JS_BLOCK)
    W('</div></body></html>')


def save_html(filename):
    """Write current accumulator to /home/claude/{filename} and reset state."""
    out = "\n".join(H)
    path = f"/home/claude/{filename}"
    with open(path, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"  → {filename}: {len(out):,} bytes")
    H.clear()
    _State.block_open = False


# ============================================================
# 7.41c content
# ============================================================
write_head("7.41c", "06.05.2026")

# ===== GENERAL UPDATES =====
W(section("General Updates"))

W(plain_header("Mechanics"))
W(ul_open())
W(li("Units with flying vision no longer ignore vision restrictions of Roshan's pits. They can no longer see into them from outside and vice versa", t("NERF")))
W(li("Affects Clockwerk during Jetpack, Drow Ranger's Glacier, Monkey King during Tree Dance, Night Stalker during Dark Ascension, Treant Protector's Eyes in the Forest, and Visage's Familiars", t("MISC")))
W(ul_close())
W(plain_header("Tormentor"))
W(ul_open())
W(li("Tormentor: Alleviation: Max health regen increased from 2% to 2.25%", b(2, 2.25)))
W(li("Tormentor: Alleviation: Duration increased from 10s to 15s", b(10, 15)))
W(ul_close())

# ===== ITEM UPDATES =====
W(section("Item Updates"))

W(item_header("Bloodstone"))
W(ul_open())
W(li("Health bonus increased from +600 to +625", b(600, 625)))
W(li("Bloodpact cooldown increased from 30s to 35s", b(30, 35, l=True)))
W(li("Spell Weakness Aura damage from spells taken decreased from 12% to 10%", b(12, 10)))
W(ul_close())
W(item_header("Boots of Bearing"))
W(ul_open())
W(li("Swiftness Aura allied movement speed decreased from 20 to 15", b(20, 15)))
W(ul_close())
W(item_header("Crella's Crozier"))
W(ul_open())
W(li("Rite of Rumusque movement speed steal increased from 5% to 6%", b(5, 6)))
W(ul_close())
W(item_header("Disperser"))
W(ul_open())
W(li("Suppress duration decreased from 5s to 4s", b(5, 4)))
W(ul_close())
W(item_header("Essence Distiller"))
W(ul_open())
W(li("Soul Release radius when ground targeted increased from 400 to 450", b(400, 450)))
W(ul_close())
W(item_header("Harpoon"))
W(ul_open())
W(li("Draw Forth can no longer move the Harpoon caster when rooted/leashed/bound", t("NERF")))
W(li("The target is still moved for the unchanged distance in this case, however a tree cast won't have any effect", t("MISC")))
W(li("Still affects rooted/leashed/bound targets", t("MISC")))
W(ul_close())
W(item_header("Heart of Tarrasque"))
W(ul_open())
W(li("Recipe cost increased from 600 to 700. Total cost increased from 5100g to 5200g", b(600, 700, l=True)))
W(ul_close())
W(item_header("Mage Slayer"))
W(ul_open())
W(li("Mage Slayer damage per second decreased from 40 to 35", b(40, 35)))
W(ul_close())
W(item_header("Silver Edge"))
W(ul_open())
W(li("Shadow Walk bonus movement speed decreased from 25% to 22%", b(25, 22)))
W(li("Shadow Walk cooldown increased from 20s to 22s", b(20, 22, l=True)))
W(ul_close())
W(item_header("Shiva's Guard"))
W(ul_open())
W(li("Freezing Aura attack speed reduction decreased from 45 to 40", b(45, 40)))
W(ul_close())
W(item_header("Soul Ring"))
W(ul_open())
W(li("Cooldown increased from 25s to 30s", b(25, 30, l=True)))
W(ul_close())
W(item_header("Specialist's Array"))
W(ul_open())
W(li("Agility bonus increased from +12 to +15", b(12, 15)))
W(ul_close())
W(plain_header("Crude"))
W(ul_open())
W(li("Intelligence penalty increased from 6% to 9%", b(6, 9, l=True)))
W(ul_close())
W(plain_header("Greedy"))
W(ul_open())
W(li("Mana bonus decreased from 200/250 to 150/200", b([200, 250], [150, 200])))
W(ul_close())
W(plain_header("Tough"))
W(ul_open())
W(li("Damage bonus decreased from +7/10/13/16 to +6/9/12/15", b([7, 10, 13, 16], [6, 9, 12, 15])))
W(ul_close())

# ===== HERO UPDATES =====
W(section("Hero Updates"))


# Abaddon
W(hero_header("Abaddon"))
W(ul_open())
W(li("Base Intelligence increased by 1", t("BUFF")))
W(li("Damage at level 1 unchanged at 49-59", t("MISC")))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent Curse of Avernus DPS increased from +25 to +30", b(25, 30)))
W(ul_close())

# Alchemist
W(hero_header("Alchemist"))
W(ability("Greevil's Greed"))
W(ul_open())
W(li("Bonus base/max Extra Gold per melted Scepter decreased from +6 to +3", b(6, 3)))
W(ul_close())
W(ability("Acid Spray"))
W(ul_open())
W(li("Cooldown rescaled from 22/21/20/19s to 21s", b([22, 21, 20, 19], 21, l=True)))
W(ul_close())
W(ability("Chemical Rage"))
W(ul_open())
W(li("Bonus Health Regen decreased from 60/90/120 to 50/85/120", b([60, 90, 120], [50, 85, 120])))
W(ul_close())

# Ancient Apparition
W(hero_header("Ancient Apparition"))
W(ability("Ice Blast"))
W(ul_open())
W(li("Path Radius increased from 275 to 300", b(275, 300)))
W(li("Base Area of Effect Radius increased from 275 to 300", b(275, 300)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent Chilling Touch Damage increased from +80 to +100", b(80, 100)))
W(ul_close())

# Anti-Mage
W(hero_header("Anti-Mage"))
W(ability("Persecutor"))
W(ul_open())
W(li("Minimum mana threshold for slow improved from 50% to 60%", b(50, 60, l=True)))
W(ul_close())

# Arc Warden
W(hero_header("Arc Warden"))
W(ul_open())
W(li("Base Agility increased from 20 to 22", b(20, 22)))
W(li("Damage at level 1 increased from 51-57 to 52-58", t("BUFF")))
W(ul_close())

# Bane
W(hero_header("Bane"))
W(ability("Brain Sap"))
W(ul_open())
W(li("Mana Cost decreased from 120/130/140/150 to 105/120/135/150", b([120, 130, 140, 150], [105, 120, 135, 150], l=True)))
W(ul_close())

# Batrider
W(hero_header("Batrider"))
W(ul_open())
W(li("Base Movement Speed decreased from 320 to 310", b(320, 310)))
W(ul_close())
W(ability("Sticky Napalm"))
W(ul_open())
W(li("Aghanim's Shard building damage decreased from 25% to 20%", b(25, 20)))
W(ul_close())
W(ability("Firefly"))
W(ul_open())
W(li("Damage per second decreased from 25/50/75/100 to 20/40/60/80", b([25, 50, 75, 100], [20, 40, 60, 80])))
W(ul_close())
W(ability("Flaming Lasso"))
W(ul_open())
W(li("Total Damage decreased from 200/350/500 to 125/250/375", b([200, 350, 500], [125, 250, 375])))
W(ul_close())

# Beastmaster
W(hero_header("Beastmaster"))
W(ul_open())
W(li("Base Strength decreased from 25 to 24", b(25, 24)))
W(li("Damage at level 1 decreased from 50-54 to 49-53", t("NERF")))
W(ul_close())
W(ability("Wild Axes"))
W(ul_open())
W(li("Mana Cost increased from 50/55/60/65 to 65", b([50, 55, 60, 65], 65, l=True)))
W(ul_close())
W(ability("Summon Razorback"))
W(ul_open())
W(li("Boar Attack Damage decreased from 30/45/60/75 to 24/41/58/75", b([30, 45, 60, 75], [24, 41, 58, 75])))
W(ul_close())
W(ability("Drums of Slom"))
W(ul_open())
W(li("Damage Radius decreased from 600 to 525", b(600, 525)))
W(li("Drum Hit Damage decreased from 80 to 70", b(80, 70)))
W(ul_close())

# Bounty Hunter
W(hero_header("Bounty Hunter"))
W(ability("Shuriken Toss"))
W(ul_open())
W(li("Mana Cost increased from 75/80/85/90 to 75/85/95/105", b([75, 80, 85, 90], [75, 85, 95, 105], l=True)))
W(ul_close())
W(ability("Shadow Walk"))
W(ul_open())
W(li("Bonus Speed increased from 8/12/16/20% to 11/14/17/20%", b([8, 12, 16, 20], [11, 14, 17, 20])))
W(ul_close())
W(ability("Track"))
W(ul_open())
W(li("Mana Cost decreased from 60 to 50", b(60, 50, l=True)))
W(ul_close())

# Brewmaster
W(hero_header("Brewmaster"))
W(ability("Primal Split"))
W(ul_open())
W(li("Cancel Split now has a 3s initial cooldown", t("REWORK")))
W(ul_close())

# Bristleback
W(hero_header("Bristleback"))
W(ability("Warpath"))
W(ul_open())
W(li("Damage per stack decreased from 15/20/25 to 12/16/20", b([15, 20, 25], [12, 16, 20])))
W(ul_close())
W(ability("Hairball"))
W(ul_open())
W(li("Cooldown increased from 13s to 15s", b(13, 15, l=True)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 25 Talent Bristleback Damage Threshold Reduction increased from 25 to 30", b(25, 30)))
W(ul_close())

# Broodmother
W(hero_header("Broodmother"))
W(ability("Insatiable Hunger"))
W(ul_open())
W(li("Spiderling Radius increased from 800 to 1200", b(800, 1200)))
W(ul_close())
W(ability("Spinner's Snare"))
W(ul_open())
W(li("Mana Cost decreased from 100 to 70", b(100, 70, l=True)))
W(ul_close())

# Centaur Warrunner
W(hero_header("Centaur Warrunner"))
W(ul_open())
W(li("Base Strength increased from 27 to 28", b(27, 28)))
W(li("Damage at level 1 increased from 63-65 to 64-66", t("BUFF")))
W(li("Strength gain increased from 4.2 to 4.3", b(4.2, 4.3)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 25 Talent Hoof Stomp Duration increased from +0.8s to +1.0s", b(0.8, 1.0)))
W(ul_close())

# Chaos Knight
W(hero_header("Chaos Knight"))
W(ability("Chaos Strike"))
W(ul_open())
W(li("Critical Max increased from 140/180/220/260% to 150/190/230/270%", b([140, 180, 220, 260], [150, 190, 230, 270])))
W(ul_close())

# Dark Seer
W(hero_header("Dark Seer"))
W(ul_open())
W(li("Base Intelligence increased from 22 to 23", b(22, 23)))
W(li("Damage at level 1 increased from 53-59 to 54-60", t("BUFF")))
W(ul_close())

# Dark Willow
W(hero_header("Dark Willow"))
W(ability("Terrorize"))
W(ul_open())
W(li("Radius increased from 400/450/500 to 450/500/550", b([400, 450, 500], [450, 500, 550])))
W(ul_close())

# Dawnbreaker
W(hero_header("Dawnbreaker"))
W(ul_open())
W(li("Base Damage decreased by 1", t("NERF")))
W(li("Damage at level 1 decreased from 56-60 to 55-59", t("NERF")))
W(ul_close())
W(ability("Solar Guardian"))
W(ul_open())
W(li("Landing Stun Duration decreased from 1.4/1.6/1.8s to 1.2/1.4/1.6s", b([1.4, 1.6, 1.8], [1.2, 1.4, 1.6])))
W(ul_close())

# Doom
W(hero_header("Doom"))
W(ability("Scorched Earth"))
W(ul_open())
W(li("Bonus HP Regen decreased from 7/8/9/10 to 6.66", b([7, 8, 9, 10], 6.66)))
W(ul_close())

# Drow Ranger
W(hero_header("Drow Ranger"))
W(ability("Frost Arrows"))
W(ul_open())
W(li("Bonus Damage increased from 10/15/20/25 to 12/18/24/30", b([10, 15, 20, 25], [12, 18, 24, 30])))
W(ul_close())
W(ability("Gust"))
W(ul_open())
W(li("Mana Cost decreased from 70 to 55", b(70, 55, l=True)))
W(ul_close())

# Earth Spirit
W(hero_header("Earth Spirit"))
W(ul_open())
W(li("Base Strength increased from 22 to 23", b(22, 23)))
W(li("Damage at level 1 increased from 47-51 to 48-52", t("BUFF")))
W(ul_close())

# Elder Titan
W(hero_header("Elder Titan"))
W(ability("Echo Stomp"))
W(ul_open())
W(li("Damage increased from 60/100/140/180 to 65/110/155/200", b([60, 100, 140, 180], [65, 110, 155, 200])))
W(li("Aghanim's Shard with alt-cast no longer swaps the position if Elder Titan is rooted", t("NERF")))
W(ul_close())

# Ember Spirit
W(hero_header("Ember Spirit"))
W(ul_open())
W(li("Base Strength decreased from 22 to 21", b(22, 21)))
W(ul_close())

# Faceless Void
W(hero_header("Faceless Void"))
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent Time Walk Cooldown Reduction decreased from 1.25s to 1s", b(1.25, 1, l=True)))
W(li("Level 20 Talent Attack Speed during Chronosphere decreased from +100 to +80", b(100, 80)))
W(ul_close())

# Gyrocopter
W(hero_header("Gyrocopter"))
W(ability("Afterburner"))
W(ul_open())
W(li("Duration increased from 4s to 5s", b(4, 5)))
W(ul_close())

# Hoodwink
W(hero_header("Hoodwink"))
W(ul_open())
W(li("Base Damage increased by 3", t("BUFF")))
W(li("Base Agility decreased from 25 to 22", b(25, 22)))
W(li("Damage at level 1 unchanged at 47-54", t("MISC")))
W(ul_close())
W(ability("Sharpshooter"))
W(ul_open())
W(li("Knockback to Hoodwink won't be applied if Hoodwink is rooted", t("NERF")))
W(ul_close())

# Huskar
W(hero_header("Huskar"))
W(ul_open())
W(li("Base Health Regen decreased by 0.25", t("NERF")))
W(ul_close())

# Invoker
W(hero_header("Invoker"))
W(ul_open())
W(li("Base Movement Speed decreased from 285 to 280", b(285, 280)))
W(ul_close())

# Io
W(hero_header("Io"))
W(ability("Tether"))
W(ul_open())
W(li("HP/Mana Transfer decreased from 60/80/100/120% to 55/75/95/115%", b([60, 80, 100, 120], [55, 75, 95, 115])))
W(ul_close())
W(ability("Spirits"))
W(ul_open())
W(li("Now remembers the radius of the spirits between casts", t("REWORK")))
W(ul_close())

# Jakiro
W(hero_header("Jakiro"))
W(ul_open())
W(li("Strength gain increased from 2.5 to 2.6", b(2.5, 2.6)))
W(ul_close())
W(ability("Macropyre"))
W(ul_open())
W(li("Mana Cost decreased from 250/350/450 to 225/325/425", b([250, 350, 450], [225, 325, 425], l=True)))
W(ul_close())

# Juggernaut
W(hero_header("Juggernaut"))
W(ability("Blade Fury"))
W(ul_open())
W(li("Damage per second increased from 80/110/140/170 to 85/115/145/175", b([80, 110, 140, 170], [85, 115, 145, 175])))
W(ul_close())

# Keeper of the Light
W(hero_header("Keeper of the Light"))
W(ul_open())
W(li("Base Movement Speed decreased from 315 to 310", b(315, 310)))
W(ul_close())

# Kunkka
W(hero_header("Kunkka"))
W(ability("Admiral's Rum"))
W(ul_open())
W(li("Cooldown decreased from 60.5s - 0.5s per level to 50.5s - 0.5s per level", t("NERF")))
W(ul_close())

# Largo
W(hero_header("Largo"))
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent +200 Catchy Lick Damage replaced with 2x Catchy Lick Charges", t("REWORK")))
W(li("Level 25 Talent 2x Catchy Lick Charges replaced with 2x Frogstomp Stomps / Interval", t("REWORK")))
W(ul_close())

# Lich
W(hero_header("Lich"))
W(ability("Sinister Gaze"))
W(ul_open())
W(li("Mana Drain per second increased from 20% to 25%", b(20, 25)))
W(ul_close())

# Lina
W(hero_header("Lina"))
W(ability("Light Strike Array"))
W(ul_open())
W(li("Damage increased from 80/120/160/200 to 80/125/170/215", b([80, 120, 160, 200], [80, 125, 170, 215])))
W(ul_close())
W(ability("Laguna Blade"))
W(ul_open())
W(li("Damage increased from 380/565/750 to 400/580/760", b([380, 565, 750], [400, 580, 760])))
W(ul_close())

# Lone Druid
W(hero_header("Lone Druid"))
W(ability("Summon Spirit Bear"))
W(ul_open())
W(li("Mana Cost increased from 75 to 100", b(75, 100, l=True)))
W(ul_close())
W(ability("Spirit Link"))
W(ul_open())
W(li("Shared Lifesteal now follows general lifesteal rules and has a creep penalty of 40%", t("REWORK")))
W(ul_close())
W(ability("Savage Roar"))
W(ul_open())
W(li("Aghanim's Shard buff duration decreased from 5s to 4s", b(5, 4)))
W(li("Aghanim's Shard bonus movement speed decreased from 15% to 10%", b(15, 10)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent -25s Summon Spirit Bear Cooldown replaced with +5s True Form Duration", t("REWORK")))
W(ul_close())
W(subgroup("Spirit Bear"))
W(ul_open())
W(li("Gold/Experience Bounty increased from 175 + 8 per Spirit Bear level up to 165 + 10 per Spirit Bear level", t("BUFF")))
W(ul_close())
W(subgroup("Spirit Bear Talents"))
W(ul_open())
W(li("Level 25 Talent Demolish Bonus Building Damage decreased from +20% to +15%", b(20, 15)))
W(ul_close())

# Lycan
W(hero_header("Lycan"))
W(ability("Feral Impulse"))
W(ul_open())
W(li("Health Regen increased from 1/3/5/7 to 2/4/6/8", b([1, 3, 5, 7], [2, 4, 6, 8])))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent Wolves Damage increased from +10 to +14", b(10, 14)))
W(li("Level 15 Talent Summon Wolves Health increased from +350 to +375", b(350, 375)))
W(ul_close())

# Magnus
W(hero_header("Magnus"))
W(ability("Shockwave"))
W(ul_open())
W(li("Slow Duration increased from 0.4/0.6/0.8/1.0s to 0.55/0.7/0.85/1.0s", b([0.4, 0.6, 0.8, 1.0], [0.55, 0.7, 0.85, 1.0])))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 15 Talent All Attributes per hero hit with Reverse Polarity increased from +12 to +14", b(12, 14)))
W(ul_close())

# Marci
W(hero_header("Marci"))
W(ability("Bodyguard"))
W(ul_open())
W(li("Cast Range increased from 500 to 600", b(500, 600)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 15 Talent Dispose Damage increased from +100 to +115", b(100, 115)))
W(ul_close())

# Mars
W(hero_header("Mars"))
W(ability("Dauntless"))
W(ul_open())
W(li("HP Regen per extra enemy increased from 40% to 50%", b(40, 50)))
W(ul_close())
W(ability("Spear of Mars"))
W(ul_open())
W(li("Mana Cost decreased from 100/110/120/130 to 90/100/110/120", b([100, 110, 120, 130], [90, 100, 110, 120], l=True)))
W(ul_close())

# Mirana
W(hero_header("Mirana"))
W(ability("Sacred Arrow"))
W(ul_open())
W(li("Damage increased from 60/150/240/330 to 60/160/260/360", b([60, 150, 240, 330], [60, 160, 260, 360])))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 15 Talent Leap Attack Speed increased from +90 to +100", b(90, 100)))
W(li("Level 20 Talent Celestial Quiver Damage increased from +40 to +50", b(40, 50)))
W(ul_close())

# Monkey King
W(hero_header("Monkey King"))
W(ul_open())
W(li("Base Agility decreased from 24 to 23", b(24, 23)))
W(li("Damage at level 1 decreased from 53-57 to 52-56", t("NERF")))
W(ul_close())
W(ability("Primal Spring"))
W(ul_open())
W(li("Movement Slow decreased from 35/50/65/80% to 30/40/50/60%", b([35, 50, 65, 80], [30, 40, 50, 60])))
W(ul_close())

# Morphling
W(hero_header("Morphling"))
W(ability("Waveform"))
W(ul_open())
W(li("Will now be cast in the desired direction, if the target location is further than the cast range", t("REWORK")))
W(ul_close())

# Muerta
W(hero_header("Muerta"))
W(ul_open())
W(li("Base Attack Speed decreased from 115 to 110", b(115, 110)))
W(ul_close())
W(ability("Supernatural"))
W(ul_open())
W(li("Maximum Stack Count increased from 1 per hero level to 5 + 1 per hero level", t("BUFF")))
W(ul_close())

# Nature's Prophet
W(hero_header("Nature's Prophet"))
W(ability("Nature's Call"))
W(ul_open())
W(li("Mana Cost decreased from 100 to 85/90/95/100", b(100, [85, 90, 95, 100], l=True)))
W(li("Treant Bonus Hero Damage increased from 4/8/12/16 to 6/10/14/18", b([4, 8, 12, 16], [6, 10, 14, 18])))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent Sprout Damage increased from +170 to +220", b(170, 220)))
W(li("Level 20 Talent Wrath of Nature Cooldown Reduction increased from 15s to 20s", b(15, 20, l=True)))
W(ul_close())

# Ogre Magi
W(hero_header("Ogre Magi"))
W(ul_open())
W(li("Strength gain decreased from 4.2 to 4.0", b(4.2, 4.0)))
W(ul_close())

# Omniknight
W(hero_header("Omniknight"))
W(ability("Repel"))
W(ul_open())
W(li("Cooldown decreased from 40/36/32/28s to 40/35/30/25s", b([40, 36, 32, 28], [40, 35, 30, 25], l=True)))
W(ul_close())
W(ability("Hammer of Purity"))
W(ul_open())
W(li("Damage increased from 20/40/60/80 to 25/45/65/85", b([20, 40, 60, 80], [25, 45, 65, 85])))
W(ul_close())

# Outworld Destroyer
W(hero_header("Outworld Destroyer"))
W(ability("Objurgation"))
W(ul_open())
W(li("Mana Cost decreased from 250 to 175", b(250, 175, l=True)))
W(ul_close())
W(ability("Sanity's Eclipse"))
W(ul_open())
W(li("Radius increased from 450/500/550 to 500/525/550", b([450, 500, 550], [500, 525, 550])))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent Astral Imprisonment Mana Capacity Steal increased from 10% to 12%", b(10, 12)))
W(ul_close())

# Pangolier
W(hero_header("Pangolier"))
W(ul_open())
W(li("Base Health Regen decreased by 1.0", t("NERF")))
W(ul_close())
W(ability("Swashbuckle"))
W(ul_open())
W(li("Mana Cost increased from 75/80/85/90 to 85/90/95/100", b([75, 80, 85, 90], [85, 90, 95, 100], l=True)))
W(ul_close())
W(ability("Roll Up"))
W(ul_open())
W(li("Mana Cost increased from 50 to 75", b(50, 75, l=True)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent Lucky Shot Armor Reduction decreased from +3 to +2", b(3, 2)))
W(ul_close())

# Phantom Assassin
W(hero_header("Phantom Assassin"))
W(ul_open())
W(li("Base Agility increased from 21 to 22", b(21, 22)))
W(li("Damage at level 1 increased from 56-58 to 57-59", t("BUFF")))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent Phantom Strike Duration increased from +0.6 to +0.8s", b(0.6, 0.8)))
W(ul_close())

# Phantom Lancer
W(hero_header("Phantom Lancer"))
W(ability("Phantom Rush"))
W(ul_open())
W(li("Aghanim's Scepter bonus max rush distance decreased from +625 to +575 ", b(625, 575)))
W(li("From 1225/1300/1375/1450 to 1175/1250/1325/1400", b([1225, 1300, 1375, 1450], [1175, 1250, 1325, 1400])))
W(ul_close())

# Phoenix
W(hero_header("Phoenix"))
W(ability("Dying Light"))
W(ul_open())
W(li("Missing Health as Damage decreased from 4% to 3.5%", b(4, 3.5)))
W(ul_close())
W(ability("Sun Ray"))
W(ul_open())
W(li("Max Health as Heal per second decreased from 0.5/1/1.5/2% to 0.4/0.8/1.2/1.6%", b([0.5, 1, 1.5, 2], [0.4, 0.8, 1.2, 1.6])))
W(ul_close())
W(ability("Supernova"))
W(ul_open())
W(li("Damage per second decreased from 60/90/120 to 50/80/110", b([60, 90, 120], [50, 80, 110])))
W(ul_close())

# Primal Beast
W(hero_header("Primal Beast"))
W(ability("Trample"))
W(ul_open())
W(li("Damage AoE decreased from 230 to 200", b(230, 200)))
W(ul_close())

# Puck
W(hero_header("Puck"))
W(subgroup("Talents"))
W(ul_open())
W(li("Level 15 Talent -15s Dream Coil Cooldown replaced with +2% Puckish Health and Mana Restoration", t("REWORK")))
W(li("Level 25 Talent Dream Coil Pierces Debuff Immunity replaced with -30s Dream Coil Cooldown", t("REWORK")))
W(ul_close())

# Queen of Pain
W(hero_header("Queen of Pain"))
W(ul_open())
W(li("Base Agility decreased from 22 to 20", b(22, 20)))
W(ul_close())
W(ability("Shadow Strike"))
W(ul_open())
W(li("Cooldown rescaled from 13/10/7/4s to 11/9/7/5s", b([13, 10, 7, 4], [11, 9, 7, 5], l=True)))
W(li("Aghanim's Scepter AoE decreased from 375 to 300", b(375, 300)))
W(ul_close())

# Razor
W(hero_header("Razor"))
W(subgroup("Talents"))
W(ul_open())
W(li("Level 15 Talent Static Link Damage Steal increased from +5 to +6", b(5, 6)))
W(li("Level 20 Talent Storm Surge Slow and Damage increased from +30% to +35%", b(30, 35)))
W(ul_close())

# Rubick
W(hero_header("Rubick"))
W(ul_open())
W(li("Agility gain decreased from 2.5 to 2.2", b(2.5, 2.2)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 15 Talent Fade Bolt Cooldown Reduction increased from 3s to 4s", b(3, 4, l=True)))
W(li("Level 15 Talent Stolen Spells Mana Cost Reduction decreased from 50% to 40%", b(50, 40, l=True)))
W(li("Level 25 Talent Curiosity Bonuses decreased from 2x to 1.5x", t("NERF")))
W(ul_close())

# Sand King
W(hero_header("Sand King"))
W(ul_open())
W(li("Base Attack Speed decreased from 110 to 100", b(110, 100)))
W(ul_close())
W(ability("Stinger"))
W(ul_open())
W(li("Slow Duration rescaled from 4/5/6/7s to 5s", b([4, 5, 6, 7], 5)))
W(ul_close())
W(ability("Epicenter"))
W(ul_open())
W(li("Base Radius decreased from 500 to 450", b(500, 450)))
W(ul_close())

# Shadow Fiend
W(hero_header("Shadow Fiend"))
W(ability("Shadowraze"))
W(ul_open())
W(li("Mana Cost decreased from 80 to 75", b(80, 75, l=True)))
W(ul_close())
W(ability("Presence of the Dark Lord"))
W(ul_open())
W(li("Armor Reduction rescaled from 3/4/5/6 to 2.5/4/5.5/7", b([3, 4, 5, 6], [2.5, 4, 5.5, 7])))
W(ul_close())

# Skywrath Mage
W(hero_header("Skywrath Mage"))
W(ability("Mystic Flare"))
W(ul_open())
W(li("Cooldown decreased from 60/40/20s to 55/35/15s", b([60, 40, 20], [55, 35, 15], l=True)))
W(ul_close())

# Slardar
W(hero_header("Slardar"))
W(ability("Slithereen Crush"))
W(ul_open())
W(li("Cooldown increased from 7s to 8.5/8/7.5/7s", b(7, [8.5, 8, 7.5, 7], l=True)))
W(ul_close())

# Snapfire
W(hero_header("Snapfire"))
W(ul_open())
W(li("Base Damage increased by 2", t("BUFF")))
W(li("Damage at level 1 increased from 51-57 to 53-59", t("BUFF")))
W(ul_close())

# Spectre
W(hero_header("Spectre"))
W(ul_open())
W(li("Base Agility increased from 26 to 29", b(26, 29)))
W(li("Damage at level 1 decreased from 49-53 to 52-56", t("NERF")))
W(ul_close())
W(ability("Dispersion"))
W(ul_open())
W(li("Damage rescaled from 8/12/16/20% to 9/12/15/18%", b([8, 12, 16, 20], [9, 12, 15, 18])))
W(ul_close())

# Storm Spirit
W(hero_header("Storm Spirit"))
W(ability("Galvanized"))
W(ul_open())
W(li("Now gains a charge every 3 levels", t("REWORK")))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent Overload Attack/Movement Speed Slow increased from +20/20% to +25/25%", b([20, 20], [25, 25])))
W(ul_close())

# Sven
W(hero_header("Sven"))
W(ability("Storm Hammer"))
W(ul_open())
W(li("Mana Cost decreased from 110/115/120/125 to 110", b([110, 115, 120, 125], 110, l=True)))
W(ul_close())

# Techies
W(hero_header("Techies"))
W(ul_open())
W(li("Base Mana Regen decreased by 0.5", t("NERF")))
W(li("Intelligence gain decreased from 3.0 to 2.7", b(3.0, 2.7)))
W(li("Damage gain per level decreased from 3.3 to 3.2", b(3.3, 3.2)))
W(ul_close())
W(ability("M.A.D."))
W(ul_open())
W(li("Mana Pool as Regen rescaled from 0.08% + 0.02% per level to 0.1% + 0.01% per level", t("REWORK")))
W(ul_close())
W(ability("Reactive Tazer"))
W(ul_open())
W(li("Explosion Radius decreased from 450 to 400", b(450, 400)))
W(ul_close())

# Templar Assassin
W(hero_header("Templar Assassin"))
W(ul_open())
W(li("Base Movement Speed increased from 310 to 315", b(310, 315)))
W(ul_close())

# Tidehunter
W(hero_header("Tidehunter"))
W(ul_open())
W(li("Base Mana Regen decreased by 0.5", t("NERF")))
W(ul_close())

# Timbersaw
W(hero_header("Timbersaw"))
W(ul_open())
W(li("Base Damage increased by 2", t("BUFF")))
W(li("Damage at level 1 decreased from 46-50 to 48-52", t("NERF")))
W(li("Base Intelligence increased from 23 to 24", b(23, 24)))
W(ul_close())
W(ability("Reactive Armor"))
W(ul_open())
W(li("Bonus HP Regen increased from 0.4/0.5/0.6/0.7 to 0.5/0.6/0.7/0.8", b([0.4, 0.5, 0.6, 0.7], [0.5, 0.6, 0.7, 0.8])))
W(ul_close())

# Tinker
W(hero_header("Tinker"))
W(ability("Deploy Turrets"))
W(ul_open())
W(li("Updated sound effects", t("MISC")))
W(ul_close())

# Tiny
W(hero_header("Tiny"))
W(ul_open())
W(li("Base Attack Speed decreased from 90 to 85", b(90, 85)))
W(ul_close())
W(ability("Grow"))
W(ul_open())
W(li("Toss Bonus Damage increased from 50/175/300 to 50/200/350", b([50, 175, 300], [50, 200, 350])))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent +8 Strength replaced with +2 Tree Grab Attacks", t("REWORK")))
W(li("Level 15 Talent -8% Grow Attack Speed Reduction replaced with +10 Strength", t("REWORK")))
W(ul_close())

# Treant Protector
W(hero_header("Treant Protector"))
W(ability("Eyes in the Forest"))
W(ul_open())
W(li("Added AoE indicator to cast", t("MISC")))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent Living Armor Heal Per Second decreased from +4 to +3", b(4, 3)))
W(ul_close())

# Troll Warlord
W(hero_header("Troll Warlord"))
W(ability("Whirling Axes (Ranged)"))
W(ul_open())
W(li("Mana Cost decreased from 60 to 50", b(60, 50, l=True)))
W(ul_close())
W(ability("Whirling Axes (Melee)"))
W(ul_open())
W(li("Damage increased from 50/100/150/200 to 75/120/165/210", b([50, 100, 150, 200], [75, 120, 165, 210])))
W(ul_close())

# Tusk
W(hero_header("Tusk"))
W(ability("Drinking Buddies"))
W(ul_open())
W(li("No longer castable while rooted", t("NERF")))
W(ul_close())

# Vengeful Spirit
W(hero_header("Vengeful Spirit"))
W(ability("Vengeance Aura"))
W(ul_open())
W(li("Self Bonus increased from 20% to 25%", b(20, 25)))
W(ul_close())

# Venomancer
W(hero_header("Venomancer"))
W(ability("Poison Sting"))
W(ul_open())
W(li("Movement Slow decreased from 10% to 8%", b(10, 8)))
W(ul_close())
W(ability("Snakebite"))
W(ul_open())
W(li("Damage per second rescaled from 20/25/30/35 to 10/20/30/40", b([20, 25, 30, 35], [10, 20, 30, 40])))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 15 Talent Poison Sting Slow increased from +7% to +10%", b(7, 10)))
W(li("Level 20 Talent +40% Snakebite Damage replaced with +100 Snakebite Initial Damage", t("REWORK")))
W(ul_close())

# Viper
W(hero_header("Viper"))
W(ability("Nosedive"))
W(ul_open())
W(li("Cooldown increased from 20s to 25s", b(20, 25, l=True)))
W(ul_close())

# Weaver
W(hero_header("Weaver"))
W(ability("The Swarm"))
W(ul_open())
W(li("Mana Cost decreased from 110 to 110/105/100/95", b(110, [110, 105, 100, 95], l=True)))
W(ul_close())

# Windranger
W(hero_header("Windranger"))
W(subgroup("Talents"))
W(ul_open())
W(li("Level 25 Talent Focus Fire Cooldown Advance on Kills decreased from 18s to 16s", b(18, 16, l=True)))
W(li("Level 25 Talent Powershot Max HP Execution Threshold increased from 15% to 16%", b(15, 16)))
W(ul_close())

# Winter Wyvern
W(hero_header("Winter Wyvern"))
W(ability("Splinter Blast"))
W(ul_open())
W(li("Slow Duration decreased from 28/32/36/40% to 27/30/33/36%", b([28, 32, 36, 40], [27, 30, 33, 36])))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent Cold Embrace Base Heal per Second decreased from +20 to +15", b(20, 15)))
W(ul_close())

# Witch Doctor
W(hero_header("Witch Doctor"))
W(ability("Voodoo Restoration"))
W(ul_open())
W(li("Radius increased from 500/550/600/650 to 650", b([500, 550, 600, 650], 650)))
W(ul_close())

write_footer()
save_html('7.41c.html')

# ============================================================
# 7.41b content
# ============================================================
write_head("7.41b", "07.04.2026")

# ===== GENERAL UPDATES =====
W(section("General Updates"))

W(plain_header("Tormentor"))
W(ul_open())
W(li("Reflect Damage reflection per minute decreased from 2% to 1.5%", b(2, 1.5)))
W(ul_close())

# ===== ITEM UPDATES =====
W(section("Item Updates"))

W(item_header("Black King Bar"))
W(ul_open())
W(li("Avatar now has a fixed duration and is not affected by buff duration amplification", t("REWORK")))
W(ul_close())
W(item_header("Consecrated Wraps"))
W(ul_open())
W(li("All Attributes bonus decreased from +6 to +5", b(6, 5)))
W(li("Hallowed stacks are now item charges instead of a stack counter on the buff", t("REWORK")))
W(li("All charges are consumed when the barrier is created", t("MISC")))
W(li("Charge Restore Time of Hallowed is not affected by effects that reduce or modify cooldowns", t("MISC")))
W(li("Hallowed now starts with all 3 charges when Consecrated Wraps is purchased or built", t("REWORK")))
W(li("Gaining max stacks requirement for the speedup buff is removed", t("MISC")))
W(li("Initial 3 charges don't provide the movement speed buff", t("MISC")))
W(li("Hallowed charge gain time increased from 3s to 4s", b(3, 4)))
W(ul_close())
W(item_header("Gungir"))
W(ul_open())
W(li("Eternal Chains radius increased from 275 to 325", b(275, 325)))
W(li("Effective radius increased from 350 to 400 due to item's built-in Area of Effect bonus", b(350, 400)))
W(ul_close())
W(item_header("Heaven's Halberd"))
W(ul_open())
W(li("Health Regen bonus increased from +6 to +6.5", b(6, 6.5)))
W(ul_close())
W(item_header("Helm of the Overlord"))
W(ul_open())
W(li("Dominate cooldown decreased from 45s to 40s", b(45, 40, l=True)))
W(li("Dominate target unit's max health minimum increased from 1800 to 1900", b(1800, 1900, l=True)))
W(ul_close())
W(item_header("Holy Locket"))
W(ul_open())
W(li("Energy Charge incoming Heal Amplification increased from 10% to 15%", b(10, 15)))
W(li("Holy Blessing outgoing Heal Amplification decreased from 15% to 10%", b(15, 10)))
W(ul_close())
W(item_header("Mage Slayer"))
W(ul_open())
W(li("Health Regen bonus decreased from +6 to +5.5", b(6, 5.5)))
W(li("Magic Resistance bonus decreased from 20% to 18%", b(20, 18)))
W(ul_close())
W(item_header("Sange"))
W(ul_open())
W(li("Health Restoration bonus decreased from 16% to 12%", b(16, 12)))
W(ul_close())
W(item_header("Abyssal Blade"))
W(ul_open())
W(li("Health Restoration bonus decreased from 20% to 16%", b(20, 16)))
W(ul_close())
W(item_header("Sange and Yasha"))
W(ul_open())
W(li("Health Restoration bonus decreased from 20% to 16%", b(20, 16)))
W(ul_close())
W(item_header("Kaya and Sange"))
W(ul_open())
W(li("Health Restoration bonus decreased from 20% to 16%", b(20, 16)))
W(ul_close())
W(subgroup("Artifact changes"))
W(item_header("Jidi Pollen Bag"))
W(ul_open())
W(li("Pollinate radius increased from 700 to 900", b(700, 900)))
W(ul_close())
W(item_header("Conjurer's Catalyst"))
W(ul_open())
W(li("Spellover now has a 0.1s internal cooldown ", t("REWORK")))
W(ul_close())
W(subnote("Still can proc multiple times from a single instance of high damage"))
W(ul_open())
W(li("Spellover damage threshold increased from 100 to 200", b(100, 200)))
W(li("Spellover damage from hero targets increased from 40 to 80 ", b(40, 80)))
W(ul_close())
W(subnote("From 52 to 104 with Dormant Curio"))
W(ul_open())
W(li("Spellover damage from creep targets increased from 15 to 30 ", b(15, 30)))
W(ul_close())
W(subnote("From 19.5 to 39 with Dormant Curio"))
W(item_header("Enchanter's Bauble"))
W(ul_open())
W(li("Enchant base Neutral Enchantment bonus decreased from 15% to 10%", b(15, 10)))
W(ul_close())
W(item_header("Idol of Screeauk"))
W(ul_open())
W(li("False Flight duration increased from 5s to 6.5s ", b(5, 6.5)))
W(ul_close())
W(subnote("From 6.5s to 8.45s with Dormant Curio"))
W(item_header("Metamorphic Mandible"))
W(ul_open())
W(li("Pupate movement speed bonus increased from 15% to 20%", b(15, 20)))
W(ul_close())
W(item_header("Rattlecage"))
W(ul_open())
W(li("Reverberate projectile physical damage decreased from 110 to 90 ", b(110, 90)))
W(ul_close())
W(subnote("From 143 to 117 with Dormant Curio"))
W(item_header("Demonicon"))
W(ul_open())
W(li("Demonic Warrior no longer has True Sight ability", t("NERF")))
W(ul_close())
W(item_header("Minotaur Horn"))
W(ul_open())
W(li("Lesser Avatar bonus magic resistance increased from 50% to 60%", b(50, 60)))
W(ul_close())
W(item_header("Riftshadow Prism"))
W(ul_open())
W(li("Refract cooldown decreased from 30s to 27s", b(30, 27, l=True)))
W(ul_close())
W(subgroup("Enchantment changes"))
W(plain_header("Crude"))
W(ul_open())
W(li("Health Restoration bonus decreased from +10/15/20% to +9/12/15%", b([10, 15, 20], [9, 12, 15])))
W(ul_close())
W(plain_header("Frostbitten Golem"))
W(ul_open())
W(li("Time Warp Aura: Cooldown Reduction decreased from 10/11/12/14% to 8/9/10/11%", b([10, 11, 12, 14], [8, 9, 10, 11], l=True)))
W(ul_close())

# ===== HERO UPDATES =====
W(section("Hero Updates"))


# Alchemist
W(hero_header("Alchemist"))
W(ul_open())
W(li("Base Agility decreased from 22 to 19", b(22, 19)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent +1 Acid Spray Armor Reduction replaced with +1% Corrosive Weaponry Slow / Damage Reduction Per Stack", t("REWORK")))
W(li("Level 15 Talent +1% Corrosive Weaponry Slow / Damage Reduction Per Stack replaced with +1 Acid Spray Armor Reduction", t("REWORK")))
W(ul_close())

# Ancient Apparition
W(hero_header("Ancient Apparition"))
W(ability("Bone Chill"))
W(ul_open())
W(li("Aghanim's Scepter Strength Reduction bonus increased from 0.3 to 0.8", b(0.3, 0.8)))
W(ul_close())

# Anti-Mage
W(hero_header("Anti-Mage"))
W(ability("Mana Break"))
W(ul_open())
W(li("Max Mana Burned per hit increased from 1.6/2.4/3.2/4% to 1.8/2.7/3.6/4.5%", b([1.6, 2.4, 3.2, 4], [1.8, 2.7, 3.6, 4.5])))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent Blink Cast Range decreased from +150 to +125", b(150, 125)))
W(ul_close())

# Arc Warden
W(hero_header("Arc Warden"))
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent Magnetic Field Cooldown Reduction decreased from 5s to 4s", b(5, 4, l=True)))
W(li("Level 20 Talent +200 Spark Wraith Damage replaced with +30s Spark Wraith Duration", t("REWORK")))
W(li("Level 25 Talent +30s Spark Wraith Duration replaced with +240 Spark Wraith Damage", t("REWORK")))
W(li("Level 25 Talent Runic Infusion All Attributes Bonus decreased from +1.5 to +1", b(1.5, 1)))
W(ul_close())

# Batrider
W(hero_header("Batrider"))
W(ul_open())
W(li("Base Armor decreased by 1", t("NERF")))
W(ul_close())
W(ability("Firefly"))
W(ul_open())
W(li("Cooldown increased from 45/40/35/30s to 48/42/36/30s", b([45, 40, 35, 30], [48, 42, 36, 30], l=True)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 15 Talent Sticky Napalm Movement Slow increased from +0.5% to +0.75%", b(0.5, 0.75)))
W(ul_close())

# Beastmaster
W(hero_header("Beastmaster"))
W(ul_open())
W(li("Base Attack Speed decreased from 100 to 90", b(100, 90)))
W(ul_close())
W(ability("Wild Axes"))
W(ul_open())
W(li("Debuff Duration rescaled from 12s to 10/11/12/13s", b(12, [10, 11, 12, 13])))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent Armor decreased from +5 to +4", b(5, 4)))
W(li("Level 10 Talent Wild Axes Damage Amp Per Stack decreased from +2% to +1.5%", b(2, 1.5)))
W(ul_close())

# Bloodseeker
W(hero_header("Bloodseeker"))
W(ability("Rupture"))
W(ul_open())
W(li("Mana Cost increased from 100/150/200 to 125/175/225", b([100, 150, 200], [125, 175, 225], l=True)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 25 Talent Max Thirst Move Speed decreased from +18% to +15%", b(18, 15)))
W(ul_close())

# Broodmother
W(hero_header("Broodmother"))
W(ul_open())
W(li("Base agility increased from 18 to 20", b(18, 20)))
W(li("Damage at level 1 increased from 45-51 to 47-53", t("BUFF")))
W(ul_close())

# Chaos Knight
W(hero_header("Chaos Knight"))
W(ability("Phantasm"))
W(ul_open())
W(li("Cooldown increased from 75s to 85/80/75s", b(75, [85, 80, 75], l=True)))
W(li("Number of Phantasms increased from 1/2/3 to 3", b([1, 2, 3], 3)))
W(li("Phantasm Damage decreased from 100% to 50/75/100%", b(100, [50, 75, 100])))
W(ul_close())

# Chen
W(hero_header("Chen"))
W(ability("Holy Persuasion"))
W(ul_open())
W(li("Bonus Damage increased from 0/6/12/18% to 5/10/15/20%", b([0, 6, 12, 18], [5, 10, 15, 20])))
W(ul_close())

# Clinkz
W(hero_header("Clinkz"))
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent Strafe Duration increased from +0.75s to +1s", b(0.75, 1)))
W(ul_close())

# Crystal Maiden
W(hero_header("Crystal Maiden"))
W(ability("Crystal Clone"))
W(ul_open())
W(li("Cooldown increased from 10s to 12s", b(10, 12, l=True)))
W(ul_close())

# Dawnbreaker
W(hero_header("Dawnbreaker"))
W(ability("Break of Dawn"))
W(ul_open())
W(li("Max Damage Increase decreased from 10% + 1% per level to 8% + 1% per level", t("NERF")))
W(ul_close())

# Death Prophet
W(hero_header("Death Prophet"))
W(ability("Exorcism"))
W(ul_open())
W(li("Spirit Damage increased from 64 to 65/68/71 ", b(64, [65, 68, 71])))
W(li("From 62-67 to 62-68/65-71/68-74", t("MISC")))
W(ul_close())

# Doom
W(hero_header("Doom"))
W(ability("Scorched Earth"))
W(ul_open())
W(li("Damage decreased from 20/35/50/65 to 20/30/40/50", b([20, 35, 50, 65], [20, 30, 40, 50])))
W(ul_close())
W(ability("Doom"))
W(ul_open())
W(li("Damage per second decreased from 25/45/66 to 22/44/66", b([25, 45, 66], [22, 44, 66])))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent Devour grants 15% Magic Resistance replaced with +10% Magic Resistance", t("REWORK")))
W(li("Level 15 Talent +66 Damage replaced with +1.5% Infernal Blade Max HP As Damage", t("REWORK")))
W(li("Level 20 Talent +2.5% Infernal Blade Max HP As Damage replaced with +66 Damage", t("REWORK")))
W(ul_close())

# Drow Ranger
W(hero_header("Drow Ranger"))
W(ul_open())
W(li("Base Agility increased from 22 to 24", b(22, 24)))
W(li("Damage at level 1 increased from 49-56 to 51-58", t("BUFF")))
W(ul_close())
W(ability("Marksmanship"))
W(ul_open())
W(li("Enemy hero disable range decreased from 325 to 300", b(325, 300)))
W(ul_close())
W(ability("Glacier"))
W(ul_open())
W(li("While on the glacier, Marksmanship now can be disabled by enemies in the proximity", t("REWORK")))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 25 Talent Multishot Waves increased from +1 to +2", b(1, 2)))
W(ul_close())

# Elder Titan
W(hero_header("Elder Titan"))
W(ability("Momentum"))
W(ul_open())
W(li("Bonus Speed to Armor increased from 3.6% + 0.4% per level to 5.0% + 0.5% per level", t("BUFF")))
W(ul_close())

# Ember Spirit
W(hero_header("Ember Spirit"))
W(ul_open())
W(li("Base Damage decreased by 3", t("NERF")))
W(li("Damage at level 1 decreased from 55-59 to 52-56", t("NERF")))
W(ul_close())
W(ability("Sleight of Fist"))
W(ul_open())
W(li("Mana Cost increased from 60/65/70/75 to 75", b([60, 65, 70, 75], 75, l=True)))
W(ul_close())

# Enigma
W(hero_header("Enigma"))
W(ability("Event Horizon"))
W(ul_open())
W(li("Movement Slow increased from 4% + 1% per level to 5% + 1% per level", t("BUFF")))
W(ul_close())
W(ability("Demonic Conversion"))
W(ul_open())
W(li("Fixed Eidolons not having an 8 attack damage spread", t("MISC")))
W(li("Eidolon Damage increased from 16/27/38/49 to 16/28/40/52", b([16, 27, 38, 49], [16, 28, 40, 52])))
W(li("As a result, damage changed from 16/27/38/49 to 12-20/24-32/36-44/48-56", b([16, 27, 38, 49], 12)))
W(ul_close())

# Gyrocopter
W(hero_header("Gyrocopter"))
W(ability("Flak Cannon"))
W(ul_open())
W(li("Cooldown rescaled from 26/24/22/20s to 25s", b([26, 24, 22, 20], 25, l=True)))
W(ul_close())
W(ability("Call Down"))
W(ul_open())
W(li("Cooldown decreased from 90/75/60s to 75/65/55s", b([90, 75, 60], [75, 65, 55], l=True)))
W(ul_close())

# Hoodwink
W(hero_header("Hoodwink"))
W(ability("Hunter's Boomerang"))
W(ul_open())
W(li("Debuff Duration decreased from 7s to 6s", b(7, 6)))
W(ul_close())

# Invoker
W(hero_header("Invoker"))
W(ability("Invoke"))
W(ul_open())
W(li("Now grants Invoker an additional Ability Point at hero levels 6, 12, and 18", t("BUFF")))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent +1 Orb Levels replaced with +50% Forged Spirit Armor Reduction", t("REWORK")))
W(ul_close())

# Jakiro
W(hero_header("Jakiro"))
W(ability("Dual Breath"))
W(ul_open())
W(li("Cooldown rescaled from 10s to 12/11/10/9s", b(10, [12, 11, 10, 9], l=True)))
W(ul_close())
W(ability("Liquid Fire"))
W(ul_open())
W(li("Burn Damage rescaled from 15/25/35/45 to 12/24/36/48", b([15, 25, 35, 45], [12, 24, 36, 48])))
W(ul_close())
W(ability("Macropyre"))
W(ul_open())
W(li("Mana Cost decreased from 300/400/500 to 250/350/450", b([300, 400, 500], [250, 350, 450], l=True)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent Macropyre Damage increased from +20 to +25", b(20, 25)))
W(ul_close())

# Juggernaut
W(hero_header("Juggernaut"))
W(ul_open())
W(li("Base Movement Speed increased from 300 to 305", b(300, 305)))
W(ul_close())
W(ability("Bladeform"))
W(ul_open())
W(li("Base Agility per stack increased from 2.5% + 0.05% per level to 2.5% + 0.1% per level", t("BUFF")))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent Blade Fury Damage per second increased from +100 to +120", b(100, 120)))
W(ul_close())

# Keeper of the Light
W(hero_header("Keeper of the Light"))
W(ability("Bright Speed"))
W(ul_open())
W(li("Intelligence required for 1 movement speed increased from 2.5 to 3", b(2.5, 3, l=True)))
W(ul_close())
W(ability("Spirit Form"))
W(ul_open())
W(li("Cast Range Bonus decreased from 100/200/300 to 100/175/250", b([100, 200, 300], [100, 175, 250])))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 15 Talent Spirit Form Bright Speed Bonus decreased from +30% to +25%", b(30, 25)))
W(ul_close())

# Largo
W(hero_header("Largo"))
W(ability("Encore"))
W(ul_open())
W(li("Bonus Duration increased from 9% + 1% per level to 10% + 1% per level", t("BUFF")))
W(ul_close())
W(ability("Croak of Genius"))
W(ul_open())
W(li("Mana Cost rescaled from 25/35/45/55 to 40", b([25, 35, 45, 55], 40, l=True)))
W(li("Duration increased from 12/18/24/30s to 15/20/25/30s", b([12, 18, 24, 30], [15, 20, 25, 30])))
W(ul_close())
W(ability("Fight Song"))
W(ul_open())
W(li("Aghanim's Scepter Damage per stack decreased from 6/12/18 to 6/10/14", b([6, 12, 18], [6, 10, 14])))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent Catchy Lick Damage increased from +170 to +200", b(170, 200)))
W(ul_close())

# Lycan
W(hero_header("Lycan"))
W(ability("Shapeshift"))
W(ul_open())
W(li("Cooldown decreased from 110/100/90s to 105/95/85s", b([110, 100, 90], [105, 95, 85], l=True)))
W(ul_close())

# Magnus
W(hero_header("Magnus"))
W(ul_open())
W(li("Agility gain increased from 2.0 to 2.2", b(2.0, 2.2)))
W(li("Damage gain per level increased from 3.2 to 3.3", b(3.2, 3.3)))
W(ul_close())

# Meepo
W(hero_header("Meepo"))
W(ul_open())
W(li("Base Movement Speed decreased from 315 to 310", b(315, 310)))
W(li("Strength gain decreased from 2.2 to 2.0", b(2.2, 2.0)))
W(ul_close())
W(ability("Ransack"))
W(ul_open())
W(li("Health Steal (Heroes) decreased from 9/12/15/18 to 7/10/13/16", b([9, 12, 15, 18], [7, 10, 13, 16])))
W(ul_close())
W(ability("Divided We Stand"))
W(ul_open())
W(li("Max Health and Max Mana bonuses from items are now penalized by the number of Meepos (like other item bonuses)", t("REWORK")))
W(li("No longer shares cooldowns of Town Portal Scrolls", t("NERF")))
W(ul_close())
W(ability("MegaMeepo"))
W(ul_open())
W(li("Cooldown increased from 60s to 90s", b(60, 90, l=True)))
W(li("Duration decreased from 25s to 20s", b(25, 20)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent +40 Poof Damage replaced with -1.5s Earthbind Cooldown", t("REWORK")))
W(li("Level 15 Talent -2.5s Earthbind Cooldown replaced with +40 Poof Damage", t("REWORK")))
W(li("Level 20 Talent Ransack Health Steal decreased from +7 to +6", b(7, 6)))
W(ul_close())

# Monkey King
W(hero_header("Monkey King"))
W(ability("Transfiguration"))
W(ul_open())
W(li("Cooldown increased from 3s to 5s", b(3, 5, l=True)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent Tree Dance Cast Range decreased from +350 to +300", b(350, 300)))
W(ul_close())

# Naga Siren
W(hero_header("Naga Siren"))
W(ul_open())
W(li("Base Attack Speed decreased from 110 to 100", b(110, 100)))
W(ul_close())
W(ability("Eelskin"))
W(ul_open())
W(li("Evasion per Naga decreased from 4.9% + 0.1% per level to 4% + 0.1% per level", t("NERF")))
W(ul_close())

# Nature's Prophet
W(hero_header("Nature's Prophet"))
W(ability("Wrath of Nature"))
W(ul_open())
W(li("Base Damage increased from 90/130/170 to 100/140/180", b([90, 130, 170], [100, 140, 180])))
W(ul_close())

# Necrophos
W(hero_header("Necrophos"))
W(ability("Death Seeker"))
W(ul_open())
W(li("Mana Cost increased from 125 to 160", b(125, 160, l=True)))
W(ul_close())

# Night Stalker
W(hero_header("Night Stalker"))
W(ul_open())
W(li("Base Health Regen decreased by 1.25", t("NERF")))
W(ul_close())

# Nyx Assassin
W(hero_header("Nyx Assassin"))
W(ability("Vendetta"))
W(ul_open())
W(li("Duration decreased from 60s to 45/50/55s", b(60, [45, 50, 55])))
W(ul_close())

# Omniknight
W(hero_header("Omniknight"))
W(ability("Hammer of Purity"))
W(ul_open())
W(li("Damage to heal increased from 30% to 35%", b(30, 35)))
W(ul_close())
W(ability("Guardian Angel"))
W(ul_open())
W(li("Duration increased from 4/4.5/5s to 4/4.75/5.5s", b([4, 4.5, 5], [4, 4.75, 5.5])))
W(li("Aghanim's Scepter Bonus Health Restoration decreased from 100% to 50%", b(100, 50)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent Degen Aura Radius increased from +125 to +150", b(125, 150)))
W(ul_close())

# Pangolier
W(hero_header("Pangolier"))
W(ability("Lucky Shot"))
W(ul_open())
W(li("Attack Speed Reduction decreased from 40/80/120/160 to 35/70/105/140", b([40, 80, 120, 160], [35, 70, 105, 140])))
W(ul_close())
W(ability("Gyroshell"))
W(ul_open())
W(li("Total Attack Damage as Damage decreased from 100% to 80%", b(100, 80)))
W(ul_close())

# Phantom Assassin
W(hero_header("Phantom Assassin"))
W(ul_open())
W(li("Strength gain increased from 2.0 to 2.2", b(2.0, 2.2)))
W(ul_close())
W(ability("Phantom Strike"))
W(ul_open())
W(li("Duration increased from 2.5s to 3s", b(2.5, 3)))
W(li("Bonus Attack Speed rescaled from 100/130/160/190 to 80/120/160/200", b([100, 130, 160, 190], [80, 120, 160, 200])))
W(ul_close())
W(ability("Coup de Grace"))
W(ul_open())
W(li("Critical Damage increased from 200/300/400% to 200/325/450%", b([200, 300, 400], [200, 325, 450])))
W(ul_close())

# Phoenix
W(hero_header("Phoenix"))
W(ul_open())
W(li("Base Attack Range decreased from 525 to 500", b(525, 500)))
W(ul_close())
W(ability("Sun Ray"))
W(ul_open())
W(li("Aghanim's Shard no longer slows affected enemies by 10%", t("NERF")))
W(ul_close())

# Primal Beast
W(hero_header("Primal Beast"))
W(ability("Pulverize"))
W(ul_open())
W(li("Cooldown increased from 40/35/30s to 45/40/35s", b([40, 35, 30], [45, 40, 35], l=True)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent Damage decreased from +30 to +25", b(30, 25)))
W(ul_close())

# Pudge
W(hero_header("Pudge"))
W(ability("Graft Flesh"))
W(ul_open())
W(li("Strength gain per stack increased from 1.6 to 2.0", b(1.6, 2.0)))
W(ul_close())

# Rubick
W(hero_header("Rubick"))
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent Telekinesis Landing Damage decreased from 325 to 300", b(325, 300)))
W(ul_close())

# Sand King
W(hero_header("Sand King"))
W(ability("Epicenter"))
W(ul_open())
W(li("Attack Slow decreased from 50/55/60 to 30/40/50", b([50, 55, 60], [30, 40, 50])))
W(li("Aghanim's Scepter Stinger damage decreased from 50% to 40%", b(50, 40)))
W(ul_close())

# Shadow Demon
W(hero_header("Shadow Demon"))
W(ability("Disruption"))
W(ul_open())
W(li("Illusion Duration decreased from 11/12/13/14s to 8/10/12/14s", b([11, 12, 13, 14], [8, 10, 12, 14])))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 15 Talent Movement Speed decreased from +25 to +20", b(25, 20)))
W(ul_close())

# Shadow Shaman
W(hero_header("Shadow Shaman"))
W(ul_open())
W(li("Intelligence gain decreased from 3.5 to 3.3", b(3.5, 3.3)))
W(ul_close())

# Silencer
W(hero_header("Silencer"))
W(subgroup("Talents"))
W(ul_open())
W(li("Level 15 Talent Global Silence Cooldown Reduction decreased from 20s to 15s", b(20, 15, l=True)))
W(ul_close())

# Skywrath Mage
W(hero_header("Skywrath Mage"))
W(ul_open())
W(li("Base Mana Regen increased by 0.25", t("BUFF")))
W(ul_close())

# Slardar
W(hero_header("Slardar"))
W(ability("Sprint"))
W(ul_open())
W(li("Cooldown increased from 29/25/21/17s to 33/28/23/18s", b([29, 25, 21, 17], [33, 28, 23, 18], l=True)))
W(ul_close())

# Slark
W(hero_header("Slark"))
W(ability("Essence Shift"))
W(ul_open())
W(li("Duration decreased from 12.5s + 2.5s per level to 10s + 2.5s per level", t("NERF")))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent Essence Shift Duration decreased from +25s to +20s", b(25, 20)))
W(ul_close())

# Snapfire
W(hero_header("Snapfire"))
W(ability("Scatterblast"))
W(ul_open())
W(li("Cooldown decreased from 18/15/12/9s to 17/14/11/8s", b([18, 15, 12, 9], [17, 14, 11, 8], l=True)))
W(li("Initial radius increased from 225 to 250", b(225, 250)))
W(ul_close())

# Spectre
W(hero_header("Spectre"))
W(ul_open())
W(li("Strength gain decreased from 2.4 to 2.3", b(2.4, 2.3)))
W(ul_close())
W(ability("Dispersion"))
W(ul_open())
W(li("Max Radius decreased from 800 to 700", b(800, 700)))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent Spectral Dagger Cooldown Reduction decreased from 4s to 3s", b(4, 3, l=True)))
W(ul_close())

# Techies
W(hero_header("Techies"))
W(subgroup("Talents"))
W(ul_open())
W(li("Level 10 Talent Magic Resistance decreased from +20% to +15%", b(20, 15)))
W(li("Level 15 Talent Blast Off! Damage decreased from +200 to +175", b(200, 175)))
W(ul_close())

# Terrorblade
W(hero_header("Terrorblade"))
W(subgroup("Talents"))
W(ul_open())
W(li("Level 20 Talent Conjure Image Duration decreased from +10s to +8s", b(10, 8)))
W(ul_close())

# Tidehunter
W(hero_header("Tidehunter"))
W(ul_open())
W(li("Base Strength decreased from 26 to 25", b(26, 25)))
W(li("Damage at level 1 decreased from 51-57 to 50-56", t("NERF")))
W(ul_close())
W(ability("Leviathan's Catch"))
W(ul_open())
W(li("Now gains fish on every even level instead of every level", t("REWORK")))
W(ul_close())
W(subgroup("Talents"))
W(ul_open())
W(li("Level 15 Talent Gush Damage decreased from +100 to +90", b(100, 90)))
W(li("Level 25 Talent Anchor Smash affects buildings now deals 50% damage to buildings", t("REWORK")))
W(ul_close())

# Timbersaw
W(hero_header("Timbersaw"))
W(ability("Whirling Death"))
W(ul_open())
W(li("Damage rescaled from 75/120/165/210 to 60/120/180/240", b([75, 120, 165, 210], [60, 120, 180, 240])))
W(ul_close())
W(ability("Timber Chain"))
W(ul_open())
W(li("Damage increased from 45/100/155/210 to 45/105/165/225", b([45, 100, 155, 210], [45, 105, 165, 225])))
W(ul_close())
W(ability("Chakram"))
W(ul_open())
W(li("Pass Damage rescaled from 100/150/200 to 75/150/225", b([100, 150, 200], [75, 150, 225])))
W(ul_close())

# Tinker
W(hero_header("Tinker"))
W(ability("Deploy Turrets"))
W(ul_open())
W(li("Missile speed increased from 1200 to 1350", b(1200, 1350)))
W(li("Base activation time decreased from 0.3s to 0s", b(0.3, 0, l=True)))
W(li("Aghanim's Scepter no longer makes activation faster", t("NERF")))
W(ul_close())

# Tiny
W(hero_header("Tiny"))
W(ul_open())
W(li("Intelligence gain increased from 2.2 to 2.4", b(2.2, 2.4)))
W(ul_close())
W(ability("Tree Channel"))
W(ul_open())
W(li("No longer applies cleave", t("NERF")))
W(ul_close())

# Treant Protector
W(hero_header("Treant Protector"))
W(ability("Nature's Grasp"))
W(ul_open())
W(li("Cooldown increased from 20/19/18/17s to 23/21/19/17s", b([20, 19, 18, 17], [23, 21, 19, 17], l=True)))
W(ul_close())

# Tusk
W(hero_header("Tusk"))
W(ability("Bitter Chill"))
W(ul_open())
W(li("Attack Slow decreased from 17 + 3 per level to 12 + 3 per level", t("NERF")))
W(ul_close())
W(ability("Drinking Buddies"))
W(ul_open())
W(li("No longer has an alt-cast", t("NERF")))
W(li("Bonus Armor decreased from 10 to 7", b(10, 7)))
W(ul_close())

# Void Spirit
W(hero_header("Void Spirit"))
W(ability("Dissimilate"))
W(ul_open())
W(li("Damage decreased from 120/200/280/360 to 105/185/265/345", b([120, 200, 280, 360], [105, 185, 265, 345])))
W(ul_close())

# Windranger
W(hero_header("Windranger"))
W(ul_open())
W(li("Base Health Regen increased by 0.5", t("BUFF")))
W(ul_close())
W(ability("Powershot"))
W(ul_open())
W(li("Slow increased from 20/25/30/35% to 22/28/34/40%", b([20, 25, 30, 35], [22, 28, 34, 40])))
W(ul_close())
W(ability("Gale Force"))
W(ul_open())
W(li("Cooldown decreased from 30s to 25s", b(30, 25, l=True)))
W(ul_close())

write_footer()
save_html('7.41b.html')
