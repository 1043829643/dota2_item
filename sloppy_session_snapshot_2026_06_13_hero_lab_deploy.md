# Sloppy session snapshot — 2026-06-13 — Hero Lab deploy handoff

Current branch: `main`

## What changed

- `hero_lab.html` remains part of the Heroes materials sub-nav.
- `Hero Lab` now uses the shared Materials page shell again:
  - page container changed to `container creeps-page hero-lab-page`
  - sub-nav placement now follows the same structure as other Materials pages
  - blurb text was rewritten and kept directly under the sub-nav
- Diff header now shows `left hero vs right hero`.
- Hero level input no longer triggers the hero picker.
- Neutral item + enchantment logic exists:
  - separate neutral slot
  - separate enchantment slot
  - enchantment is included in calculator totals

## Current Hero Lab state

This is **not a finished visual solution**.

The user explicitly said the current Hero Lab result is unsuccessful and wants to continue later in Claude with context preserved.

### Visual state now

- Hero portrait uses the existing `icons/heroes/*.png` asset and is shown with `object-fit: contain`.
- Main inventory block is wider than before and uses site-style dark slots, not the copied Dota HUD texture treatment.
- Neutral + enchantment slots are square now.
- Neutral slot top edge is aligned with the top edge of the 6-slot inventory grid.

### What the user still disliked

- Hero portrait treatment is still not acceptable. Root issue: `icons/heroes/*.png` is a wide hero-art asset, not a square portrait asset like the desired table-style icon.
- Hero Lab page layout had previously diverged from shared Materials layout rules; part of that was corrected in this session.
- Neutral/enchantment composition is still considered visually weak overall.

## Files touched in this deploy

- `build_hero_lab.py`
- `hero_lab.html`
- `scripts.js`
- `styles.css`

## Files intentionally not committed

These existed in the worktree and were left out:

- `chest_all_frames_sheet.png`
- `chest_all_frames_sheet2.png`
- `icons/dyn_gems/`
- `icons/ui/hud/`
- `patches/`
- `scripts/gen_items_dynamics_icon.py`
- older snapshot markdown files not needed for this commit

## Recommended next step for Claude

Do not iterate on the current `icons/heroes/*.png` portrait treatment forever. If the goal is "like heroes_stats", switch Hero Lab to the same hero-art source/markup pattern used there instead of forcing a wide image into a square card.
