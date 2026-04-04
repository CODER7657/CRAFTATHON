import hashlib
import json
from typing import Any, Optional
import psycopg2
from psycopg2.extras import RealDictCursor
from app.core.config import get_settings
from app.core.errors import AppError
from app.services.mock_store import mock_backend_store


def _audit_metadata_as_dict(raw: Any) -> dict[str, Any]:
    """JSONB may come back as dict or as a serialized JSON string depending on driver/config."""
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        stripped = raw.strip()
        if not stripped or stripped[0] not in "{[":
            return {}
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


class DBService:
    def __init__(self) -> None:
        settings = get_settings()
        self._mock_mode = settings.mock_external_services
        self._mock_store = mock_backend_store if self._mock_mode else None
        self._db_url = getattr(settings, "postgres_url", "postgresql://postgres:postgres@localhost:5432/pocso")
        
        if not self._mock_mode and not self._db_url:
            raise AppError(
                code="db_not_configured",
                message="Database credentials are not configured",
                status_code=500,
            )

    def _get_connection(self):
        try:
            return psycopg2.connect(self._db_url, cursor_factory=RealDictCursor)
        except Exception as e:
            raise AppError(
                code="db_unreachable",
                message="Database is temporarily unreachable",
                status_code=503,
                details={"error_type": str(e)},
            )

    def insert_report(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self._mock_store is not None:
            return self._mock_store.insert_report(payload)
        
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                import json
                for k, v in payload.items():
                    if isinstance(v, (dict, list)):
                        payload[k] = json.dumps(v)
                
                columns = payload.keys()
                values = [payload[k] for k in columns]
                col_names = ", ".join(columns)
                placeholders = ", ".join(["%s"] * len(columns))
                query = f"INSERT INTO public.reports ({col_names}) VALUES ({placeholders}) RETURNING *"
                try:
                    cur.execute(query, values)
                    result = cur.fetchone()
                    conn.commit()
                    return dict(result) if result else {}
                except Exception as e:
                    conn.rollback()
                    raise AppError(code="report_insert_failed", message=f"Unable to create report: {e}", status_code=500)

    def get_report_by_tracking_id(self, tracking_id: str) -> Optional[dict[str, Any]]:
        if self._mock_store is not None:
            return self._mock_store.get_report(tracking_id)
        
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM public.reports WHERE tracking_id = %s LIMIT 1", (tracking_id,))
                result = cur.fetchone()
                return dict(result) if result else None

    def get_report_by_report_hash(self, report_hash: str) -> Optional[dict[str, Any]]:
        if self._mock_store is not None:
            for report in self._mock_store.list_reports_by_jurisdiction(None):
                if report.get("report_hash") == report_hash:
                    return report
            return None
        
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM public.reports WHERE report_hash = %s LIMIT 1", (report_hash,))
                result = cur.fetchone()
                return dict(result) if result else None

    def get_report_by_ipfs_cid(self, ipfs_cid: str) -> Optional[dict[str, Any]]:
        if self._mock_store is not None:
            for report in self._mock_store.list_reports_by_jurisdiction(None):
                if report.get("ipfs_cid") == ipfs_cid:
                    return report
            return None
            
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM public.reports WHERE ipfs_cid = %s LIMIT 1", (ipfs_cid,))
                result = cur.fetchone()
                return dict(result) if result else None

    def update_report(self, tracking_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        if self._mock_store is not None:
            try:
                return self._mock_store.update_report(tracking_id, payload)
            except KeyError as exc:
                raise AppError(code="report_update_failed", message="Unable to update report", status_code=500) from exc
                
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                import json
                for k, v in payload.items():
                    if isinstance(v, (dict, list)):
                        payload[k] = json.dumps(v)
                        
                columns = list(payload.keys())
                values = [payload[k] for k in columns]
                set_clause = ", ".join([f"{k} = %s" for k in columns])
                query = f"UPDATE public.reports SET {set_clause} WHERE tracking_id = %s RETURNING *"
                values.append(tracking_id)
                try:
                    cur.execute(query, values)
                    result = cur.fetchone()
                    conn.commit()
                    if not result:
                        raise AppError(code="report_update_failed", message="Unable to update report", status_code=500)
                    return dict(result)
                except Exception as e:
                    conn.rollback()
                    raise AppError(code="report_update_failed", message=f"Unable to update report: {e}", status_code=500)

    def list_dashboard_cases(self, jurisdiction_code: Optional[str] = None) -> list[dict[str, Any]]:
        if self._mock_store is not None:
            rows = self._mock_store.list_reports_by_jurisdiction(jurisdiction_code)
            hash_map = self._lookup_onchain_hashes([str(r.get("tracking_id") or "") for r in rows])
            for row in rows:
                tid = str(row.get("tracking_id") or "")
                row["onchain_tx_hash"] = hash_map.get(tid)
            return rows
            
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                query = "SELECT tracking_id, jurisdiction_code, status, risk_score, combined_label, created_at, authority_action FROM public.reports"
                args = []
                if jurisdiction_code:
                    query += " WHERE jurisdiction_code = %s"
                    args.append(jurisdiction_code)
                query += " ORDER BY created_at DESC"
                
                cur.execute(query, args)
                rows = [dict(row) for row in cur.fetchall()]
                hash_map = self._lookup_onchain_hashes([str(r.get("tracking_id") or "") for r in rows])
                for row in rows:
                    tid = str(row.get("tracking_id") or "")
                    row["onchain_tx_hash"] = hash_map.get(tid)
                return rows

    def _lookup_onchain_hashes(self, tracking_ids: list[str]) -> dict[str, str]:
        clean_ids = [tid for tid in tracking_ids if tid]
        if not clean_ids:
            return {}

        if self._mock_store is not None:
            result: dict[str, str] = {}
            for log in reversed(self._mock_store.audit_logs):
                tid = str(log.get("tracking_id") or "")
                if tid not in clean_ids or tid in result:
                    continue
                metadata = _audit_metadata_as_dict(log.get("metadata"))
                tx_hash = (
                    metadata.get("onchain_tx_hash")
                    or metadata.get("blockchain_tx_hash")
                    or metadata.get("verdict_tx_hash")
                    or metadata.get("transaction_hash")
                )
                if isinstance(tx_hash, str) and tx_hash:
                    result[tid] = tx_hash
            return result

        with self._get_connection() as conn:
            with conn.cursor() as cur:
                placeholders = ", ".join(["%s"] * len(clean_ids))
                cur.execute(f"SELECT tracking_id, metadata, created_at FROM public.audit_logs WHERE tracking_id IN ({placeholders}) ORDER BY created_at DESC", clean_ids)
                
                result: dict[str, str] = {}
                for row in cur.fetchall():
                    tid = str(row.get("tracking_id") or "")
                    if not tid or tid in result:
                        continue
                    metadata = _audit_metadata_as_dict(row.get("metadata"))
                    tx_hash = (
                        metadata.get("onchain_tx_hash")
                        or metadata.get("blockchain_tx_hash")
                        or metadata.get("verdict_tx_hash")
                        or metadata.get("transaction_hash")
                    )
                    if isinstance(tx_hash, str) and tx_hash:
                        result[tid] = tx_hash
                return result

    def get_onchain_tx_hash(self, tracking_id: str) -> Optional[str]:
        return self._lookup_onchain_hashes([tracking_id]).get(tracking_id)

    def insert_audit_log(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self._mock_store is not None:
            return self._mock_store.insert_audit_log(payload)
            
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                import json
                for k, v in payload.items():
                    if isinstance(v, (dict, list)):
                        payload[k] = json.dumps(v)
                        
                columns = payload.keys()
                values = [payload[k] for k in columns]
                col_names = ", ".join(columns)
                placeholders = ", ".join(["%s"] * len(columns))
                query = f"INSERT INTO public.audit_logs ({col_names}) VALUES ({placeholders}) RETURNING *"
                try:
                    cur.execute(query, values)
                    result = cur.fetchone()
                    conn.commit()
                    return dict(result) if result else {}
                except Exception as e:
                    conn.rollback()
                    raise AppError(code="audit_log_failed", message=f"Unable to record audit log: {e}", status_code=500)

    def has_blockchain_event_marker(self, event_id: str) -> bool:
        marker_actions = {"blockchain_report_submitted_processed", "blockchain_report_submitted_skipped"}
        if self._mock_store is not None:
            return any(
                log.get("action") in marker_actions
                and (log.get("metadata") or {}).get("event_id") == event_id
                for log in self._mock_store.audit_logs
            )
            
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                placeholders = ", ".join(["%s"] * len(marker_actions))
                cur.execute(f"SELECT action, metadata FROM public.audit_logs WHERE action IN ({placeholders})", list(marker_actions))
                for row in cur.fetchall():
                    metadata = _audit_metadata_as_dict(row.get("metadata"))
                    if metadata.get("event_id") == event_id:
                        return True
                return False

    def get_latest_blockchain_event_block(self) -> Optional[int]:
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
            
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT metadata, created_at FROM public.audit_logs WHERE action IN ('blockchain_report_submitted_processed', 'blockchain_report_submitted_skipped') ORDER BY created_at DESC LIMIT 1")
                result = cur.fetchone()
                if not result:
                    return None
                metadata = _audit_metadata_as_dict(result.get("metadata"))
                block_number = metadata.get("block_number")
                return block_number if isinstance(block_number, int) else None

    def insert_flagged_domain(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self._mock_store is not None:
            return self._mock_store.insert_flagged_domain(payload)
            
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                candidates: list[dict[str, Any]] = [payload]
                candidates.append(
                    {
                        "domain": payload.get("domain"),
                        "severity": payload.get("severity") or payload.get("label") or "review",
                        "reason": payload.get("reason") or "ai_classification",
                        "report_tracking_id": payload.get("report_tracking_id"),
                        "created_at": payload.get("created_at"),
                    }
                )
                candidates.append(
                    {
                        "domain": payload.get("domain"),
                        "label": payload.get("label") or payload.get("severity") or "review",
                        "risk_score": payload.get("risk_score") or 0,
                        "reason": payload.get("reason") or "ai_classification",
                        "created_at": payload.get("created_at"),
                    }
                )

                for candidate in candidates:
                    try:
                        clean_candidate = {k:v for k,v in candidate.items() if v is not None}
                        if "label" in clean_candidate and "severity" not in clean_candidate:
                            clean_candidate["severity"] = clean_candidate["label"]
                            del clean_candidate["label"]
                        if "risk_score" in clean_candidate:
                            del clean_candidate["risk_score"]
                            
                        columns = clean_candidate.keys()
                        if "domain" not in columns: continue
                        values = [clean_candidate[k] for k in columns]
                        col_names = ", ".join(columns)
                        placeholders = ", ".join(["%s"] * len(columns))
                        
                        set_clause = ", ".join([f"{k} = EXCLUDED.{k}" for k in columns])
                        query = f"INSERT INTO public.flagged_domains ({col_names}) VALUES ({placeholders}) ON CONFLICT (domain) DO UPDATE SET {set_clause} RETURNING *"
                        
                        cur.execute(query, values)
                        result = cur.fetchone()
                        conn.commit()
                        if result:
                            return dict(result)
                    except Exception:
                        conn.rollback()
                        continue

                raise AppError(code="flagged_domain_failed", message="Unable to store flagged domain", status_code=500)

    def get_authority_by_api_key(self, api_key: str) -> Optional[dict[str, Any]]:
        if self._mock_store is not None:
            return {
                "id": "mock-authority-1",
                "jurisdiction_code": "MOCK-JURISDICTION",
                "is_active": True,
                "api_key": api_key,
            }

        hashed_key = hashlib.sha256(api_key.encode("utf-8")).hexdigest()

        with self._get_connection() as conn:
            with conn.cursor() as cur:
                try:
                    cur.execute("SELECT id, jurisdiction_code, api_key_hash, wallet_address FROM public.authorities WHERE api_key_hash = %s LIMIT 1", (hashed_key,))
                    result = cur.fetchone()
                    if not result:
                        return None
                    return dict(result)
                except Exception as e:
                    raise AppError(code="db_error", message=f"Database error: {e}", status_code=500)
