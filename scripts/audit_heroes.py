"""audit_heroes.py — Verify every hero_header() display name in
build_patch.py matches the live Valve in-game hero name, and that the
HERO_SLUG-resolved icon file exists locally.

Flags:
  - display name doesn't match any Valve hero (typo or rename)
  - HERO_SLUG resolves to a slug that has no local PNG

Fetches the live Valve hero list automatically. Run before publishing:

    python scripts/audit_heroes.py
"""
import json
import re
import sys
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
DATAFEED = "https://www.dota2.com/datafeed/herolist?language=english"

print("Fetching live Valve hero list...")
try:
    with urlopen(DATAFEED, timeout=15) as r:
        data = json.loads(r.read().decode("utf-8"))
except Exception as e:
    print(f"X cannot fetch datafeed: {e}")
    sys.exit(1)

# name_loc -> engine_slug (engine = npc_dota_hero_<slug>)
valve_names = set()
engine_for_loc = {}
for h in data["result"]["data"]["heroes"]:
    eng = h["name"].replace("npc_dota_hero_", "")
    loc = h["name_loc"]
    valve_names.add(loc)
    engine_for_loc[loc] = eng

src = (ROOT / "build_patch.py").read_text(encoding="utf-8")

# Pull HERO_SLUG mapping (entries may share a line, so findall every "k": "v")
m = re.search(r"HERO_SLUG\s*=\s*\{(.*?)\n\}", src, re.S)
hero_slug_map = dict(re.findall(r'"([^"]+)"\s*:\s*"([^"]+)"', m.group(1)))

# Pull every hero_header("...") display name
calls = sorted(set(re.findall(r'hero_header\("([^"]+)"', src)))
print(f"hero_header() calls referencing {len(calls)} unique display names")
print(f"HERO_SLUG overrides: {len(hero_slug_map)}\n")

icons_dir = ROOT / "icons" / "heroes"

problems = []
for display in calls:
    # Resolved slug used for icon path
    if display in hero_slug_map:
        resolved_slug = hero_slug_map[display]
    else:
        # build_patch.py's naive derivation
        resolved_slug = display.lower().replace(" ", "_").replace("'", "").replace("-", "")

    icon_present = (icons_dir / f"{resolved_slug}.png").exists()

    if display not in valve_names:
        problems.append((display, resolved_slug, None, icon_present, "display NOT in Valve hero list"))
        continue

    # Verify the resolved slug matches Valve's engine name for this display
    valve_engine = engine_for_loc[display]
    if resolved_slug != valve_engine:
        problems.append((display, resolved_slug, valve_engine, icon_present,
                         f"slug mismatch: build resolves to '{resolved_slug}', Valve engine is '{valve_engine}'"))
        continue

    if not icon_present:
        problems.append((display, resolved_slug, valve_engine, icon_present, "icon missing locally"))

if not problems:
    print("All clean.")
    sys.exit(0)

print(f"{len(problems)} problems:\n")
for display, slug, valve_eng, icon, note in problems:
    print(f"  [{note}]")
    print(f"    display in build_patch.py : {display}")
    print(f"    resolved icon slug        : {slug}")
    print(f"    valve engine name         : {valve_eng}")
    print(f"    icon present              : {icon}")
    print()
