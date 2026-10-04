"""Test safety (orchestrator note 13): the suite never runs live, whatever api/.env says."""
import os

import httpx
import pytest

from app import assistant, extraction


def test_default_mode_under_pytest_is_demo():
    assert os.environ.get("ORALCOMPASS_LLM_PROVIDER") == "none"
    assert not os.environ.get("OPENROUTER_API_KEY")
    assert extraction.llm_mode() == "demo" and assistant.llm_mode() == "demo"


def test_an_unmocked_model_call_is_refused():
    with extraction.build_http_client(5) as c, pytest.raises(Exception, match="real model call"):
        c.post("https://openrouter.ai/api/v1/chat/completions", json={})
    with assistant.live_client() as c, pytest.raises(Exception, match="real model call"):
        c.post("https://openrouter.ai/api/v1/chat/completions", json={})
