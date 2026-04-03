from __future__ import annotations

import base64
import hashlib
import os
from io import BytesIO

os.environ["MOCK_EXTERNAL_SERVICES"] = "true"
os.environ["MOCK_AI_MODELS"] = "true"
os.environ["MOCK_AUTHORITY_API_KEY"] = "mock-authority-key"
os.environ["MOCK_AUTHORITY_ID"] = "mock-authority-1"
os.environ["MOCK_AUTHORITY_JURISDICTION_CODE"] = "MOCK-JURISDICTION"
os.environ["ZK_VERIFIER_SALT"] = "unit-test-salt"
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_KEY"] = ""
os.environ["WEB3_STORAGE_TOKEN"] = ""
os.environ["WEB3_STORAGE_UPLOAD_URL"] = ""
os.environ["INFURA_API_KEY"] = ""
os.environ["SEPOLIA_CONTRACT_ADDRESS"] = ""

from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import get_settings
from app.main import app
from app.services.mock_store import mock_backend_store


client = TestClient(app)


def setup_function() -> None:
    get_settings.cache_clear()
    mock_backend_store.reset()


def _zk_proof_hash(report_hash: str) -> str:
    settings = get_settings()
    return hashlib.sha256(f"{report_hash}:{settings.zk_verifier_salt}".encode("utf-8")).hexdigest()


def _submit_report() -> tuple[str, dict[str, object]]:
    payload = {
        "jurisdiction_code": "MOCK-JURISDICTION",
        "incident_text": "This is a harmful child safety report with abusive content.",
        "source_url": "https://example.com/abuse",
        "image_cid": "bafyexampleimagecid",
        "attachment": {
            "filename": "evidence.bin",
            "content_type": "application/octet-stream",
            "encrypted_blob_base64": base64.b64encode(b"encrypted-evidence").decode("utf-8"),
            "nonce_base64": base64.b64encode(b"nonce-value-1234").decode("utf-8"),
            "key_hint": "unit-test",
        },
        "zk_proof_hash": _zk_proof_hash("report-hash-001"),
        "report_hash": "report-hash-001",
        "metadata": {"case_type": "smoke"},
    }
    response = client.post("/api/report/submit", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert data["status"] == "submitted"
    assert data["ipfs_cid"].startswith("bafy")
    return data["tracking_id"], payload


def _sample_image_base64() -> str:
    image = Image.new("RGB", (64, 64), color="white")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def test_report_submit_and_status() -> None:
    tracking_id, _ = _submit_report()

    response = client.get(f"/api/report/status/{tracking_id}")
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["tracking_id"] == tracking_id
    assert data["status"] == "submitted"


def test_classify_dashboard_and_authority_action() -> None:
    tracking_id, _ = _submit_report()

    classify_response = client.post("/api/ai/classify", json={"tracking_id": tracking_id})
    assert classify_response.status_code == 200, classify_response.text
    classify_data = classify_response.json()["data"]
    assert classify_data["status"] == "queued"

    status_response = client.get(f"/api/report/status/{tracking_id}")
    assert status_response.status_code == 200, status_response.text
    status_data = status_response.json()["data"]
    assert status_data["risk_score"] is not None
    assert status_data["confidence_explanation"] is not None
    assert status_data["confidence_explanation"]["thresholds"]["high_priority_threshold"] == 80

    dashboard_response = client.get(
        "/api/dashboard/cases",
        headers={"X-Authority-Api-Key": "mock-authority-key"},
    )
    assert dashboard_response.status_code == 200, dashboard_response.text
    dashboard_data = dashboard_response.json()["data"]
    assert len(dashboard_data["cases"]) == 1
    assert dashboard_data["cases"][0]["tracking_id"] == tracking_id

    action_response = client.post(
        "/api/authority/action",
        headers={"X-Authority-Api-Key": "mock-authority-key"},
        json={"tracking_id": tracking_id, "action": "investigating", "notes": "smoke test"},
    )
    assert action_response.status_code == 200, action_response.text
    action_data = action_response.json()["data"]
    assert action_data["tracking_id"] == tracking_id
    assert action_data["onchain_tx_hash"].startswith("0x")


def test_ipfs_upload_rejects_invalid_payload() -> None:
    response = client.post(
        "/api/files/upload",
        json={
            "filename": "evidence.bin",
            "content_type": "application/octet-stream",
            "encrypted_blob_base64": "not-base64",
        },
    )
    assert response.status_code == 400, response.text
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "invalid_base64"


def test_ai_classify_accepts_image_base64() -> None:
    tracking_id, _ = _submit_report()

    response = client.post(
        "/api/ai/classify",
        json={
            "tracking_id": tracking_id,
            "image_base64": _sample_image_base64(),
            "image_content_type": "image/png",
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["tracking_id"] == tracking_id
    assert data["status"] == "queued"
