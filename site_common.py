# Thin shim — real implementation lives in builders/site_common.py.
# Importing builders/ as a package works via Python 3 namespace packages.
from builders.site_common import *  # noqa: F401,F403
