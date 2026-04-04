from __future__ import annotations

import base64
import binascii
import json
from datetime import UTC, datetime
from io import BytesIO
from typing import Any
from urllib.parse import quote, urlparse

import httpx

from app.core.config import get_settings
from app.core.errors import AppError


SUSPICIOUS_TERMS = (
    "abuse",
    "assault",
    "molest",
    "molestation",
    "exploit",
    "explicit",
    "minor",
    "child",
    "kid",
    "underage",
    "trafficking",
    "groom",
    "coerce",
    "blackmail",
    "rape",
    "porn",
    "cp",
)

CRITICAL_POCSO_TERMS = (
    "child porn",
    "child pornography",
    "minor porn",
    "minor sexual",
    "underage sex",
    "rape",
    "molest",
    "groom",
    "trafficking",
)

VIOLENCE_TERMS = (
    "assault",
    "assaulting",
    "attack",
    "attacking",
    "beating",
    "beat",
    "hit",
    "hitting",
    "slap",
    "slapping",
    "choke",
    "choking",
    "strangle",
    "strangling",
    "domestic violence",
)


def _clamp_score(value: float | int) -> int:
    return max(0, min(100, int(round(float(value)))))


def _gemini_generate_url() -> str:
    settings = get_settings()
    model = (settings.gemini_model or "gemini-2.0-flash").strip().lstrip("/")
    if not model.startswith("models/"):
        model = f"models/{model}"
    key = quote(settings.gemini_api_key, safe="")
    return f"https://generativelanguage.googleapis.com/v1beta/{model}:generateContent?key={key}"


def _extract_gemini_response_text(data: dict[str, Any]) -> str:
    """Pull model text from generateContent JSON; raise AppError when the response is unusable."""
    prompt_fb = data.get("promptFeedback")
    if isinstance(prompt_fb, dict) and prompt_fb.get("blockReason"):
        raise AppError(
            code="gemini_prompt_blocked",
            message="Gemini blocked the prompt",
            status_code=502,
            details={"blockReason": prompt_fb.get("blockReason")},
        )

    candidates = data.get("candidates")
    if not isinstance(candidates, list) or len(candidates) == 0:
        raise AppError(
            code="gemini_empty_candidates",
            message="Gemini returned no candidates",
            status_code=502,
            details={"response_keys": list(data.keys())},
        )

    cand0 = candidates[0]
    if not isinstance(cand0, dict):
        raise AppError(
            code="gemini_parse_error",
            message="Invalid Gemini candidate shape",
            status_code=502,
        )

    content = cand0.get("content")
    if not isinstance(content, dict):
        finish = cand0.get("finishReason")
        raise AppError(
            code="gemini_no_content",
            message="Gemini returned no content parts",
            status_code=502,
            details={"finishReason": finish},
        )

    parts = content.get("parts") or []
    chunks: list[str] = []
    for part in parts:
        if isinstance(part, dict) and isinstance(part.get("text"), str):
            chunks.append(part["text"])
    raw_text = "".join(chunks)

    if not raw_text.strip():
        finish = cand0.get("finishReason")
        raise AppError(
            code="gemini_empty_text",
            message="Gemini produced empty output",
            status_code=502,
            details={"finishReason": finish},
        )

    return raw_text


def _label_from_score(score: int, *, harmful_threshold: int, review_threshold: int) -> str:
    if score >= harmful_threshold:
        return "harmful"
    if score >= review_threshold:
        return "review"
    return "safe"


# ---------------------------------------------------------------------------
# Gemini API integration (model from settings.gemini_model)
# ---------------------------------------------------------------------------

GEMINI_CLASSIFY_PROMPT = """You are an AI safety classifier for the POCSO Shield civic safety platform.
Analyze the following report and rate its risk level. Reports may involve:
- Child safety violations (POCSO cases) — highest severity
- Environmental hazards (waste dumping, pollution near schools/residential areas)
- Public safety threats (unauthorized activities, infrastructure dangers)
- Civic complaints (noise, traffic, sanitation)

Respond ONLY with valid JSON (no markdown, no extra text). Use this exact format, replacing values appropriately:
{{
  "risk_score": 85,
  "label": "harmful",
  "reasoning": "brief explanation of why this was scored",
  "categories": {{
    "child_safety": 0.0,
    "environmental_hazard": 0.8,
    "public_safety": 0.2,
    "civic_complaint": 0.0,
    "safe_content": 0.0
  }}
}}

Scoring guide:
- 0-44: safe (routine or no concerning content)
- 45-69: review (legitimate concern needing human assessment)
- 70-100: harmful (serious safety violation or child endangerment)

IMPORTANT: Any report involving children near hazards, health risks to minors,
or threats to public safety should score AT LEAST 45 (review). Reports describing
recurring illegal activities should score 55+. Child abuse/exploitation = 80+.

Report text: "{text}"
Source URL: "{url}"
"""

