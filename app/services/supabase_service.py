from typing import Any

from supabase import Client, create_client

from app.core.config import get_settings
from app.core.errors import AppError
from app.services.mock_store import mock_backend_store


class SupabaseService:
    def __init__(self) -> None:
        settings = get_settings()
        self._mock_mode = settings.mock_external_services
        self._mock_store = mock_backend_store if self._mock_mode else None
        if not settings.supabase_url or not settings.supabase_service_key:
            if not self._mock_mode:
                raise AppError(
                    code="supabase_not_configured",
                    message="Supabase credentials are not configured",
                    status_code=500,
                )
            self.client = None
            return
        self.client: Client | None = create_client(settings.supabase_url, settings.supabase_service_key)

    def insert_report(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self._mock_store is not None:
            return self._mock_store.insert_report(payload)
        assert self.client is not None
        response = self.client.table("reports").insert(payload).execute()
        if not response.data:
            raise AppError(code="report_insert_failed", message="Unable to create report", status_code=500)
        return response.data[0]

    def get_report_by_tracking_id(self, tracking_id: str) -> dict[str, Any] | None:
        if self._mock_store is not None:
            return self._mock_store.get_report(tracking_id)
        assert self.client is not None
        response = self.client.table("reports").select("*").eq("tracking_id", tracking_id).limit(1).execute()
        return response.data[0] if response.data else None

    def get_report_by_report_hash(self, report_hash: str) -> dict[str, Any] | None:
        if self._mock_store is not None:
            for report in self._mock_store.list_reports_by_jurisdiction(None):
                if report.get("report_hash") == report_hash:
                    return report
            return None
        assert self.client is not None
        response = self.client.table("reports").select("*").eq("report_hash", report_hash).limit(1).execute()
        return response.data[0] if response.data else None

    def get_report_by_ipfs_cid(self, ipfs_cid: str) -> dict[str, Any] | None:
        if self._mock_store is not None:
            for report in self._mock_store.list_reports_by_jurisdiction(None):
                if report.get("ipfs_cid") == ipfs_cid:
                    return report
            return None
        assert self.client is not None
        response = self.client.table("reports").select("*").eq("ipfs_cid", ipfs_cid).limit(1).execute()
        return response.data[0] if response.data else None

    def update_report(self, tracking_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        if self._mock_store is not None:
            try:
                return self._mock_store.update_report(tracking_id, payload)
            except KeyError as exc:
                raise AppError(code="report_update_failed", message="Unable to update report", status_code=500) from exc
        assert self.client is not None
        response = self.client.table("reports").update(payload).eq("tracking_id", tracking_id).execute()
        if not response.data:
            raise AppError(code="report_update_failed", message="Unable to update report", status_code=500)
        return response.data[0]

    def list_dashboard_cases(self, jurisdiction_code: str | None = None) -> list[dict[str, Any]]:
        if self._mock_store is not None:
            return self._mock_store.list_reports_by_jurisdiction(jurisdiction_code)
        assert self.client is not None
        query = self.client.table("reports").select(
            "tracking_id,jurisdiction_code,status,risk_score,combined_label,created_at"
        )
        if jurisdiction_code:
            query = query.eq("jurisdiction_code", jurisdiction_code)
        response = query.order("created_at", desc=True).execute()
        return response.data or []

    def insert_audit_log(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self._mock_store is not None:
            return self._mock_store.insert_audit_log(payload)
        assert self.client is not None
        response = self.client.table("audit_logs").insert(payload).execute()
        if not response.data:
            raise AppError(code="audit_log_failed", message="Unable to record audit log", status_code=500)
        return response.data[0]

    def has_blockchain_event_marker(self, event_id: str) -> bool:
        marker_actions = {"blockchain_report_submitted_processed", "blockchain_report_submitted_skipped"}
        if self._mock_store is not None:
            return any(
                log.get("action") in marker_actions
                and (log.get("metadata") or {}).get("event_id") == event_id
                for log in self._mock_store.audit_logs
            )
        assert self.client is not None
        response = self.client.table("audit_logs").select("action,metadata").in_("action", list(marker_actions)).execute()
        for row in response.data or []:
            metadata = row.get("metadata") or {}
            if metadata.get("event_id") == event_id:
                return True
        return False

    def get_latest_blockchain_event_block(self) -> int | None:
        if self._mock_store is not None:
            blocks: list[int] = []
            for log in self._mock_store.audit_logs:
                if log.get("action") not in {"blockchain_report_submitted_processed", "blockchain_report_submitted_skipped"}:
                    continue
                metadata = log.get("metadata") or {}
                block_number = metadata.get("block_number")
                if isinstance(block_number, int):
                    blocks.append(block_number)
            return max(blocks) if blocks else None
        assert self.client is not None
        response = (
            self.client.table("audit_logs")
            .select("metadata,created_at")
            .in_("action", ["blockchain_report_submitted_processed", "blockchain_report_submitted_skipped"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        metadata = response.data[0].get("metadata") or {}
        block_number = metadata.get("block_number")
        return block_number if isinstance(block_number, int) else None

    def insert_flagged_domain(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self._mock_store is not None:
            return self._mock_store.insert_flagged_domain(payload)
        assert self.client is not None
        response = self.client.table("flagged_domains").upsert(payload, on_conflict="domain").execute()
        if not response.data:
            raise AppError(code="flagged_domain_failed", message="Unable to store flagged domain", status_code=500)
        return response.data[0]
