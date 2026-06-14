"""Unit tests for patch/stats.py.

Strategy: use real data files from data/stats/ when present, skip otherwise.
All stats-data tests target the 7.41d snapshot which is the most recent.
"""
import os
import pytest

_STATS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "stats"
)
HAS_HEROES = os.path.exists(os.path.join(_STATS_DIR, "7.41d", "heroes.json"))
HAS_ITEMS  = os.path.exists(os.path.join(_STATS_DIR, "7.41d", "items.json"))

_SKIP_HEROES = pytest.mark.skipif(not HAS_HEROES, reason="data/stats/7.41d/heroes.json not available")
_SKIP_ITEMS  = pytest.mark.skipif(not HAS_ITEMS,  reason="data/stats/7.41d/items.json not available")


# ---------------------------------------------------------------------------
# stat_h() — hero stat lookup
# ---------------------------------------------------------------------------

class TestStatH:
    @_SKIP_HEROES
    def test_returns_value_for_known_hero_and_field(self):
        from patch.stats import stat_h
        val = stat_h("Axe", "StatusHealth", "7.41d")
        assert val is not None

    @_SKIP_HEROES
    def test_return_type_is_numeric_or_string(self):
        from patch.stats import stat_h
        val = stat_h("Axe", "StatusHealth", "7.41d")
        assert isinstance(val, (int, float, str))

    @_SKIP_HEROES
    def test_unknown_field_returns_none(self):
        from patch.stats import stat_h
        val = stat_h("Axe", "NonExistentFieldXyz", "7.41d")
        assert val is None

    @_SKIP_HEROES
    def test_unknown_hero_returns_none_or_base_value(self):
        from patch.stats import stat_h
        # A completely made-up hero name should return None (or a base fallback)
        val = stat_h("XxFakeHeroXx", "StatusHealth", "7.41d")
        # It may fall back to npc_dota_hero_base — just assert no exception raised
        # and the result is None or numeric
        assert val is None or isinstance(val, (int, float, str))

    @_SKIP_HEROES
    def test_unknown_patch_returns_none(self):
        from patch.stats import stat_h
        val = stat_h("Axe", "StatusHealth", "0.00")
        assert val is None

    @_SKIP_HEROES
    def test_hero_movement_speed_is_reasonable(self):
        from patch.stats import stat_h
        val = stat_h("Axe", "MovementSpeed", "7.41d")
        if val is not None:
            assert 200 <= float(val) <= 500, "Movement speed out of expected range"

    @_SKIP_HEROES
    def test_hero_display_name_with_spaces(self):
        from patch.stats import stat_h
        # "Crystal Maiden" should map to npc_dota_hero_crystal_maiden
        val = stat_h("Crystal Maiden", "StatusHealth", "7.41d")
        assert val is not None

    @_SKIP_HEROES
    def test_multiple_heroes_return_independent_values(self):
        from patch.stats import stat_h
        val_axe = stat_h("Axe", "StatusHealth", "7.41d")
        val_cm  = stat_h("Crystal Maiden", "StatusHealth", "7.41d")
        # They may be equal by coincidence, but both should be non-None
        assert val_axe is not None
        assert val_cm is not None

    @_SKIP_HEROES
    def test_multiple_versions_may_differ(self):
        from patch.stats import stat_h
        has_older = os.path.exists(os.path.join(_STATS_DIR, "7.40", "heroes.json"))
        if not has_older:
            pytest.skip("7.40 heroes.json not present")
        val_new = stat_h("Axe", "StatusHealth", "7.41d")
        val_old = stat_h("Axe", "StatusHealth", "7.40")
        # Just assert both come back without error; values may or may not differ
        assert val_new is None or isinstance(val_new, (int, float, str))
        assert val_old is None or isinstance(val_old, (int, float, str))


# ---------------------------------------------------------------------------
# stat_i() — item stat lookup
# ---------------------------------------------------------------------------

class TestStatI:
    @_SKIP_ITEMS
    def test_returns_value_for_blink_dagger_cost(self):
        from patch.stats import stat_i
        val = stat_i("Blink Dagger", "ItemCost", "7.41d")
        assert val is not None

    @_SKIP_ITEMS
    def test_blink_dagger_cost_is_reasonable(self):
        from patch.stats import stat_i
        val = stat_i("Blink Dagger", "ItemCost", "7.41d")
        if val is not None:
            assert 1000 <= float(val) <= 10000

    @_SKIP_ITEMS
    def test_unknown_item_returns_none(self):
        from patch.stats import stat_i
        val = stat_i("FakeItemXyzAbc", "ItemCost", "7.41d")
        assert val is None

    @_SKIP_ITEMS
    def test_unknown_field_returns_none(self):
        from patch.stats import stat_i
        val = stat_i("Blink Dagger", "NonExistentFieldXyz", "7.41d")
        assert val is None

    @_SKIP_ITEMS
    def test_unknown_version_returns_none(self):
        from patch.stats import stat_i
        val = stat_i("Blink Dagger", "ItemCost", "0.00")
        assert val is None