GEMINI_IMAGE_PROMPT = """You are a child safety image classifier for the POCSO Shield platform.
Analyze the attached image for any indicators of child safety concerns.

Respond ONLY with valid JSON (no markdown, no extra text). Use this exact format, replacing values appropriately:
{
  "risk_score": 85,
  "label": "harmful",
  "reasoning": "brief explanation",
  "categories": {
    "violence": 0.9,
    "explicit_content": 0.0,
    "child_endangerment": 0.9,
    "safe_content": 0.0
  }
}
"""


def _call_gemini_text(text: str, source_url: str | None) -> dict[str, Any]:
    """Call Gemini generateContent for text classification."""
    settings = get_settings()
    api_key = settings.gemini_api_key
    if not api_key:
        raise AppError(code="gemini_not_configured", message="GEMINI_API_KEY is not set", status_code=500)

    prompt = GEMINI_CLASSIFY_PROMPT.format(text=text[:2000], url=source_url or "N/A")

    response = httpx.post(
        _gemini_generate_url(),
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "safetySettings": [
                {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            ],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 512,
                "responseMimeType": "application/json",
            },
        },
        timeout=30.0,
    )

    if response.status_code != 200:
        raise AppError(
            code="gemini_api_error",
            message=f"Gemini API returned {response.status_code}",
            status_code=502,
            details={"response": response.text[:500]},
        )

    data = response.json()
    if not isinstance(data, dict):
        raise AppError(
            code="gemini_parse_error",
            message="Gemini response was not a JSON object",
            status_code=502,
        )
    raw_text = _extract_gemini_response_text(data)

    # Strip markdown code fences if present
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        raise AppError(
            code="gemini_parse_error",
            message="Failed to parse Gemini response",
            status_code=502,
            details={"raw": raw_text[:500]},
        )


def _call_gemini_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict[str, Any]:
    """Call Gemini generateContent for image classification."""
    settings = get_settings()
    api_key = settings.gemini_api_key
    if not api_key:
        raise AppError(code="gemini_not_configured", message="GEMINI_API_KEY is not set", status_code=500)

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    response = httpx.post(
        _gemini_generate_url(),
        json={
            "contents": [
                {
                    "parts": [
                        {"text": GEMINI_IMAGE_PROMPT},
                        {
                            # REST API expects camelCase (not inline_data / mime_type).
                            "inlineData": {
                                "mimeType": mime_type,
                                "data": image_b64,
                            }
                        },
                    ]
                }
            ],
            "safetySettings": [
                {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            ],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 512,
                "responseMimeType": "application/json",
            },
        },
        timeout=45.0,
    )

    if response.status_code != 200:
        raise AppError(
            code="gemini_api_error",
            message=f"Gemini API returned {response.status_code}",
            status_code=502,
            details={"response": response.text[:500]},
        )

    data = response.json()
    if not isinstance(data, dict):
        raise AppError(
            code="gemini_parse_error",
            message="Gemini image response was not a JSON object",
            status_code=502,
        )
    raw_text = _extract_gemini_response_text(data)

    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        raise AppError(
            code="gemini_parse_error",
            message="Failed to parse Gemini image response",
            status_code=502,
            details={"raw": raw_text[:500]},
        )


# ---------------------------------------------------------------------------
# Heuristic fallback (used for mock mode and as safety net)
# ---------------------------------------------------------------------------

def _heuristic_text_score(text: str, source_url: str | None) -> tuple[int, dict[str, Any]]:
    lowered = (text or "").lower()
    term_hits = sum(1 for term in SUSPICIOUS_TERMS if term in lowered)
    critical_hits = sum(1 for term in CRITICAL_POCSO_TERMS if term in lowered)
    violence_hits = sum(1 for term in VIOLENCE_TERMS if term in lowered)

    domain_score = 0
    domain = ""
    if source_url:
        parsed = urlparse(source_url)
        domain = (parsed.netloc or "").lower()
        if any(token in domain for token in ("tube", "xxx", "escort", "cam", "adult")):
            domain_score += 20
        if domain.endswith((".ru", ".su", ".to")):
            domain_score += 10

    score = _clamp_score(15 + term_hits * 12 + critical_hits * 18 + violence_hits * 10 + domain_score)
    if critical_hits >= 2:
        score = max(score, 78)
    elif critical_hits == 1:
        score = max(score, 65)
    elif violence_hits >= 2:
        score = max(score, 70)
    elif violence_hits == 1:
        score = max(score, 55)

    return score, {
        "term_hits": term_hits,
        "critical_hits": critical_hits,
        "violence_hits": violence_hits,
        "domain": domain,
        "domain_score": domain_score,
    }


