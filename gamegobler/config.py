"""Configuration models for transfer operations."""

import os
import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator


def expand_env_vars(value: str) -> str:
    """Expand environment variables in a string.

    Supports ${VAR_NAME} syntax. If the environment variable is not set,
    raises a ValueError.
    """
    def replacer(match):
        var_name = match.group(1)
        env_value = os.getenv(var_name)
        if env_value is None:
            raise ValueError(
                f"Environment variable '{var_name}' is not set"
            )
        return env_value

    return re.sub(r"\$\{([^}]+)\}", replacer, value)


class TransferSystemConfig(BaseModel):
    """Configuration for a system transfer (filesystem or ADB)."""

    name: str = Field(description="System name (e.g., 'Nintendo DS')")
    source_dir: str = Field(
        description="Source directory containing files to transfer. Supports ${ENV_VAR} syntax."
    )
    dest_dir: str = Field(
        description="Destination directory for transferred files. Supports ${ENV_VAR} syntax."
    )
    transfer_method: str = Field(
        default="filesystem",
        description="Transfer method: 'filesystem' for local/mounted paths, 'adb' for Android devices",
    )
    adb_device_id: Optional[str] = Field(
        default=None,
        description="ADB device ID (optional - will auto-detect if only one device connected).",
    )
    file_patterns: list[str] = Field(
        default_factory=lambda: ["*"],
        description="File patterns to transfer (e.g., ['*.zip', '*.7z'])",
    )
    specific_files: Optional[list[str]] = Field(
        default=None,
        description="Specific list of filenames to transfer (overrides file_patterns if provided)",
    )
    include_filenames: Optional[list[str]] = Field(
        default=None,
        description="Substring filters - only transfer files containing ALL these substrings",
    )
    exclude_filenames: Optional[list[str]] = Field(
        default=None,
        description="Substring filters - exclude files containing ANY of these substrings",
    )
    skip_existing: bool = Field(
        default=True,
        description="Skip files that already exist at destination",
    )
    unzip_on_transfer: bool = Field(
        default=False,
        description="Unzip archive files and transfer contents",
    )
    sync_mode: bool = Field(
        default=False,
        description="Enable sync mode: remove files at destination not in source/config",
    )

    @field_validator("source_dir", "dest_dir")
    @classmethod
    def validate_dirs(cls, v: str) -> str:
        return expand_env_vars(v)

    @field_validator("transfer_method")
    @classmethod
    def validate_transfer_method(cls, v: str) -> str:
        if v not in ["filesystem", "adb"]:
            raise ValueError("transfer_method must be 'filesystem' or 'adb'")
        return v


class TransferConfig(BaseModel):
    """Main configuration for transfer operations."""

    systems: list[TransferSystemConfig] = Field(
        description="List of systems to transfer"
    )
    concurrent_transfers: int = Field(
        default=3,
        description="Number of concurrent file transfers",
    )
    verify_after_transfer: bool = Field(
        default=False,
        description="Verify file integrity after transfer (compare file sizes)",
    )
    dry_run: bool = Field(
        default=False,
        description="Preview changes without actually transferring files",
    )

    @field_validator("systems")
    @classmethod
    def validate_systems(cls, v: list[TransferSystemConfig]) -> list[TransferSystemConfig]:
        if not v:
            raise ValueError("At least one system must be configured")
        return v
