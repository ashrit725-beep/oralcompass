"""Runtime advice guard for any generated text (model output, differences sentences, notifications).
A sentence that violates the policy is dropped and replaced by the cited clause text when one is available."""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
from advice_lint import lint_text  # noqa: E402


def guard(text: str, fallback_quote: str | None = None) -> dict:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip()) if text.strip() else []
    kept, dropped = [], []
    for s in sentences:
        v = lint_text(s)
        (dropped if v else kept).append(s if not v else {"sentence": s, "violations": v})
    out = " ".join(kept)
    if not out and fallback_quote:
        out = f"Plan wording: “{fallback_quote}”"
    return {"text": out, "dropped": dropped}


def grounded(sentence: str, allowed_ids: set[str]) -> bool:
    """A generated sentence must reference a clause id (e.g. 'HB26#p9') or a field id present in the current context."""
    return any(i in sentence for i in allowed_ids)
