"""Pydantic models for API request/response schemas."""

from pydantic import BaseModel, Field

from gamegobler.rom_parser import RomMeta  # re-exported for API use


class StorageInfo(BaseModel):
    path: str
    free: int | None = None
    total: int | None = None


class DeviceInfo(BaseModel):
    device_id: str
    device_type: str = "android"  # "android" | "volume"
    label: str = ""
    storage: dict[str, StorageInfo] = {}


class SystemInfo(BaseModel):
    name: str
    path: str
    game_count: int
    total_size: int


class GameFile(BaseModel):
    name: str
    size: int
    has_cover: bool = False
    meta: RomMeta | None = None


class SearchResult(GameFile):
    system: str


class DeviceFile(BaseModel):
    name: str
    path: str
    is_dir: bool = False


class SyncPreviewItem(BaseModel):
    name: str
    action: str  # "add" | "remove" | "keep"
    size: int | None = None


class SyncPreview(BaseModel):
    system_name: str
    device_id: str
    dest_dir: str
    to_add: list[SyncPreviewItem]
    to_remove: list[SyncPreviewItem]
    to_keep: list[SyncPreviewItem]
    total_add_size: int
    total_remove_count: int


class SyncRequest(BaseModel):
    device_id: str
    source_dir: str
    dest_dir: str
    games: list[str] = Field(description="List of game filenames to sync")
    unzip_on_transfer: bool = False


class SyncResult(BaseModel):
    added: int
    removed: int
    kept: int
    errors: list[str] = []


class TransferRequest(BaseModel):
    device_id: str
    source_dir: str
    dest_dir: str
    filename: str
    unzip_on_transfer: bool = False


class DeleteRequest(BaseModel):
    device_id: str
    file_path: str


class LibraryConfig(BaseModel):
    """Configuration for the local ROM library."""

    base_path: str
    systems: dict[str, str] = Field(
        default_factory=dict,
        description="Mapping of system name to subdirectory",
    )
