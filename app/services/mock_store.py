from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime


class _MockBackendStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.reports: dict[str, dict] = {}
        self.audit_logs: list[dict] = []
        self.flagged_domains: dict[str, dict] = {}

    def insert_report(self, payload: dict) -> dict:
        report = deepcopy(payload)
        report.setdefault("created_at", datetime.now(UTC).isoformat())
        report.setdefault("updated_at", report["created_at"])
        self.reports[report["tracking_id"]] = report
        return deepcopy(report)

    def get_report(self, tracking_id: str) -> dict | None:
        report = self.reports.get(tracking_id)
        return deepcopy(report) if report else None

    def update_report(self, tracking_id: str, payload: dict) -> dict:
        report = self.reports[tracking_id]
        report.update(deepcopy(payload))
        report.setdefault("updated_at", datetime.now(UTC).isoformat())
        return deepcopy(report)

    def list_reports_by_jurisdiction(self, jurisdiction_code: str | None) -> list[dict]:
        reports = list(self.reports.values())
        if jurisdiction_code:
            reports = [r for r in reports if r.get("jurisdiction_code") == jurisdiction_code]
        reports.sort(key=lambda r: r.get("created_at", ""), reverse=True)
        return deepcopy(reports)

    def insert_audit_log(self, payload: dict) -> dict:
        item = deepcopy(payload)
        self.audit_logs.append(item)
        return deepcopy(item)

    def insert_flagged_domain(self, payload: dict) -> dict:
        item = deepcopy(payload)
        self.flagged_domains[item["domain"]] = item
        return deepcopy(item)


mock_backend_store = _MockBackendStore()
