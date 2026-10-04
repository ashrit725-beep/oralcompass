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
# Test safety (orchestrator note 13): api/.env can be LIVE (a real OpenRouter key). Every test runs in demo mode with no key in the
# environment. These are set before app.main imports, and load_dotenv(override=False) never replaces a variable that already exists,
# so api/.env cannot switch the suite to live. A test that needs a real model call opts in with @pytest.mark.live_llm (skipped unless
# ORALCOMPASS_ALLOW_LIVE_LLM=1). Tests that mock a live call set provider + a fake key + an httpx.MockTransport themselves.
_ALLOW_LIVE = os.environ.get("ORALCOMPASS_ALLOW_LIVE_LLM") == "1"
if not _ALLOW_LIVE:
    os.environ["ORALCOMPASS_LLM_PROVIDER"] = "none"
    os.environ["OPENROUTER_API_KEY"] = ""
    os.environ["AWS_BEARER_TOKEN_BEDROCK"] = ""
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
    from app import extraction, llm_guard
    llm_guard.guard.reset()
    extraction._GRAMMAR_REFUSED.clear()          # each test starts as if the provider had never refused a grammar
    extraction._RETRY_BACKOFF_S = 0.0            # no real pause before the retry in tests
    yield


def pytest_configure(config):
    config.addinivalue_line("markers", "live_llm: makes a real model call; skipped unless ORALCOMPASS_ALLOW_LIVE_LLM=1")


def pytest_collection_modifyitems(config, items):
    if _ALLOW_LIVE:
        return
    skip = pytest.mark.skip(reason="live model call: set ORALCOMPASS_ALLOW_LIVE_LLM=1 to run")
    for item in items:
        if "live_llm" in item.keywords:
            item.add_marker(skip)


class _NoNetwork(Exception):
    pass


def _refuse(request):
    raise _NoNetwork(f"a test tried a real model call to {request.url.host}; mock it with httpx.MockTransport or mark it live_llm")


@pytest.fixture(autouse=True)
def _demo_mode_and_no_model_network(request, monkeypatch):
    """Every test starts in demo mode with no key, and any model HTTP call that a test did not mock fails instead of reaching the network."""
    if "live_llm" in request.keywords and _ALLOW_LIVE:
        yield
        return
    import httpx
    from app import assistant, extraction
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "none")
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "")
    from app import llm_providers

    def _refuse_bedrock(req, timeout):
        raise _NoNetwork(f"a test tried a real model call to {req.host}; set llm_providers._OPENER_OVERRIDE or mark it live_llm")
    monkeypatch.setattr(llm_providers, "_OPENER_OVERRIDE", _refuse_bedrock)
    monkeypatch.setattr(extraction, "_TRANSPORT_OVERRIDE", httpx.MockTransport(_refuse))
    monkeypatch.setattr(assistant, "live_client", lambda: httpx.Client(timeout=5, transport=httpx.MockTransport(_refuse)))
    yield
