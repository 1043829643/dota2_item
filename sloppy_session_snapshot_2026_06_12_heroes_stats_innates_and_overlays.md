# Sloppy Session Snapshot — 2026-06-12 (heroes stats / overlay / chest follow-up)

Project: `C:\Users\sikle\Documents\Sloppy`

Read this and `AGENTS.md` first. User language: Russian. Generated HTML files are
gitignored; deploy happens by pushing source to `main`, then CI rebuilds and
publishes Pages.

## What changed in this follow-up

### 1. Hero Stats: innate-derived stat model expanded
- `heroes_stats.html` now models innate-derived stats as real computed values in
  `Starting` / `Expanded`, while `Base` still ignores them.
- Implemented / wired:
  - `Axe` — One Man Army treated as always active when `Innates` toggle is on
    (project rule from user). Bonus Strength = `50% of current armor`, and that
    flows into displayed `STR`, `HP`, `HP/sec`, and `Damage`.
  - `Techies` — mana regen from mana pool is included in computed `MP/sec`.
  - Existing conversions kept: `Morphling`, `Void Spirit`, `Centaur`.
- `+2 stats` toggle added and enabled by default. It applies the automatic
  `+2 all attributes` level-ups at levels `15/16/17/19/20/21/22`.
- `Innates` toggle added and enabled by default. Turning it off removes innate
  stat contributions from Hero Stats.

### 2. Hero Stats: rule fixes for derived stats
- Derived stats now use **floored attributes** where the game truncates before
  converting:
  - `HP`
  - `MP`
  - primary-attribute damage
- This fixed the visible Medusa discrepancy on high-level mana.
- Important rule: distinguish:
  - `per level up` → increment starts after level 1 (`level - 1`)
  - `per level` → level 1 already counts
- For `Techies`, current mana-pool regen formula is treated as:
  - `7.41a–7.41b`: `0.08% + 0.02% per level`
  - `7.41c+`: `0.10% + 0.01% per level`
  - This is **per level**, not per level up.

### 3. Hero Stats: presentation changes
- `Damage` column now shows **average damage only**.
- `Dmg min` / `Dmg max` remain separate columns in `Expanded`.
- Heroes whose **modelled** innate affects stats in Hero Stats get a mini innate
  icon next to the hero name:
  - currently: `Axe`, `Centaur`, `Morphling`, `Techies`, `Void Spirit`
- The mini innate icon disappears when the `Innates` toggle is off.
- The innate icon + hero name are wrapped in `.mr-name-body` so they stay on one
  line.

### 4. Sticky vertical divider / blue seam fixes
- General overlay fix in `scripts.js`:
  - vertical divider height is clamped to the **real table bottom**, not the
    whole `.creeps-scroll` box bottom. This fixes the blue line extending too far
    down when only a few rows remain after filtering/search.
- Applied to both:
  - the shared `.sticky-frame` logic used by creeps / dynamics tables
  - the dedicated `heroes_stats` `.hs-sticky-frame` logic
- `heroes_dyn.html` follow-up:
  - when `Hide old` is ON (fit mode), `scrollLeft` is reset to `0`
  - divider visibility now depends on real horizontal overflow, not only on
    `scrollLeft`
  - for `heroes_dyn`, divider `left` is anchored from `th.hd-hero`, not the
    first body row, to remove the extra gap from the Hero column

### 5. Items tile chest animation
- `scripts/gen_chest_icon.py` adjusted again:
  - intro trimmed / stabilized
  - loop rebuilt from stable open-chest poses only, mirrored for gentler wrap
- Outputs used by the index opener tile:
  - `icons/ui/gothic/icon_chest.png`
  - `icons/ui/gothic/icon_chest_open.png`
  - `icons/ui/gothic/icon_chest_loop.png`
- `scripts.js` `INTRO_MS` updated to match the current generated intro duration.

## Files changed in this follow-up
- `AGENTS.md`
- `build_heroes_stats.py`
- `scripts.js`
- `styles.css`
- `scripts/gen_chest_icon.py`
- `icons/ui/gothic/icon_chest.png`
- `icons/ui/gothic/icon_chest_open.png`
- `icons/ui/gothic/icon_chest_loop.png`

## Untracked / do not commit accidentally
- `chest_all_frames_sheet.png`
- `chest_all_frames_sheet2.png`
- `icons/dyn_gems/`
- `icons/ui/gothic/icon_dynamics_items.gif`
- `icons/ui/gothic/icon_dynamics_items.png`
- `scripts/gen_items_dynamics_icon.py`
- `patches/` (ignored generated HTML)

## Rebuild order
If source changes again before deploy:

```bash
python build_patch.py
python build_creeps.py
python build_mana_items.py
python build_heroes_stats.py
python build_heroes_dyn.py
python build_items_dyn.py
python build_terrain.py
```

On Windows, prefer:

```bash
$env:PYTHONIOENCODING='utf-8'; python build_patch.py
```

## Notes for Claude Code
- Do not `git add -A`.
- Stage only source files and intentional committed assets.
- Generated HTML files are gitignored and rebuilt in CI.
- The user explicitly wants learned rules preserved in `AGENTS.md`.
