# Sloppy session snapshot — 2026-06-13 — Hero Lab layout fixes (post-4552b493)

Project: `C:\Users\sikle\Documents\Sloppy`
HEAD on `main`: **`4552b493`** (Codex's deploy — already on GitHub Pages)
Local working tree: **NOT YET DEPLOYED** — user has not said `deploy`.

## What this session fixed (local changes, not pushed)

The user reported four problems on top of Codex's `4552b493`:

1. **Materials sub-nav / blurb placement** didn't match other Materials pages.
2. **Neutral slot top edge** didn't align with the top of the 6-slot inventory grid; slot needed a small right nudge.
3. **Connector arrow** between neutral and enchantment slot floated outside the neutral block.
4. **Neutral / enchant slots** had empty bands above and below the chosen item icon.
5. **Hero portrait** was forced into 88×88 + `contain` so the wide hero-art letterboxed inside `.hl-identity`.

### Fixes applied

- `build_hero_lab.py`: wrapped `<p class="mr-blurb"> + <div class="hero-lab">` in
  `<div class="creeps-scroll">`. This is the shared Materials-page rule used by
  `heroes_stats.html`, `mana_items.html`, etc.; without it the blurb and sub-nav
  sit at the wrong vertical offset. See AGENTS rule:
  `sloppy_table_pages_shared_rules`.
- `styles.css` `.hl-hud / .hl-identity / .hl-portrait-wrap / .hl-hero-icon /
  .hl-hero-trigger`: switched from **88×88 with `object-fit: contain`** to
  **124×72 with `object-fit: cover`**, mirroring the wide-rect pattern that
  `heroes_stats` uses for `.mr-ico` (36×26 + cover). The `icons/heroes/*.png`
  asset is a wide ~16:9 hero-art tile, so the cover-fit fills the rect without
  the previous top/bottom blank bands.
- `styles.css` `.hl-neutral-stack`: rebuilt as a 5-row CSS Grid
  `4px / 52px / 12px / 30px / 4px`, fixed height 122px, matching the
  inventory grid height. The 4px top spacer matches the inv-grid's 4px
  top-padding so the neutral slot's top edge lines up with the top of the
  6-slot grid exactly. Also pushed `margin-left` from 8px → 14px.
- `styles.css` `.hl-neutral-stack::after`: connector arrow now lives on the
  3rd grid row (`grid-row: 3; align-self: stretch`) instead of being
  absolutely positioned with `top: 52px`. This makes it impossible for the
  arrow to escape the stack when slot sizes change.
- `styles.css` `.hl-enchant-slot img, .hl-neutral-slot img`: switched both
  to `object-fit: cover` so the icon fills the slot, removing the top/bottom
  blank bands the user saw on selected items.

### Files touched

- `build_hero_lab.py`
- `styles.css`

(The earlier untracked `icons/ui/hud/` Valve-HUD-texture experiments stay
untracked — Codex's `4552b493` already moved Hero Lab to site-style slots, and
the HUD textures are not used in the current build.)

## Untracked / intentionally NOT committed

- `chest_all_frames_sheet*.png`
- `icons/dyn_gems/`
- `icons/ui/hud/`
- `patches/`
- `scripts/gen_items_dynamics_icon.py`
- older snapshot markdowns

## Next steps after deploy

If the user wants the **Valve HUD inventory look** (real `item_bg.png` /
`inventory_item_well.png` / `inventory_item_bevel.png` / `inventory_panel.png`
textures), they're in `icons/ui/hud/` locally with the exact reference values
from `panorama/styles/hud/dota_hud_ability_panel.css`:

- `#ButtonSize`: 60×45 px
- `background-image: inventory_item_well_psd.vtex`
- `background-color: #1a1c1d88`
- `box-shadow: fill #000000aa 0 0 2px 0`
- `#AbilityBevel` overlay: `inventory_item_bevel_psd.vtex`,
  `background-size: contain`, no-repeat, centered

But the user already rejected that visual direction (felt too "in-game" and
not enough "site-style"), so don't reintroduce it without explicit ask.
