"""Device management API routes.

Delegates volume operations to the platform abstraction layer, making
all endpoints work identically on Linux, macOS, and Windows.
"""

import contextlib
import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from gamegobler import settings
from gamegobler.api.models import DeviceFile, DeviceInfo, SearchResult, StorageInfo
from gamegobler.platform import get_platform
from gamegobler.rom_parser import parse_rom_filename
from gamegobler.transfer import ADBManager

router = APIRouter()


def _volume_storage(mount_path: str) -> dict[str, StorageInfo]:
    """Get storage info for a mounted volume."""
    try:
        usage = shutil.disk_usage(mount_path)
        return {
            "volume": StorageInfo(path=mount_path, free=usage.free, total=usage.total)
        }
    except OSError:
        return {"volume": StorageInfo(path=mount_path)}


def _volume_connected(mount_path: str) -> bool:
    """Check if a volume mount path is still accessible."""
    return Path(mount_path).is_dir()


# ─── Device listing ────────────────────────────────────


@router.get("/")
async def list_devices() -> list[DeviceInfo]:
    """List all connected devices (ADB + registered volumes)."""
    devices: list[DeviceInfo] = []

    # ADB devices
    if ADBManager.check_adb_available():
        for device_id in ADBManager.get_all_devices():
            storage_raw = await ADBManager.list_storage_locations(device_id)
            storage = {
                k: StorageInfo(path=v["path"], free=v.get("free"), total=v.get("total"))
                for k, v in storage_raw.items()
            }
            devices.append(
                DeviceInfo(
                    device_id=device_id,
                    device_type="android",
                    label=device_id,
                    storage=storage,
                )
            )

    # Registered volume devices
    for reg in settings.get_registered_devices():
        mount_path = reg["path"]
        if _volume_connected(mount_path):
            devices.append(
                DeviceInfo(
                    device_id=mount_path,
                    device_type="volume",
                    label=reg.get("label", Path(mount_path).name),
                    storage=_volume_storage(mount_path),
                )
            )

    return devices


# ─── Volume discovery & registration ──────────────────


@router.get("/volumes/discover")
async def discover_volumes() -> list[dict]:
    """Discover mounted USB/removable volumes that could be emulation devices.

    Delegates to the OS-specific platform backend (lsblk on Linux,
    diskutil on macOS, PowerShell on Windows).
    """
    data = settings.load()
    library_path = data.get("library_path", "")
    registered_paths = {d["path"] for d in data.get("registered_devices", [])}

    exclude_paths = registered_paths.copy()
    if library_path:
        exclude_paths.add(library_path)

    plat = get_platform()
    vols = plat.discover_volumes(exclude_paths=exclude_paths)
    return [
        {
            "path": v.path,
            "label": v.label,
            "size": v.size,
            "fstype": v.fstype,
            "model": v.model,
        }
        for v in vols
    ]


class RegisterDeviceRequest(BaseModel):
    path: str
    label: str = ""


@router.post("/volumes/register")
async def register_volume(req: RegisterDeviceRequest) -> DeviceInfo:
    """Register a mounted volume as an emulation device."""
    mount_path = req.path
    if not Path(mount_path).is_dir():
        raise HTTPException(status_code=400, detail=f"Path not found: {mount_path}")

    data = settings.load()
    devices = data.get("registered_devices", [])

    if any(d["path"] == mount_path for d in devices):
        raise HTTPException(status_code=409, detail="Device already registered")

    label = req.label or Path(mount_path).name
    devices.append({"path": mount_path, "label": label})
    data["registered_devices"] = devices
    settings.save(data)

    return DeviceInfo(
        device_id=mount_path,
        device_type="volume",
        label=label,
        storage=_volume_storage(mount_path),
    )


