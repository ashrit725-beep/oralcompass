"""Copy style for server strings shown in the UI (info-only-10, antislop R-02): no em dash used as punctuation in the banners, the sample
journey label or the named missing inputs. A lone dash for a missing value is not punctuation and is not checked."""
import os
import re
import sys
from pathlib import Path

os.environ["ORALCOMPASS_DEV_AUTH"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.templates import PRESET_BANNER, SAMPLE_JOURNEY_LABEL  # noqa: E402

DASH = re.compile(r"\s—\s")
client = TestClient(app)
H = {"X-Dev-User": "copy-style"}


def test_templates_print_no_em_dash():
    assert not DASH.search(PRESET_BANNER) and not DASH.search(SAMPLE_JOURNEY_LABEL)


def test_served_banners_print_no_em_dash():
    for path in ("/plans", "/presets"):
        r = client.get(path, headers=H)
        if r.status_code == 200 and isinstance(r.json(), dict) and "banner" in r.json():
            assert not DASH.search(r.json()["banner"]), path
    note = client.get("/journeys/samples", headers=H).json().get("note", "")
    assert note == SAMPLE_JOURNEY_LABEL and not DASH.search(note)


def test_missing_input_labels_print_no_em_dash():
    src = (Path(__file__).resolve().parents[1] / "app" / "records.py").read_text(encoding="utf-8")
    assert 'f"allowed amount: {L.label}"' in src and 'f"coverage class: {L.label}"' in src
    assert "allowed amount —" not in src and "coverage class —" not in src
