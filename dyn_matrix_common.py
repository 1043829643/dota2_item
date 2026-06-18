# Thin shim — real implementation lives in builders/dyn_matrix_common.py.
# Importing builders/ as a package works via Python 3 namespace packages.
from builders.dyn_matrix_common import *  # noqa: F401,F403