# ---------------------------------------------------------------------------
# Image resolution helpers
# ---------------------------------------------------------------------------

def _decode_image_bytes(image_base64: str) -> bytes:
    settings = get_settings()
    try:
        raw = image_base64.split(",", 1)[1] if image_base64.startswith("data:") else image_base64
        image_bytes = base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise AppError(code="invalid_image_base64", message="Invalid image_base64 payload", status_code=400) from exc

    if len(image_bytes) == 0:
        raise AppError(code="invalid_image_payload", message="Image payload is empty", status_code=400)
    if len(image_bytes) > settings.ai_max_image_bytes:
        raise AppError(
            code="image_too_large",
            message="Image payload exceeds limit",
            status_code=413,
            details={"max_bytes": settings.ai_max_image_bytes, "size_bytes": len(image_bytes)},
        )
    return image_bytes


def _decode_data_uri_image(data_uri: str) -> bytes:
    if not data_uri.startswith("data:") or "," not in data_uri:
        raise ValueError("not_data_uri")
    payload = data_uri.split(",", 1)[1]
    return base64.b64decode(payload, validate=True)


def _fetch_image_bytes_from_cid(image_cid: str) -> tuple[bytes | None, dict[str, Any]]:
    settings = get_settings()
    gateway_url = settings.ai_ipfs_gateway_template.format(cid=image_cid)
    meta: dict[str, Any] = {"source": "cid", "cid": image_cid, "gateway_url": gateway_url}

    try:
        with httpx.Client(timeout=settings.ai_ipfs_fetch_timeout_seconds, follow_redirects=True) as client:
            response = client.get(gateway_url)
    except Exception as exc:
        meta["reason"] = "cid_fetch_error"
        meta["error"] = exc.__class__.__name__
        return None, meta

    meta["status_code"] = response.status_code
    if response.status_code >= 300:
        meta["reason"] = "cid_fetch_failed"
        return None, meta

    content_type = (response.headers.get("content-type") or "").lower()
    body = response.content
    if not body:
        meta["reason"] = "cid_empty_payload"
        return None, meta

    if "application/json" in content_type:
        try:
            payload = response.json()
        except Exception:
            payload = None
        if isinstance(payload, dict) and isinstance(payload.get("encrypted_blob_base64"), str):
            meta["reason"] = "encrypted_attachment_not_decoded"
            meta["content_type"] = content_type
            return None, meta
        if isinstance(payload, dict) and isinstance(payload.get("image_base64"), str):
            try:
                decoded = _decode_image_bytes(payload["image_base64"])
                meta["content_type"] = content_type
                meta["resolved_from"] = "json_image_base64"
                return decoded, meta
            except AppError:
                meta["reason"] = "json_image_base64_invalid"
                return None, meta

    if "text/plain" in content_type or "application/octet-stream" in content_type:
        try:
            raw_text = body.decode("utf-8", errors="ignore").strip()
            if raw_text.startswith("data:"):
                decoded = _decode_data_uri_image(raw_text)
                meta["content_type"] = content_type
                meta["resolved_from"] = "text_data_uri"
                return decoded, meta
            decoded = base64.b64decode(raw_text, validate=True)
            meta["content_type"] = content_type
            meta["resolved_from"] = "text_base64"
            return decoded, meta
        except (ValueError, binascii.Error):
            pass

    meta["content_type"] = content_type
    meta["resolved_from"] = "raw_bytes"
    return body, meta


def _resolve_image_bytes(image_base64: str | None, image_cid: str | None) -> tuple[bytes | None, dict[str, Any]]:
    if image_base64:
        try:
            return _decode_image_bytes(image_base64), {"source": "request_image_base64"}
        except AppError as exc:
            return None, {"source": "request_image_base64", "reason": exc.code}

    if image_cid:
        return _fetch_image_bytes_from_cid(image_cid)

    return None, {"source": "none", "reason": "no_image_input"}


# ---------------------------------------------------------------------------
# Prediction entry points
# ---------------------------------------------------------------------------

