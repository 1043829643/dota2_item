"""
Вставляет секции патчей 7.41a и 7.41 в build_patch.py
между секцией 7.41b и 7.08.
Запускать один раз из папки Sloppy.
"""
from pathlib import Path

BP = Path("build_patch.py")
GEN_7_41A = Path("_generated_p_7.41a.py")
GEN_7_41  = Path("_generated_p_7.41.py")

src = BP.read_text(encoding="utf-8")
code_41a = GEN_7_41A.read_text(encoding="utf-8").strip()
code_41  = GEN_7_41.read_text(encoding="utf-8").strip()

ANCHOR = "save_html('patches/7.41b.html')"
assert ANCHOR in src, f"Anchor not found: {ANCHOR}"

section_41a = f"""

# ============================================================
# 7.41a content
# ============================================================
write_head("7.41a", "28.03.2026")

{code_41a}

write_footer()
save_html('patches/7.41a.html')
"""

section_41 = f"""
# ============================================================
# 7.41 content
# ============================================================
write_head("7.41", "24.03.2026")

{code_41}

write_footer()
save_html('patches/7.41.html')
"""

insert = section_41a + section_41
new_src = src.replace(ANCHOR, ANCHOR + insert, 1)
assert new_src != src, "Nothing was inserted!"

BP.write_text(new_src, encoding="utf-8")
print("Done — build_patch.py updated.")
