"""check_icons.py — Verify every ability icon referenced in built HTML exists
as a local file under icons/abilities/, or has a documented onerror fallback
to icons/misc/innate_icon.png (the intentional pattern for innate abilities
Valve doesn't expose public CDN art for — see patch/elements.py's ability()).

Scans dist/ HTML for <img ... src="...icons/abilities/...png" ...> tags.
References with no local file AND no innate-icon onerror fallback are real
404s and fail the build. Run after build_site.py.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIST_DIR = ROOT / "dist"
ICONS_DIR = ROOT / "icons" / "abilities"

if not DIST_DIR.exists():
    print("dist/ not found. Run python build_site.py first.")
    sys.exit(1)

# Collect <img ...> tags whose src references icons/abilities/*.png, and note
# whether each tag also carries an onerror fallback to innate_icon.png.
img_re = re.compile(r'<img\b[^>]*\bsrc="[^"]*icons/abilities/([^"/]+\.png)"[^>]*>')
referenced = {}  # slug -> True if every occurrence has the innate fallback
for html_file in DIST_DIR.rglob("*.html"):
    text = html_file.read_text(encoding="utf-8", errors="replace")
    for m in img_re.finditer(text):
        slug = m.group(1)
        has_fallback = "innate_icon.png" in m.group(0)
        referenced[slug] = referenced.get(slug, True) and has_fallback

print(f"Ability icon references found in dist/: {len(referenced)}")

missing = sorted(s for s in referenced if not (ICONS_DIR / s).exists())
unfallback_missing = [s for s in missing if not referenced[s]]
fallback_missing = [s for s in missing if referenced[s]]
ok_count = len(referenced) - len(missing)

print(f"OK:                     {ok_count}")
print(f"Missing (with fallback): {len(fallback_missing)}")
print(f"Missing (no fallback):   {len(unfallback_missing)}")

if fallback_missing:
    print("\nMissing local files, but every reference has an onerror fallback")
    print("to innate_icon.png (intentional — confirmed innate ability with no")
    print("public Valve CDN art, see KNOWN_NON_DATAFEED_ABILITIES):")
    for fname in fallback_missing:
        print(f"  ok-fallback  {fname}")

if unfallback_missing:
    print("\nMissing local icon files with NO fallback (will 404 broken in browser):")
    for fname in unfallback_missing:
        print(f"  MISSING  {fname}")
    sys.exit(1)

print("\nAll referenced ability icons present locally or gracefully fall back.")