def _predict_text_risk(text: str, source_url: str | None) -> tuple[int, str, dict[str, Any]]:
    settings = get_settings()
    text = text or ""

    heuristic_score, heuristic_meta = _heuristic_text_score(text, source_url)

    if settings.mock_ai_models:
        score = _clamp_score(heuristic_score * 0.85 + 10)
        return score, _label_from_score(
            score,
            harmful_threshold=settings.text_harmful_threshold,
            review_threshold=settings.review_threshold,
        ), {"mode": "mock", **heuristic_meta}

    if not text.strip() and not source_url:
        score = 5
        return score, "safe", {"mode": "fallback", "reason": "empty_text_and_url"}

    try:
        gemini_result = _call_gemini_text(text, source_url)
        gemini_score = _clamp_score(gemini_result.get("risk_score", 50))
        gemini_label = gemini_result.get("label", "review")

        # Blend Gemini score with heuristic for robustness
        score = _clamp_score(gemini_score * 0.75 + heuristic_score * 0.25)

        return score, _label_from_score(
            score,
            harmful_threshold=settings.text_harmful_threshold,
            review_threshold=settings.review_threshold,
        ), {
            "mode": "gemini",
            "model": get_settings().gemini_model,
            "gemini_score": gemini_score,
            "gemini_label": gemini_label,
            "gemini_reasoning": gemini_result.get("reasoning", ""),
            "categories": gemini_result.get("categories", {}),
            **heuristic_meta,
        }
    except Exception as exc:
        import traceback
        traceback.print_exc()
        fallback_score = _clamp_score(heuristic_score * 0.9 + 5)
        return fallback_score, _label_from_score(
            fallback_score,
            harmful_threshold=settings.text_harmful_threshold,
            review_threshold=settings.review_threshold,
        ), {"mode": "fallback", "reason": "gemini_unavailable", **heuristic_meta}


def _predict_image_risk(image_base64: str | None, image_cid: str | None) -> tuple[int, str, dict[str, Any]]:
    settings = get_settings()
    image_bytes, source_meta = _resolve_image_bytes(image_base64, image_cid)
    if image_bytes is None:
        return 0, "safe", {"mode": "none", **source_meta}

    if settings.mock_ai_models:
        digest = sum(image_bytes[:256]) % 101
        score = _clamp_score(25 + digest * 0.75)
        label = _label_from_score(score, harmful_threshold=settings.image_harmful_threshold, review_threshold=settings.review_threshold)
        return score, label, {"mode": "mock", "byte_digest": digest, **source_meta}

    try:
        # Detect mime type from first bytes
        mime = "image/jpeg"
        if image_bytes[:4] == b"\x89PNG":
            mime = "image/png"
        elif image_bytes[:4] == b"RIFF":
            mime = "image/webp"
        elif image_bytes[:3] == b"GIF":
            mime = "image/gif"

        gemini_result = _call_gemini_image(image_bytes, mime)
        score = _clamp_score(gemini_result.get("risk_score", 50))

        return score, _label_from_score(
            score,
            harmful_threshold=settings.image_harmful_threshold,
            review_threshold=settings.review_threshold,
        ), {
            "mode": "gemini",
            "model": get_settings().gemini_model,
            "gemini_score": score,
            "gemini_label": gemini_result.get("label", "review"),
            "gemini_reasoning": gemini_result.get("reasoning", ""),
            "categories": gemini_result.get("categories", {}),
            **source_meta,
        }
    except Exception:
        # Match text path: never fail the whole report when image Gemini errors (bad request shape, blocks, etc.).
        digest = sum(image_bytes[:256]) % 101
        fallback = _clamp_score(25 + digest * 0.75)
        return fallback, _label_from_score(
            fallback,
            harmful_threshold=settings.image_harmful_threshold,
            review_threshold=settings.review_threshold,
        ), {"mode": "fallback", "reason": "gemini_image_unavailable", "byte_digest": digest, **source_meta}


# ---------------------------------------------------------------------------
# Evidence escalation
# ---------------------------------------------------------------------------

