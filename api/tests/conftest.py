"""Shared test setup: dev auth, and the repository backend chosen by environment.

The whole suite runs against both repositories: `ORALCOMPASS_STORE=memory` (the default) and `ORALCOMPASS_STORE=sqlite` (a fresh temporary
database file per run unless ORALCOMPASS_DB_PATH is given). `test_store_backends.py::test_whole_suite_passes_on_sqlite` re-runs the
suite under sqlite in a subprocess, so a plain `pytest -q tests` covers both.
"""
import os
import sys
import tempfile
from pathlib import Path

os.environ["ORALCOMPASS_DEV_AUTH"] = "1"
os.environ.setdefault("ORALCOMPASS_STORE", "memory")
if os.environ["ORALCOMPASS_STORE"] == "sqlite" and not os.environ.get("ORALCOMPASS_DB_PATH"):
    os.environ["ORALCOMPASS_DB_PATH"] = str(Path(tempfile.mkdtemp(prefix="oralcompass-test-db-")) / "oralcompass.db")
os.environ.setdefault("ORALCOMPASS_DATA_DIR", tempfile.mkdtemp(prefix="oralcompass-test-data-"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "engine"))

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_llm_guard():
    """Live-AI cost guard counters start empty for every test (production keeps them in the store for the UTC day)."""
    from app import llm_guard
    llm_guard.guard.reset()
    yield
