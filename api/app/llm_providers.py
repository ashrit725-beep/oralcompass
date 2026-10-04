"""Live-model provider layer: one ordered chain used by every live model call (plan extraction, treatment-plan reader, clause explainer,
assistant).

* `ORALCOMPASS_LLM_PROVIDER` is "bedrock", "openrouter", "none", or an ordered chain such as "bedrock,openrouter". A provider joins the
  chain only when its credentials are present in the server environment; `llm_mode()` is "live" when at least one does.
* Bedrock: the Converse API over stdlib urllib (no boto3), `Authorization: Bearer $AWS_BEARER_TOKEN_BEDROCK` (a Bedrock API key), region
  `AWS_REGION`, model / inference-profile id `ORALCOMPASS_BEDROCK_MODEL`. Structured output is one forced tool whose input schema is the
  call site's JSON schema; the answer is that tool call's input.
* OpenRouter: the existing httpx chat/completions code at each call site, passed in as a callable so its tests and retries are unchanged.
* `run_chain`: tries each configured provider in order. A limit (HTTP 429, ThrottlingException, "too many tokens", 402) or a server error
  moves to the next provider; a 400/403/404 (model access, the Anthropic use-case form, a wrong region or id) is logged as a configuration
  problem and also moves on. When every provider fails it raises `ModelUnavailable` with `.limited` set when a limit was the cause, and the
  caller shows its fixed template with an honest notice.
* Never logged: request headers, the token, message text, document text, or response bodies. Logs carry the provider name, the HTTP status
  and the AWS error type only.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import socket
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Optional

log = logging.getLogger("oralcompass.llm")

KNOWN = ("bedrock", "openrouter")
DEFAULT_BEDROCK_MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
DEFAULT_OPENROUTER_MODEL = "anthropic/claude-haiku-4.5"
LIMIT_STATUSES = {402, 429}
CONFIG_STATUSES = {400, 401, 403, 404}
_IMAGE_FORMATS = {"image/png": "png", "image/jpeg": "jpeg", "image/jpg": "jpeg", "image/webp": "webp", "image/gif": "gif"}

# Tests replace this with a fake: callable(urllib.request.Request, timeout) -> object with .read() (and .status). Never the network in tests.
_OPENER_OVERRIDE: Optional[Callable[[urllib.request.Request, float], Any]] = None


class ModelUnavailable(Exception):
    """A live model call did not produce an answer. `.limited` is True when a provider limit (quota, throttling) was the cause."""

    def __init__(self, msg: str = "model unavailable", limited: bool = False) -> None:
        super().__init__(msg)
        self.limited = limited


# ---------------------------------------------------------------- configuration
def chain() -> list[str]:
    raw = (os.getenv("ORALCOMPASS_LLM_PROVIDER") or "").strip().lower()
    out: list[str] = []
    for part in raw.split(","):
        p = part.strip()
        if p in KNOWN and p not in out:
            out.append(p)
    return out


def has_credentials(name: str) -> bool:
    if name == "bedrock":
        return bool(os.getenv("AWS_BEARER_TOKEN_BEDROCK"))
    if name == "openrouter":
        return bool(os.getenv("OPENROUTER_API_KEY"))
    return False


def configured() -> list[str]:
    """The chain, in order, keeping only providers whose credentials are present."""
    return [p for p in chain() if has_credentials(p)]


def llm_mode() -> str:
    return "live" if configured() else "demo"


def model_for(name: str) -> str:
    if name == "bedrock":
        return os.getenv("ORALCOMPASS_BEDROCK_MODEL") or DEFAULT_BEDROCK_MODEL
    return os.getenv("ORALCOMPASS_LLM_MODEL") or DEFAULT_OPENROUTER_MODEL


def llm_model() -> str:
    """The model id of the first configured provider (the one that answers when it is available)."""
    live = configured()
    return model_for(live[0] if live else (chain() or ["openrouter"])[0])


def provider_names() -> list[str]:
    return configured()


def bedrock_region() -> str:
    return (os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1").strip()


def bedrock_url(model: Optional[str] = None) -> str:
    return f"https://bedrock-runtime.{bedrock_region()}.amazonaws.com/model/{urllib.parse.quote(model or model_for('bedrock'), safe='')}/converse"


# ---------------------------------------------------------------- Bedrock Converse
def _image_block(url: str) -> Optional[dict]:
    if not isinstance(url, str) or not url.startswith("data:") or ";base64," not in url:
        return None
    mime, data = url[5:].split(";base64,", 1)
    fmt = _IMAGE_FORMATS.get(mime.strip().lower())
    return {"image": {"format": fmt, "source": {"bytes": data}}} if fmt else None


def _blocks(content: Any) -> list[dict]:
    if isinstance(content, str):
        return [{"text": content}] if content else []
    out: list[dict] = []
    for part in content or []:
        if not isinstance(part, dict):
            continue
        if part.get("type") == "text" and part.get("text"):
            out.append({"text": str(part["text"])})
        elif part.get("type") == "image_url":
            img = _image_block((part.get("image_url") or {}).get("url", ""))
            if img:
                out.append(img)
    return out


def converse_body(messages: list[dict], schema_name: str, schema: dict, max_tokens: int, temperature: float = 0) -> dict:
    """OpenAI-style messages → a Converse request with one forced tool carrying the JSON schema."""
    system: list[dict] = []
    turns: list[dict] = []
    for m in messages:
        role = m.get("role")
        if role == "system":
            if isinstance(m.get("content"), str) and m["content"]:
                system.append({"text": m["content"]})
            continue
        role = "assistant" if role == "assistant" else "user"
        blocks = _blocks(m.get("content"))
        if not blocks:
            continue
        if turns and turns[-1]["role"] == role:            # Converse needs alternating roles: merge consecutive turns
            turns[-1]["content"].extend(blocks)
        else:
            turns.append({"role": role, "content": blocks})
    tool = (schema_name or "answer")[:64]
    body: dict = {"messages": turns, "inferenceConfig": {"maxTokens": int(max_tokens), "temperature": temperature},
                  "toolConfig": {"tools": [{"toolSpec": {"name": tool, "description": "Return the answer as this structured object.",
                                                         "inputSchema": {"json": schema}}}],
                                 "toolChoice": {"tool": {"name": tool}}}}
    if system:
        body["system"] = system
    return body


def parse_converse(payload: Any) -> dict:
    content = (((payload or {}).get("output") or {}).get("message") or {}).get("content") or []
    for block in content:
        if isinstance(block, dict) and isinstance(block.get("toolUse"), dict):
            data = block["toolUse"].get("input")
            if isinstance(data, dict):
                return data
    for block in content:                                    # a model that answered in text instead of the tool: accept a JSON object only
        if isinstance(block, dict) and isinstance(block.get("text"), str):
            try:
                data = json.loads(block["text"].strip())
            except ValueError:
                continue
            if isinstance(data, dict):
                return data
    raise ModelUnavailable("no structured answer")


def _record(kind: str, payload: Any, fallback_in: int, fallback_out: int) -> None:
    try:
        from . import llm_guard
        u = (payload or {}).get("usage") or {}
        pin, pout = int(u.get("inputTokens") or 0), int(u.get("outputTokens") or 0)
        if not (pin or pout):
            pin, pout = fallback_in, fallback_out
        llm_guard.record(kind, pin, pout)
    except Exception:
        pass


def _open(req: urllib.request.Request, timeout: float):
    if _OPENER_OVERRIDE is not None:
        return _OPENER_OVERRIDE(req, timeout)
    return urllib.request.urlopen(req, timeout=timeout)       # noqa: S310 (fixed https host)


def bedrock_json(messages: list[dict], schema_name: str, schema: dict, max_tokens: int, timeout: float, kind: str,
                 temperature: float = 0) -> dict:
    token = os.getenv("AWS_BEARER_TOKEN_BEDROCK") or ""
    if not token:
        raise ModelUnavailable("bedrock not configured")
    body = converse_body(messages, schema_name, schema, max_tokens, temperature)
    data = json.dumps(body).encode()
    req = urllib.request.Request(bedrock_url(), data=data, method="POST",
                                 headers={"Content-Type": "application/json", "Accept": "application/json", "Authorization": f"Bearer {token}"})
    try:
        resp = _open(req, timeout)
        raw = resp.read()
    except urllib.error.HTTPError as e:
        status = int(e.code or 0)
        etype = ""
        try:
            etype = (e.headers.get("x-amzn-ErrorType") or "").split(":")[0][:60] if e.headers else ""
            text = e.read(2048).decode("utf-8", "replace").lower()
        except Exception:
            text = ""
        limited = status in LIMIT_STATUSES or "throttling" in etype.lower() or "throttling" in text or "too many tokens" in text
        if limited:
            log.warning("bedrock limit reached (http %d %s); next provider", status, etype or "-")
        elif status in CONFIG_STATUSES:
            log.warning("bedrock configuration problem (http %d %s): check model access, the use-case form, region and model id", status, etype or "-")
        else:
            log.warning("bedrock call failed (http %d %s)", status, etype or "-")
        raise ModelUnavailable(f"bedrock http {status}", limited=limited) from None
    except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as e:
        log.warning("bedrock call failed (%s)", type(e).__name__)
        raise ModelUnavailable("bedrock transport") from None
    try:
        payload = json.loads(raw)
    except ValueError:
        raise ModelUnavailable("bedrock malformed response") from None
    _record(kind, payload, len(data) // 4, max_tokens)
    return parse_converse(payload)


# ---------------------------------------------------------------- the chain
def _soft_errors() -> tuple:
    errs: tuple = (ValueError, KeyError, IndexError, TypeError, OSError)
    try:
        import httpx
        errs += (httpx.HTTPError,)
    except ImportError:
        pass
    return errs


def run_chain(messages: list[dict], schema_name: str, schema: dict, max_tokens: int, timeout: float, kind: str,
              openrouter: Callable[[], dict], temperature: float = 0) -> dict:
    """The first provider in the configured chain that answers. Raises ModelUnavailable (with .limited) when none does."""
    limited = False
    providers = configured()
    for name in providers:
        try:
            if name == "bedrock":
                return bedrock_json(messages, schema_name, schema, max_tokens, timeout, kind, temperature)
            out = openrouter()
            if not isinstance(out, dict):
                raise ModelUnavailable("not a JSON object")
            return out
        except ModelUnavailable as e:
            limited = limited or bool(getattr(e, "limited", False))
            log.info("live provider %s unavailable; %s", name, "trying the next" if name != providers[-1] else "template shown")
        except _soft_errors() as e:                              # httpx errors, malformed JSON from a call-site callable (anything else propagates)
            status = getattr(getattr(e, "response", None), "status_code", None)
            limited = limited or status in LIMIT_STATUSES
            log.info("live provider %s failed (%s); %s", name, type(e).__name__, "trying the next" if name != providers[-1] else "template shown")
    raise ModelUnavailable("no live provider answered", limited=limited)