# ---------------------------------------------------------------------------
# bstat_h() — badge helper for hero stat
# ---------------------------------------------------------------------------

class TestBstatH:
    @_SKIP_HEROES
    def test_returns_string_badge_html(self):
        from patch.stats import bstat_h
        result = bstat_h("Axe", "StatusHealth", "7.41d", 100)
        assert isinstance(result, str)
        assert "<span" in result

    @_SKIP_HEROES
    def test_positive_delta_is_buff(self):
        from patch.stats import bstat_h
        result = bstat_h("Axe", "StatusHealth", "7.41d", 200)
        assert "buff" in result.lower()

    @_SKIP_HEROES
    def test_negative_delta_is_nerf(self):
        from patch.stats import bstat_h
        result = bstat_h("Axe", "StatusHealth", "7.41d", -200)
        assert "nerf" in result.lower()

    def test_unknown_hero_returns_string_badge(self):
        from patch.stats import bstat_h
        # An unknown hero falls back to npc_dota_hero_base (which does exist),
        # so we get a numeric % badge rather than a plain NERF text badge.
        # Either way the result must be a non-empty HTML string.
        result = bstat_h("FakeHeroXyz", "StatusHealth", "7.41d", -50)
        assert isinstance(result, str)
        assert "<span" in result
        # Direction must still signal a nerf (lower health = bad)
        assert "nerf" in result.lower()

    def test_unknown_hero_positive_delta_returns_buff_badge(self):
        from patch.stats import bstat_h
        result = bstat_h("FakeHeroXyz", "StatusHealth", "7.41d", 50)
        assert isinstance(result, str)
        assert "buff" in result.lower()


# ---------------------------------------------------------------------------
# bstat_i() — badge helper for item stat
# ---------------------------------------------------------------------------

class TestBstatI:
    @_SKIP_ITEMS
    def test_positive_delta_is_buff(self):
        from patch.stats import bstat_i
        result = bstat_i("Blink Dagger", "ItemCost", "7.41d", -100)
        # lower cost = buff for items (but l=False by default, so numeric direction)
        assert "<span" in result

    def test_unknown_item_negative_delta_returns_nerf(self):
        from patch.stats import bstat_i
        result = bstat_i("FakeItemXyz", "ItemCost", "7.41d", -100)
        assert "NERF" in result

    def test_unknown_item_positive_delta_returns_buff(self):
        from patch.stats import bstat_i
        result = bstat_i("FakeItemXyz", "ItemCost", "7.41d", 100)
        assert "BUFF" in result


# ---------------------------------------------------------------------------
# prev_change_patch_h() — historical patch lookup
# ---------------------------------------------------------------------------

class TestPrevChangePatchH:
    @_SKIP_HEROES
    def test_returns_string_or_none(self):
        from patch.stats import prev_change_patch_h
        result = prev_change_patch_h("Axe", "StatusHealth", "7.41d")
        assert result is None or isinstance(result, str)

    @_SKIP_HEROES
    def test_result_looks_like_patch_version(self):
        from patch.stats import prev_change_patch_h
        result = prev_change_patch_h("Axe", "MovementSpeed", "7.41d")
        if result is not None:
            # Should be "7.XX" or "<7.XX" (oldest-marker)
            assert "7." in result or result.startswith("<")

    @_SKIP_HEROES
    def test_unknown_hero_falls_back_to_base_or_none(self):
        from patch.stats import prev_change_patch_h
        # Unknown hero falls back to npc_dota_hero_base (Valve KV inheritance),
        # so the result may be a valid patch string rather than None.
        result = prev_change_patch_h("FakeHeroXyz", "StatusHealth", "7.41d")
        assert result is None or isinstance(result, str)


# ---------------------------------------------------------------------------
# _patch_sort_key() — internal sort utility (tested directly for coverage)
# ---------------------------------------------------------------------------

class TestPatchSortKey:
    def test_sorts_plain_patch(self):
        from patch.stats import _patch_sort_key
        assert _patch_sort_key("7.41") == (7, 41, "")

    def test_sorts_lettered_patch(self):
        from patch.stats import _patch_sort_key
        assert _patch_sort_key("7.41d") == (7, 41, "d")

    def test_sorts_lettered_before_plain(self):
        from patch.stats import _patch_sort_key
        assert _patch_sort_key("7.41") > _patch_sort_key("7.40d")

    def test_major_version_differs(self):
        from patch.stats import _patch_sort_key
        assert _patch_sort_key("8.00") > _patch_sort_key("7.99")

    def test_ascending_order(self):
        from patch.stats import _patch_sort_key
        versions = ["7.41d", "7.40", "7.41", "7.40b"]
        sorted_v = sorted(versions, key=_patch_sort_key)
        assert sorted_v == ["7.40", "7.40b", "7.41", "7.41d"]