@router.delete("/volumes/register")
async def unregister_volume(path: str) -> dict:
    """Remove a registered volume device."""
    data = settings.load()
    devices = data.get("registered_devices", [])
    before = len(devices)
    devices = [d for d in devices if d["path"] != path]
    if len(devices) == before:
        raise HTTPException(status_code=404, detail="Device not registered")
    data["registered_devices"] = devices
    settings.save(data)
    return {"status": "removed", "path": path}


@router.post("/volumes/eject")
async def eject_volume(path: str) -> dict:
    """Safely unmount and power off a volume device.

    Uses the OS-appropriate eject mechanism.  Unregisters the device
    on success.
    """
    registered = settings.get_registered_devices()
    if not any(d["path"] == path for d in registered):
        raise HTTPException(status_code=400, detail="Device not registered")

    plat = get_platform()
    result = plat.eject_volume(path)
    if not result.success:
        raise HTTPException(status_code=500, detail=result.error)

    # Unregister the device
    data = settings.load()
    data["registered_devices"] = [
        d for d in data.get("registered_devices", []) if d["path"] != path
    ]
    settings.save(data)
    return {"status": "ejected", "path": path}


# ─── Device file operations ───────────────────────────


@router.get("/files")
async def list_device_files(device_id: str, path: str = "/sdcard") -> list[DeviceFile]:
    """List files on a device at the given path.

    For volume devices (device_id starts with / or a drive letter), uses
    native filesystem.  For ADB devices, uses adb shell.
    """
    if _is_volume_id(device_id):
        return _list_volume_files(device_id, path)

    if not ADBManager.check_device_connected(device_id):
        raise HTTPException(status_code=404, detail=f"Device {device_id} not connected")

    raw_entries = await ADBManager.list_files(path, device_id, recursive=False)
    result: list[DeviceFile] = []
    for entry in raw_entries:
        is_dir = entry.endswith("/")
        name = entry.rstrip("/")
        full_path = f"{path}/{name}" if not path.endswith("/") else f"{path}{name}"
        result.append(DeviceFile(name=name, path=full_path, is_dir=is_dir))

    return result


@router.get("/files/recursive")
async def list_device_files_recursive(
    device_id: str, path: str = "/sdcard"
) -> list[DeviceFile]:
    """List all files recursively."""
    if _is_volume_id(device_id):
        return _list_volume_files_recursive(device_id, path)

    if not ADBManager.check_device_connected(device_id):
        raise HTTPException(status_code=404, detail=f"Device {device_id} not connected")

    files = await ADBManager.list_files(path, device_id, recursive=True)
    result: list[DeviceFile] = []
    for name in files:
        full_path = f"{path}/{name}" if not path.endswith("/") else f"{path}{name}"
        result.append(DeviceFile(name=name, path=full_path))

    return result


