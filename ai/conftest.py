"""Pytest configuration for the AI service.

Ensures the ``app`` package is importable when running ``pytest`` from the
``ai/`` directory. Without this, pytest 8.x's default ``importlib`` mode does
not add the project root to ``sys.path`` automatically.

Related issue: S14P31E103-341
"""
from __future__ import annotations

import sys
from pathlib import Path

# Add this directory (ai/) to sys.path so `import app.xxx` works.
_ROOT = Path(__file__).parent.resolve()
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