def _apply_evidence_escalation(
    combined_score: int,
    *,
    text_score: int,
    text_label: str,
    image_score: int,
    image_label: str,
) -> int:
    settings = get_settings()
    escalated = combined_score

    if text_label == "harmful" or image_label == "harmful":
        escalated = max(escalated, settings.review_threshold + 10)

    if (text_label == "harmful" and image_score == 0) or (image_label == "harmful" and text_score == 0):
        escalated = max(escalated, _clamp_score(max(text_score, image_score) * 0.85))

    if text_label == "harmful" and image_label == "harmful":
        escalated = max(escalated, min(100, max(text_score, image_score) + 10))

    if text_score >= settings.review_threshold and image_label == "safe":
        escalated = max(escalated, min(100, text_score))

    return _clamp_score(escalated)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def classify_report(
    incident_text: str,
    source_url: str | None,
    *,
    image_base64: str | None,
    image_content_type: str | None,
    image_cid: str | None = None,
) -> dict[str, Any]:
    settings = get_settings()

    text_score, text_label, text_meta = _predict_text_risk(incident_text, source_url)
    image_score, image_label, image_meta = _predict_image_risk(image_base64, image_cid)

    total_weight = max(settings.ai_text_weight + settings.ai_image_weight, 0.0001)
    text_weight = settings.ai_text_weight / total_weight
    image_weight = settings.ai_image_weight / total_weight

    combined_score = _clamp_score(text_score * text_weight + image_score * image_weight)
    combined_score = _apply_evidence_escalation(
        combined_score,
        text_score=text_score,
        text_label=text_label,
        image_score=image_score,
        image_label=image_label,
    )
    combined_label = _label_from_score(
        combined_score,
        harmful_threshold=settings.text_harmful_threshold,
        review_threshold=settings.review_threshold,
    )

    explanation = {
        "text": {"score": text_score, "label": text_label, **text_meta},
        "image": {
            "score": image_score,
            "label": image_label,
            "content_type": image_content_type,
            "image_cid": image_cid,
            **image_meta,
        },
        "thresholds": {
            "high_priority_threshold": settings.high_priority_threshold,
            "text_harmful_threshold": settings.text_harmful_threshold,
            "image_harmful_threshold": settings.image_harmful_threshold,
            "review_threshold": settings.review_threshold,
        },
    }

    return {
        "text_label": text_label,
        "image_label": image_label,
        "combined_label": combined_label,
        "risk_score": combined_score,
        "confidence_explanation": explanation,
        "processed_at": datetime.now(UTC),
    }


def classify_report_fallback(
    incident_text: str,
    source_url: str | None,
    *,
    image_base64: str | None,
    image_content_type: str | None,
    image_cid: str | None = None,
) -> dict[str, Any]:
    """Heuristic-only scoring when the full Gemini pipeline cannot complete (e.g. unexpected worker errors)."""
    settings = get_settings()
    text = incident_text or ""

    heuristic_score, heuristic_meta = _heuristic_text_score(text, source_url)
    if not text.strip() and not source_url:
        text_score, text_label, text_meta = 5, "safe", {"mode": "fallback", "reason": "empty_text_and_url"}
    else:
        text_score = _clamp_score(heuristic_score * 0.9 + 5)
        text_label = _label_from_score(
            text_score,
            harmful_threshold=settings.text_harmful_threshold,
            review_threshold=settings.review_threshold,
        )
        text_meta = {"mode": "fallback", "reason": "heuristic_only", **heuristic_meta}

    image_bytes, source_meta = _resolve_image_bytes(image_base64, image_cid)
    if image_bytes is None:
        image_score, image_label, image_meta = 0, "safe", {"mode": "none", **source_meta}
    else:
        digest = sum(image_bytes[:256]) % 101
        image_score = _clamp_score(25 + digest * 0.75)
        image_label = _label_from_score(
            image_score,
            harmful_threshold=settings.image_harmful_threshold,
            review_threshold=settings.review_threshold,
        )
        image_meta = {
            "mode": "fallback",
            "reason": "heuristic_image",
            "byte_digest": digest,
            **source_meta,
        }

    total_weight = max(settings.ai_text_weight + settings.ai_image_weight, 0.0001)
    text_weight = settings.ai_text_weight / total_weight
    image_weight = settings.ai_image_weight / total_weight

    combined_score = _clamp_score(text_score * text_weight + image_score * image_weight)
    combined_score = _apply_evidence_escalation(
        combined_score,
        text_score=text_score,
        text_label=text_label,
        image_score=image_score,
        image_label=image_label,
    )
    combined_label = _label_from_score(
        combined_score,
        harmful_threshold=settings.text_harmful_threshold,
        review_threshold=settings.review_threshold,
    )

    explanation = {
        "text": {"score": text_score, "label": text_label, **text_meta},
        "image": {
            "score": image_score,
            "label": image_label,
            "content_type": image_content_type,
            "image_cid": image_cid,
            **image_meta,
        },
        "thresholds": {
            "high_priority_threshold": settings.high_priority_threshold,
            "text_harmful_threshold": settings.text_harmful_threshold,
            "image_harmful_threshold": settings.image_harmful_threshold,
            "review_threshold": settings.review_threshold,
        },
    }

    return {
        "text_label": text_label,
        "image_label": image_label,
        "combined_label": combined_label,
        "risk_score": combined_score,
        "confidence_explanation": explanation,
        "processed_at": datetime.now(UTC),
    }
