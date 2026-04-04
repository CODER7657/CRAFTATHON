-- Dev authority matching frontend AUTH_USER_1_AUTHORITY_API_KEY / backend mock_authority_api_key default.
-- Plain key: mock-authority-key  →  SHA256 (hex) below must match app/services/db_service.py hashlib.sha256(api_key).
-- Jurisdiction must match AUTH_USER_1_JURISDICTION (e.g. MOCK-JURISDICTION).

INSERT INTO public.authorities (name, jurisdiction_code, api_key_hash)
VALUES (
    'Local Dev Authority',
    'MOCK-JURISDICTION',
    '304cecc0e51620c81d515705a43a47f37130194a2d72c59b531dfe3829f4f598'
)
ON CONFLICT (jurisdiction_code) DO UPDATE SET
    api_key_hash = EXCLUDED.api_key_hash,
    name = EXCLUDED.name;
