from __future__ import annotations

import base64
import binascii
from datetime import UTC, datetime
from functools import lru_cache
from io import BytesIO
from typing import Any
from urllib.parse import urlparse

import httpx
import numpy as np
from PIL import Image

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


def _label_from_score(score: int, *, harmful_threshold: int, review_threshold: int) -> str:
    if score >= harmful_threshold:
        return "harmful"
    if score >= review_threshold:
        return "review"
    return "safe"


@lru_cache(maxsize=1)
def _get_text_classifier(model_name: str):
    from transformers import pipeline  # type: ignore

    return pipeline("text-classification", model=model_name, framework="pt")


@lru_cache(maxsize=1)
def _get_image_classifier(model_name: str):
    from transformers import pipeline  # type: ignore

    return pipeline("image-classification", model=model_name, framework="pt")


@lru_cache(maxsize=1)
def _get_zero_shot_text_classifier(model_name: str):
    from transformers import pipeline  # type: ignore

    return pipeline("zero-shot-classification", model=model_name, framework="pt")


@lru_cache(maxsize=1)
def _get_zero_shot_image_classifier(model_name: str):
    from transformers import pipeline  # type: ignore

    return pipeline("zero-shot-image-classification", model=model_name, framework="pt")


@lru_cache(maxsize=1)
def _get_tf_model(model_path: str):
    import tensorflow as tf  # type: ignore

    return tf.keras.models.load_model(model_path)


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


def _model_output_to_harm_score(label: str, confidence: float) -> int:
    normalized = label.strip().upper()
    # Handle common model output conventions (POSITIVE/NEGATIVE, LABEL_0/1, TOXIC/NON_TOXIC)
    harmful_labels = {
        "NEGATIVE",
        "LABEL_1",
        "TOXIC",
        "OFFENSIVE",
        "HARMFUL",
        "OBSCENE",
        "INSULT",
        "THREAT",
        "SEXUAL",
        "SEVERE_TOXIC",
    }
    safe_labels = {"POSITIVE", "LABEL_0", "NON_TOXIC", "SAFE", "NORMAL", "CLEAN"}

    if normalized in harmful_labels:
        return _clamp_score(40 + confidence * 60)
    if normalized in safe_labels:
        return _clamp_score((1.0 - confidence) * 40)

    if any(token in normalized for token in ("TOX", "OFFENS", "ABUSE", "HARM", "SEX", "NSFW", "EXPLICIT")):
        return _clamp_score(35 + confidence * 65)
    if any(token in normalized for token in ("SAFE", "NEUTRAL", "CLEAN", "NON")):
        return _clamp_score((1.0 - confidence) * 45)

    return _clamp_score(50)