@router.delete("/files")
async def delete_device_file(device_id: str, file_path: str) -> dict:
    """Delete a file from a device."""
    if _is_volume_id(device_id):
        return _delete_volume_file(device_id, file_path)

    if not ADBManager.check_device_connected(device_id):
        raise HTTPException(status_code=404, detail=f"Device {device_id} not connected")

    success = await ADBManager.delete_file(file_path, device_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete {file_path}")

    return {"status": "deleted", "path": file_path}


# ─── Volume file helpers (native filesystem) ──────────


def _is_volume_id(device_id: str) -> bool:
    """Volume IDs are filesystem paths (Unix ``/...`` or Windows ``X:\\``)."""
    return device_id.startswith("/") or (
        len(device_id) >= 2 and device_id[1] == ":" and device_id[0].isalpha()
    )


def _validate_volume_path(device_id: str, file_path: str) -> Path:
    """Ensure *file_path* is within the device mount to prevent traversal."""
    base = Path(device_id).resolve()
    target = Path(file_path).resolve()
    if not str(target).startswith(str(base)):
        raise HTTPException(status_code=403, detail="Access denied")
    return target


def _list_volume_files(device_id: str, path: str) -> list[DeviceFile]:
    target = _validate_volume_path(device_id, path)
    if not target.is_dir():
        raise HTTPException(status_code=404, detail=f"Directory not found: {path}")

    result: list[DeviceFile] = []
    try:
        for entry in sorted(target.iterdir()):
            if entry.name.startswith("."):
                continue
            result.append(
                DeviceFile(name=entry.name, path=str(entry), is_dir=entry.is_dir())
            )
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    return result


def _list_volume_files_recursive(device_id: str, path: str) -> list[DeviceFile]:
    target = _validate_volume_path(device_id, path)
    if not target.is_dir():
        raise HTTPException(status_code=404, detail=f"Directory not found: {path}")

    result: list[DeviceFile] = []
    for root, _dirs, files in os.walk(target):
        for f in files:
            fp = Path(root) / f
            result.append(DeviceFile(name=f, path=str(fp)))
    return result


def _delete_volume_file(device_id: str, file_path: str) -> dict:
    target = _validate_volume_path(device_id, file_path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    target.unlink()
    return {"status": "deleted", "path": file_path}


# ─── Volume setup ──────────────────────────────────────

DEVICE_ROMS_DIR = "ROMs"
DEVICE_BIOS_DIR = "BIOS"
ADB_ROMS_BASE = "/sdcard/ROMs"

PROTECTED_MOUNTS = frozenset(
    {
        "/",
        "/boot",
        "/boot/efi",
        "/home",
        "/var",
        "/usr",
        "/etc",
        "/opt",
        "/tmp",
        "/root",
        # Windows system drives
        "C:\\",
    }
)


@router.get("/volumes/status")
async def volume_status(device_id: str) -> dict:
    """Get filesystem type and initialization status of a volume."""
    mount_path = Path(device_id)
    if not mount_path.is_dir():
        raise HTTPException(status_code=404, detail="Volume not accessible")

    plat = get_platform()
    vol_info = plat.get_volume_info(device_id)

    roms_dir = mount_path / DEVICE_ROMS_DIR
    bios_dir = mount_path / DEVICE_BIOS_DIR

    systems_on_device: list[dict] = []
    if roms_dir.is_dir():
        for d in sorted(roms_dir.iterdir()):
            if d.is_dir() and not d.name.startswith("."):
                game_count = sum(
                    1 for f in d.iterdir() if f.is_file() and not f.name.startswith(".")
                )
                systems_on_device.append({"name": d.name, "game_count": game_count})

    bios_count = 0
    if bios_dir.is_dir():
        bios_count = sum(
            1 for f in bios_dir.iterdir() if f.is_file() and not f.name.startswith(".")
        )

    return {
        "fstype": vol_info.fstype,
        "is_initialized": roms_dir.is_dir(),
        "systems": systems_on_device,
        "bios_count": bios_count,
    }


class FormatVolumeRequest(BaseModel):
    device_id: str
    label: str = "EMUROMS"


@router.post("/volumes/format")
async def format_volume(req: FormatVolumeRequest) -> dict:
    """Format a registered volume as exFAT for broad device compatibility.

    Uses the OS-appropriate format mechanism.
    WARNING: This erases all data on the volume.
    """
    mount_path = req.device_id

    # Safety checks
    registered = settings.get_registered_devices()
    if not any(d["path"] == mount_path for d in registered):
        raise HTTPException(status_code=400, detail="Device not registered")

    if mount_path == settings.get("library_path", ""):
        raise HTTPException(status_code=403, detail="Cannot format the library drive")

    if mount_path in PROTECTED_MOUNTS:
        raise HTTPException(status_code=403, detail="Cannot format a system mount")

    if not Path(mount_path).is_dir():
        raise HTTPException(
            status_code=400, detail=f"Mount path not accessible: {mount_path}"
        )

    plat = get_platform()
    result = plat.format_volume(mount_path, label=req.label)
    if not result.success:
        status = 403 if "permission" in result.error.lower() else 500
        raise HTTPException(status_code=status, detail=result.error)

    # Update settings with new path and label
    data = settings.load()
    for d in data.get("registered_devices", []):
        if d["path"] == mount_path:
            d["path"] = result.new_path
            d["label"] = req.label[:11].strip() or "EMUROMS"
    settings.save(data)

    return {
        "status": "formatted",
        "filesystem": "exfat",
        "label": req.label[:11].strip() or "EMUROMS",
        "new_path": result.new_path,
    }


class InitializeVolumeRequest(BaseModel):
    device_id: str


@router.post("/volumes/initialize")
async def initialize_volume(req: InitializeVolumeRequest):
    """Create ES-DE ROM folder structure and copy BIOS files. Returns SSE progress."""
    plat = get_platform()
    try:
        actual_path = plat.ensure_writable(req.device_id)
    except OSError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    mount_path = Path(actual_path)
    if not mount_path.is_dir():
        raise HTTPException(
            status_code=400, detail=f"Volume not accessible: {req.device_id}"
        )

    # Update registered path if it changed after remount
    if actual_path != req.device_id:
        data = settings.load()
        for d in data.get("registered_devices", []):
            if d["path"] == req.device_id:
                d["path"] = actual_path
        settings.save(data)

    library_path = settings.get_library_path()
    if not library_path.is_dir():
        raise HTTPException(status_code=400, detail="Library path not configured")

    # Only create directories for systems that have game files
    non_system_dirs = {"BIOS", "downloaded_media", "media", "images"}
    systems_to_create: list[str] = []
    for d in sorted(library_path.iterdir()):
        if d.is_dir() and not d.name.startswith(".") and d.name not in non_system_dirs:
            if any(f.is_file() and not f.name.startswith(".") for f in d.iterdir()):
                systems_to_create.append(d.name)

    # Collect BIOS files (flatten nested dirs)
    bios_source = library_path / "BIOS"
    bios_files: list[Path] = []
    if bios_source.is_dir():
        for f in bios_source.rglob("*"):
            if f.is_file() and not f.name.startswith(".") and f.name != ".DS_Store":
                bios_files.append(f)

    total_steps = len(systems_to_create) + len(bios_files)
    roms_root = mount_path / DEVICE_ROMS_DIR
    bios_dest = mount_path / DEVICE_BIOS_DIR

    async def event_stream():
        current = 0
        errors: list[str] = []

        for system_name in systems_to_create:
            (roms_root / system_name).mkdir(parents=True, exist_ok=True)
            current += 1
            evt = json.dumps(
                {
                    "step": "folder",
                    "name": system_name,
                    "current": current,
                    "total": total_steps,
                }
            )
            yield f"data: {evt}\n\n"

        bios_dest.mkdir(parents=True, exist_ok=True)
        copied_names: set[str] = set()
        bios_copied = 0
        for bios_file in bios_files:
            current += 1
            if bios_file.name in copied_names:
                evt = json.dumps(
                    {
                        "step": "bios_skip",
                        "name": bios_file.name,
                        "current": current,
                        "total": total_steps,
                    }
                )
                yield f"data: {evt}\n\n"
                continue
            copied_names.add(bios_file.name)
            dest = bios_dest / bios_file.name
            try:
                if not dest.exists():
                    shutil.copy2(bios_file, dest)
                bios_copied += 1
            except OSError as e:
                errors.append(f"{bios_file.name}: {e}")
            evt = json.dumps(
                {
                    "step": "bios",
                    "name": bios_file.name,
                    "current": current,
                    "total": total_steps,
                }
            )
            yield f"data: {evt}\n\n"

        evt = json.dumps(
            {
                "step": "done",
                "systems_created": len(systems_to_create),
                "bios_copied": bios_copied,
                "errors": errors,
                "current": total_steps,
                "total": total_steps,
            }
        )
        yield f"data: {evt}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ─── Game management ──────────────────────────────────


def _device_roms_path(device_id: str, system: str) -> str:
    """Get the ROM directory path on a device for a system."""
    if _is_volume_id(device_id):
        return str(Path(device_id) / DEVICE_ROMS_DIR / system)
    return f"{ADB_ROMS_BASE}/{system}"


@router.get("/games")
async def list_device_games(device_id: str, system: str) -> list[str]:
    """List game filenames on a device for a given system."""
    roms_path = _device_roms_path(device_id, system)

    if _is_volume_id(device_id):
        _validate_volume_path(device_id, roms_path)
        roms_dir = Path(roms_path)
        if not roms_dir.is_dir():
            return []
        return sorted(
            f.name
            for f in roms_dir.iterdir()
            if f.is_file() and not f.name.startswith(".")
        )
    else:
        if not ADBManager.check_device_connected(device_id):
            raise HTTPException(
                status_code=404, detail=f"Device {device_id} not connected"
            )
        try:
            files = await ADBManager.list_files(roms_path, device_id, recursive=False)
            return sorted(f.rstrip("/") for f in files if not f.endswith("/"))
        except Exception:
            return []


@router.get("/games/installed")
async def list_installed_games(device_id: str) -> list[SearchResult]:
    """List all games installed on a device across all systems, with library metadata."""
    library_path = settings.get_library_path()
    results: list[SearchResult] = []

    if _is_volume_id(device_id):
        roms_base = Path(device_id) / DEVICE_ROMS_DIR
        if not roms_base.is_dir():
            return []
        for system_dir in sorted(roms_base.iterdir()):
            if not system_dir.is_dir() or system_dir.name.startswith("."):
                continue
            system = system_dir.name
            for f in sorted(system_dir.iterdir()):
                if not f.is_file() or f.name.startswith("."):
                    continue
                lib_file = library_path / system / f.name
                size = (
                    lib_file.stat().st_size if lib_file.is_file() else f.stat().st_size
                )
                results.append(
                    SearchResult(
                        name=f.name,
                        size=size,
                        has_cover=False,
                        meta=parse_rom_filename(f.name),
                        system=system,
                    )
                )
    else:
        if not ADBManager.check_device_connected(device_id):
            raise HTTPException(
                status_code=404, detail=f"Device {device_id} not connected"
            )
        if library_path.exists():
            for system_dir in sorted(library_path.iterdir()):
                if not system_dir.is_dir() or system_dir.name.startswith("."):
                    continue
                system = system_dir.name
                roms_path = _device_roms_path(device_id, system)
                try:
                    files = await ADBManager.list_files(
                        roms_path, device_id, recursive=False
                    )
                    for fname in sorted(
                        f.rstrip("/") for f in files if not f.endswith("/")
                    ):
                        lib_file = library_path / system / fname
                        size = lib_file.stat().st_size if lib_file.is_file() else 0
                        results.append(
                            SearchResult(
                                name=fname,
                                size=size,
                                has_cover=False,
                                meta=parse_rom_filename(fname),
                                system=system,
                            )
                        )
                except Exception:
                    continue
    return results


COPY_CHUNK_SIZE = 1024 * 1024  # 1 MB


def _copy_with_progress(source_file: Path, dest_file: Path):
    """Sync generator: copies in 1 MB chunks, yielding SSE progress events.

    Writes to a ``.partial`` temp file first and renames on success so
    that a partial/corrupt file is never left behind after a crash or
    interruption.
    """
    total = source_file.stat().st_size
    written = 0
    partial = dest_file.with_suffix(dest_file.suffix + ".partial")
    try:
        with open(source_file, "rb") as src, open(partial, "wb") as dst:
            while True:
                chunk = src.read(COPY_CHUNK_SIZE)
                if not chunk:
                    break
                dst.write(chunk)
                written += len(chunk)
                evt = json.dumps({"bytes": written, "total": total})
                yield f"data: {evt}\n\n"
        partial.replace(dest_file)
        evt = json.dumps({"done": True, "name": dest_file.name, "size": written})
        yield f"data: {evt}\n\n"
    except OSError as e:
        with contextlib.suppress(OSError):
            partial.unlink(missing_ok=True)
        evt = json.dumps({"error": str(e)})
        yield f"data: {evt}\n\n"


class CopyGameRequest(BaseModel):
    device_id: str
    system: str
    game: str


def _estimate_transfer_size(source_file: Path, unzip: bool) -> int:
    """Estimate how many bytes will be written to the destination.

    For zip files with *unzip* enabled, returns the sum of the uncompressed
    member sizes.  Otherwise returns the source file size.
    """
    if unzip:
        try:
            with zipfile.ZipFile(source_file) as zf:
                return sum(
                    info.file_size for info in zf.infolist() if not info.is_dir()
                )
        except zipfile.BadZipFile:
            pass
    return source_file.stat().st_size


@router.post("/games/copy")
async def copy_game_to_device(req: CopyGameRequest) -> StreamingResponse:
    """Copy a single game from the library to a device, streaming SSE progress."""
    library_path = settings.get_library_path()
    source_file = library_path / req.system / req.game

    if not source_file.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"Game not found in library: {req.system}/{req.game}",
        )

    data = settings.load()
    unzip = (
        data.get("unzip_on_transfer", False) and source_file.suffix.lower() == ".zip"
    )
    sse_headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}

    if _is_volume_id(req.device_id):
        plat = get_platform()
        try:
            actual_path = plat.ensure_writable(req.device_id)
        except OSError as exc:
            raise HTTPException(status_code=403, detail=str(exc))

        dest_dir_path = _device_roms_path(actual_path, req.system)
        _validate_volume_path(actual_path, dest_dir_path)
        dest_dir = Path(dest_dir_path)
        dest_dir.mkdir(parents=True, exist_ok=True)

        # Pre-flight space check for volumes
        needed = _estimate_transfer_size(source_file, unzip)
        try:
            free = shutil.disk_usage(dest_dir).free
            if needed > free:
                raise HTTPException(
                    status_code=507,
                    detail=(
                        f"Not enough space on device: need {needed} bytes "
                        f"but only {free} bytes available"
                    ),
                )
        except OSError:
            pass  # best-effort; continue if we can't stat the device

        if not unzip:
            return StreamingResponse(
                _copy_with_progress(source_file, dest_dir / req.game),
                media_type="text/event-stream",
                headers=sse_headers,
            )

        async def _volume_unzip_stream():
            partial_files: list[tuple[Path, Path]] = []
            try:
                with tempfile.TemporaryDirectory() as tmp_dir:
                    with zipfile.ZipFile(source_file) as zf:
                        zf.extractall(tmp_dir)
                    total_size = 0
                    for extracted in sorted(Path(tmp_dir).rglob("*")):
                        if extracted.is_file():
                            rel = extracted.relative_to(tmp_dir)
                            dest = dest_dir / rel
                            partial = dest.with_suffix(dest.suffix + ".partial")
                            dest.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(extracted, partial)
                            partial_files.append((partial, dest))
                            total_size += partial.stat().st_size
                    # All files written OK — rename from .partial
                    for partial, dest in partial_files:
                        partial.replace(dest)
                evt = json.dumps(
                    {"done": True, "name": source_file.stem, "size": total_size}
                )
                yield f"data: {evt}\n\n"
            except Exception as e:
                # Clean up partial files on failure
                for partial, _dest in partial_files:
                    with contextlib.suppress(OSError):
                        partial.unlink(missing_ok=True)
                evt = json.dumps({"error": str(e)})
                yield f"data: {evt}\n\n"

        return StreamingResponse(
            _volume_unzip_stream(),
            media_type="text/event-stream",
            headers=sse_headers,
        )

    else:

        async def _adb_stream():
            if not ADBManager.check_device_connected(req.device_id):
                evt = json.dumps({"error": f"Device {req.device_id} not connected"})
                yield f"data: {evt}\n\n"
                return
            adb_dest_dir = _device_roms_path(req.device_id, req.system)

            # Pre-flight space check for ADB
            needed = _estimate_transfer_size(source_file, unzip)
            free = await ADBManager.get_free_space(adb_dest_dir, req.device_id)
            if free is not None and needed > free:
                evt = json.dumps(
                    {
                        "error": (
                            f"Not enough space on device: need {needed} bytes "
                            f"but only {free} bytes available"
                        )
                    }
                )
                yield f"data: {evt}\n\n"
                return
            if unzip:
                try:
                    with tempfile.TemporaryDirectory() as tmp_dir:
                        with zipfile.ZipFile(source_file) as zf:
                            zf.extractall(tmp_dir)
                        extracted_files = sorted(Path(tmp_dir).rglob("*"))
                        game_files = [f for f in extracted_files if f.is_file()]
                        for i, extracted in enumerate(game_files):
                            rel = extracted.relative_to(tmp_dir)
                            dest_path = f"{adb_dest_dir}/{rel}"
                            success = await ADBManager.push_file(
                                extracted, dest_path, req.device_id
                            )
                            if not success:
                                evt = json.dumps({"error": f"Failed to push {rel}"})
                                yield f"data: {evt}\n\n"
                                return
                            evt = json.dumps({"bytes": i + 1, "total": len(game_files)})
                            yield f"data: {evt}\n\n"
                    evt = json.dumps(
                        {
                            "done": True,
                            "name": source_file.stem,
                            "size": source_file.stat().st_size,
                        }
                    )
                    yield f"data: {evt}\n\n"
                except zipfile.BadZipFile as e:
                    evt = json.dumps({"error": f"Invalid zip: {e}"})
                    yield f"data: {evt}\n\n"
            else:
                dest_path = f"{adb_dest_dir}/{req.game}"
                success = await ADBManager.push_file(
                    source_file, dest_path, req.device_id
                )
                if success:
                    evt = json.dumps(
                        {
                            "done": True,
                            "name": req.game,
                            "size": source_file.stat().st_size,
                        }
                    )
                    yield f"data: {evt}\n\n"
                else:
                    evt = json.dumps({"error": f"Failed to push {req.game}"})
                    yield f"data: {evt}\n\n"

        return StreamingResponse(
            _adb_stream(), media_type="text/event-stream", headers=sse_headers
        )


@router.delete("/games")
async def remove_game_from_device(device_id: str, system: str, game: str) -> dict:
    """Remove a game from a device."""
    game_path = f"{_device_roms_path(device_id, system)}/{game}"

    if _is_volume_id(device_id):
        plat = get_platform()
        try:
            actual_path = plat.ensure_writable(device_id)
        except OSError as exc:
            raise HTTPException(status_code=403, detail=str(exc))
        actual_game_path = f"{_device_roms_path(actual_path, system)}/{game}"
        target = _validate_volume_path(actual_path, actual_game_path)
        if not target.is_file():
            raise HTTPException(
                status_code=404, detail=f"Game not found on device: {game}"
            )
        try:
            target.unlink()
        except OSError as e:
            raise HTTPException(status_code=500, detail=f"Delete failed: {e}")
        return {"status": "removed", "name": game}
    else:
        if not ADBManager.check_device_connected(device_id):
            raise HTTPException(
                status_code=404, detail=f"Device {device_id} not connected"
            )
        success = await ADBManager.delete_file(game_path, device_id)
        if not success:
            raise HTTPException(status_code=500, detail=f"Failed to delete {game}")
        return {"status": "removed", "name": game}
