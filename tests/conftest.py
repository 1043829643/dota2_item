"""Shared pytest fixtures for the Sloppy patch-builder test suite."""
import os
import pytest


@pytest.fixture(autouse=True, scope="session")
def project_root():
    """Ensure the working directory is the project root so relative data paths work."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)


@pytest.fixture(autouse=True)
def reset_output():
    """Clear H before and after every test so output never bleeds between tests."""
    from patch.output import reset_output as _reset
    _reset()
    yield
    _reset()


def _reset_state_fields():
    """Reset all mutable fields on both the _State class and its singleton.

    _State uses class-level attributes as defaults.  Some functions (e.g.
    section()) mutate *class* attributes directly (e.g. _State.current_sections
    .append(...)), while other code may read them via the ``state`` instance.
    We must reset the class-level list/dict in-place (not re-assign) so that
    both sides stay in sync, and also reset scalar attrs on the instance.
    """
    from patch.state import state, _State

    # In-place clear of mutable class-level collections so references held
    # inside module code (which access _State.current_sections etc.) stay valid.
    _State.current_sections.clear()
    _State.ability_icons.clear()
    _State.dynamics.clear()

    # Scalar attributes — safe to assign directly on the instance.
    state.block_open = False
    state.current_hero = None
    state.ability_block_open = False
    state.next_ul_is_hero_stats = False
    state.in_stats_ul = False
    state.section_panel_open = False
    state.seen_abilities_subgroup = False
    state.seen_facets_subgroup = False
    state.current_section_slug = None
    state.current_patch_version = None
    state.current_entity_key = None
    state.current_entity_display = None
    state.dyn_skip_li = False


@pytest.fixture(autouse=True)
def reset_state():
    """Reset all mutable fields on the _State singleton between tests."""
    _reset_state_fields()
    yield
    _reset_state_fields()
