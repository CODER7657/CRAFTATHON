from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "POCSO Shield API"
    app_version: str = "0.1.0"
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = False
    api_prefix: str = "/api"

    postgres_url: str = Field(default="postgresql://postgres:postgres@localhost:5432/pocso")

    redis_url: str = Field(default="redis://localhost:6379/0")
    celery_broker_url: str = Field(default="redis://localhost:6379/0")
    celery_result_backend: str = Field(default="redis://localhost:6379/1")
    celery_task_default_queue: str = Field(default="pocso_shield")

    web3_storage_token: str = Field(default="")
    web3_storage_upload_url: str = Field(default="https://api.pinata.cloud/pinning/pinFileToIPFS")

    infura_api_key: str = Field(default="")
    ethereum_rpc_url: str = Field(default="")
    sepolia_contract_address: str = Field(default="")
    sepolia_contract_abi_json: str = Field(default="[]")
    blockchain_chain_id: int = 11155111

    authority_wallet_private_key: str = Field(default="")

    sodium_secret_key: str = Field(default="")
    zk_verifier_salt: str = Field(default="")

    gemini_api_key: str = Field(default="")
    gemini_model: str = Field(default="gemini-2.0-flash")
    ai_max_image_bytes: int = Field(default=5 * 1024 * 1024)
    ai_ipfs_gateway_template: str = Field(default="https://{cid}.ipfs.w3s.link")
    ai_ipfs_fetch_timeout_seconds: float = Field(default=20.0)
    ai_text_weight: float = Field(default=0.6)
    ai_image_weight: float = Field(default=0.4)
    high_priority_threshold: int = 80
    text_harmful_threshold: int = Field(default=70)
    image_harmful_threshold: int = Field(default=65)
    review_threshold: int = Field(default=45)

    railway_public_url: str = Field(default="")
    allowed_origins: str = Field(default="*")
    mock_external_services: bool = Field(default=False)
    mock_ai_models: bool = Field(default=False)
    mock_authority_api_key: str = Field(default="mock-authority-key")
    mock_authority_id: str = Field(default="mock-authority-1")
    mock_authority_jurisdiction_code: str = Field(default="MOCK-JURISDICTION")
    ipfs_max_upload_bytes: int = Field(default=10 * 1024 * 1024)
    blockchain_event_start_block: int = Field(default=0)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