def _image_output_to_harm_score(label: str, confidence: float) -> int:
    normalized = label.strip().upper()
    harmful_tokens = (
        "NSFW",
        "PORN",
        "EXPLICIT",
        "NUDE",
        "SEXUAL",
        "VIOLENCE",
        "ABUSE",
    )
    safe_tokens = ("SAFE", "SFW", "NORMAL", "BENIGN", "NEUTRAL")

    if any(token in normalized for token in harmful_tokens):
        return _clamp_score(45 + confidence * 55)
    if any(token in normalized for token in safe_tokens):
        return _clamp_score((1.0 - confidence) * 40)
    return _clamp_score(50)


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
            # Fall through and treat as raw bytes.
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
        classifier = _get_text_classifier(settings.hf_model_name)
        prediction = classifier(text[: max(16, settings.hf_model_max_length)], truncation=True)[0]
        label = str(prediction.get("label", "NEGATIVE")).upper()
        confidence = float(prediction.get("score", 0.5))

        model_score = _model_output_to_harm_score(label, confidence)

        zero_shot_score = None
        if settings.ai_use_zero_shot_text and text.strip():
            try:
                zsc = _get_zero_shot_text_classifier(settings.hf_text_zero_shot_model_name)
                zsc_result = zsc(
                    text[: max(32, settings.hf_model_max_length)],
                    candidate_labels=[
                        "sexual abuse",
                        "physical assault",
                        "child exploitation",
                        "safe content",
                    ],
                    multi_label=True,
                )
                labels = [str(v).lower() for v in zsc_result.get("labels", [])]
                scores = [float(v) for v in zsc_result.get("scores", [])]
                pairs = dict(zip(labels, scores, strict=False))
                harmful_prob = max(
                    pairs.get("sexual abuse", 0.0),
                    pairs.get("physical assault", 0.0),
                    pairs.get("child exploitation", 0.0),
                )
                zero_shot_score = _clamp_score(harmful_prob * 100.0)
            except Exception:
                zero_shot_score = None

        if zero_shot_score is None:
            score = _clamp_score(model_score * 0.7 + heuristic_score * 0.3)
        else:
            score = _clamp_score(model_score * 0.5 + heuristic_score * 0.25 + zero_shot_score * 0.25)

        return score, _label_from_score(
            score,
            harmful_threshold=settings.text_harmful_threshold,
            review_threshold=settings.review_threshold,
        ), {
            "mode": "hf",
            "model": settings.hf_model_name,
            "raw_label": label,
            "confidence": confidence,
            "model_score": model_score,
            "zero_shot_model": settings.hf_text_zero_shot_model_name if zero_shot_score is not None else None,
            "zero_shot_score": zero_shot_score,
            **heuristic_meta,
        }
    except Exception:
        fallback_score = _clamp_score(heuristic_score * 0.9 + 5)
        return fallback_score, _label_from_score(
            fallback_score,
            harmful_threshold=settings.text_harmful_threshold,
            review_threshold=settings.review_threshold,
        ), {"mode": "fallback", "reason": "hf_unavailable"}


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
        image = Image.open(BytesIO(image_bytes)).convert("RGB")

        if settings.ai_use_zero_shot_image and settings.hf_image_zero_shot_model_name:
            try:
                zsi = _get_zero_shot_image_classifier(settings.hf_image_zero_shot_model_name)
                zsi_result = zsi(
                    image,
                    candidate_labels=[
                        "physical assault",
                        "violence",
                        "sexual abuse",
                        "safe normal scene",
                    ],
                )
                labels = [str(v).lower() for v in zsi_result.get("labels", [])]
                scores = [float(v) for v in zsi_result.get("scores", [])]
                pairs = dict(zip(labels, scores, strict=False))
                harmful_prob = max(
                    pairs.get("physical assault", 0.0),
                    pairs.get("violence", 0.0),
                    pairs.get("sexual abuse", 0.0),
                )
                score = _clamp_score(harmful_prob * 100.0)
                return score, _label_from_score(
                    score,
                    harmful_threshold=settings.image_harmful_threshold,
                    review_threshold=settings.review_threshold,
                ), {
                    "mode": "hf_image_zero_shot",
                    "model": settings.hf_image_zero_shot_model_name,
                    "harmful_probability": harmful_prob,
                    "raw": dict(zip(labels, scores, strict=False)),
                    **source_meta,
                }
            except Exception:
                # Continue to other image paths if zero-shot model fails.
                pass

        if settings.hf_image_model_name:
            classifier = _get_image_classifier(settings.hf_image_model_name)
            prediction = classifier(image)[0]
            label = str(prediction.get("label", "SAFE")).upper()
            confidence = float(prediction.get("score", 0.5))
            score = _image_output_to_harm_score(label, confidence)
            return score, _label_from_score(
                score,
                harmful_threshold=settings.image_harmful_threshold,
                review_threshold=settings.review_threshold,
            ), {
                "mode": "hf_image",
                "model": settings.hf_image_model_name,
                "raw_label": label,
                "confidence": confidence,
                **source_meta,
            }

        import tensorflow as tf  # type: ignore

        image = Image.open(BytesIO(image_bytes))
        image.verify()
        image = Image.open(BytesIO(image_bytes)).convert("RGB").resize((224, 224))
        image_arr = np.array(image, dtype=np.float32) / 255.0
        batch = np.expand_dims(image_arr, axis=0)

        if settings.tf_image_model_path:
            model = _get_tf_model(settings.tf_image_model_path)
            pred = model.predict(batch, verbose=0)
            values = np.array(pred).reshape(-1)
            idx = min(max(settings.tf_prediction_index, 0), len(values) - 1)
            value = float(values[idx])
            score = _clamp_score(value * 100.0)
            return score, _label_from_score(
                score,
                harmful_threshold=settings.image_harmful_threshold,
                review_threshold=settings.review_threshold,
            ), {"mode": "tf", "model_path": settings.tf_image_model_path, **source_meta}

        # Conservative fallback when no TF model exists: send to review instead of pretending high confidence.
        score = 55
        return score, _label_from_score(
            score,
            harmful_threshold=settings.image_harmful_threshold,
            review_threshold=settings.review_threshold,
        ), {"mode": "tf_fallback", "reason": "model_path_missing", **source_meta}
    except AppError:
        raise
    except Exception:
        fallback = 50
        return fallback, _label_from_score(
            fallback,
            harmful_threshold=settings.image_harmful_threshold,
            review_threshold=settings.review_threshold,
        ), {"mode": "fallback", "reason": "tf_or_hf_image_unavailable", **source_meta}


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

    # If one modality is strongly harmful and the other modality has no effective signal,
    # keep the combined score close to the strongest evidence instead of averaging it away.
    if (text_label == "harmful" and image_score == 0) or (image_label == "harmful" and text_score == 0):
        escalated = max(escalated, _clamp_score(max(text_score, image_score) * 0.85))

    if text_label == "harmful" and image_label == "harmful":
        escalated = max(escalated, min(100, max(text_score, image_score) + 10))

    # Do not allow strong text evidence to be averaged down to "safe"
    # when image model only signals non-NSFW content.
    if text_score >= settings.review_threshold and image_label == "safe":
        escalated = max(escalated, min(100, text_score))

    return _clamp_score(escalated)


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
