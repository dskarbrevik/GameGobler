"""Device management API routes."""

import contextlib
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from gamegobler.api.models import DeviceFile, DeviceInfo, SearchResult, StorageInfo
from gamegobler.rom_parser import parse_rom_filename
from gamegobler.transfer import ADBManager

router = APIRouter()

SETTINGS_PATH = Path.home() / ".gamegobler" / "settings.json"


def _load_settings() -> dict:
    if SETTINGS_PATH.exists():
        with open(SETTINGS_PATH) as f:
            return json.load(f)
    return {}


def _save_settings(data: dict) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_PATH, "w") as f:
        json.dump(data, f, indent=2)


def _get_registered_devices() -> list[dict]:
    """Load registered volume devices from settings."""
    return _load_settings().get("registered_devices", [])


def _volume_storage(mount_path: str) -> dict[str, StorageInfo]:
    """Get storage info for a mounted volume."""
    try:
        usage = shutil.disk_usage(mount_path)
        return {
            "volume": StorageInfo(
                path=mount_path, free=usage.free, total=usage.total
            )
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
                k: StorageInfo(
                    path=v["path"], free=v.get("free"), total=v.get("total")
                )
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
    for reg in _get_registered_devices():
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

    Returns candidates excluding the library path and already-registered paths.
    Uses lsblk on Linux, diskutil on macOS, or WMIC on Windows.
    """
    settings = _load_settings()
    library_path = settings.get("library_path", "")
    registered_paths = {d["path"] for d in settings.get("registered_devices", [])}

    candidates: list[dict] = []

    try:
        result = subprocess.run(
            [
                "lsblk",
                "-J",
                "-o",
                "NAME,SIZE,MOUNTPOINT,TRAN,RM,FSTYPE,LABEL,MODEL",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            import json as _json
            data = _json.loads(result.stdout)
            for dev in data.get("blockdevices", []):
                _collect_candidates(
                    dev, candidates, library_path, registered_paths
                )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        # lsblk not available (macOS / Windows) — fall back to scanning /mnt
        for entry in Path("/mnt").iterdir():
            mp = str(entry)
            if (
                entry.is_dir()
                and mp != library_path
                and mp not in registered_paths
            ):
                try:
                    usage = shutil.disk_usage(mp)
                    candidates.append(
                        {
                            "path": mp,
                            "label": entry.name,
                            "size": usage.total,
                            "fstype": None,
                            "model": None,
                        }
                    )
                except OSError:
                    pass

    return candidates


def _collect_candidates(
    dev: dict,
    out: list[dict],
    library_path: str,
    registered: set[str],
) -> None:
    """Recursively walk lsblk JSON tree collecting mounted USB volumes."""
    mp = dev.get("mountpoint")
    tran = dev.get("tran") or ""
    # Include USB-connected partitions that are mounted
    if mp and tran == "usb" and mp != library_path and mp not in registered:
        # Skip swap, boot, etc.
        fstype = dev.get("fstype") or ""
        if fstype and fstype not in ("swap", "vfat"):
            raw_label = dev.get("label")
            label = raw_label if raw_label and raw_label != "None" else Path(mp).name
            out.append(
                {
                    "path": mp,
                    "label": label,
                    "size": dev.get("size"),
                    "fstype": fstype,
                    "model": dev.get("model"),
                }
            )
    for child in dev.get("children", []):
        # Inherit transport type from parent
        if not child.get("tran"):
            child["tran"] = tran
        _collect_candidates(child, out, library_path, registered)


class RegisterDeviceRequest(BaseModel):
    path: str
    label: str = ""


@router.post("/volumes/register")
async def register_volume(req: RegisterDeviceRequest) -> DeviceInfo:
    """Register a mounted volume as an emulation device."""
    mount_path = req.path
    if not Path(mount_path).is_dir():
        raise HTTPException(status_code=400, detail=f"Path not found: {mount_path}")

    settings = _load_settings()
    devices = settings.get("registered_devices", [])

    # Prevent duplicates
    if any(d["path"] == mount_path for d in devices):
        raise HTTPException(status_code=409, detail="Device already registered")

    label = req.label or Path(mount_path).name
    devices.append({"path": mount_path, "label": label})
    settings["registered_devices"] = devices
    _save_settings(settings)

    return DeviceInfo(
        device_id=mount_path,
        device_type="volume",
        label=label,
        storage=_volume_storage(mount_path),
    )


@router.delete("/volumes/register")
async def unregister_volume(path: str) -> dict:
    """Remove a registered volume device."""
    settings = _load_settings()
    devices = settings.get("registered_devices", [])
    before = len(devices)
    devices = [d for d in devices if d["path"] != path]
    if len(devices) == before:
        raise HTTPException(status_code=404, detail="Device not registered")
    settings["registered_devices"] = devices
    _save_settings(settings)
    return {"status": "removed", "path": path}


@router.post("/volumes/eject")
async def eject_volume(path: str) -> dict:
    """Safely unmount and power off a volume device via udisksctl.

    Unregisters the device and makes it safe to physically remove.
    """
    registered = _get_registered_devices()
    if not any(d["path"] == path for d in registered):
        raise HTTPException(status_code=400, detail="Device not registered")

    block_device = _find_block_device(path)

    # Flush writes to disk
    subprocess.run(["sync"], timeout=30)

    # Unmount via udisksctl
    result = subprocess.run(
        ["udisksctl", "unmount", "-b", block_device],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Unmount failed: {result.stderr.strip()}",
        )

    # Power off the drive (makes it safe to pull out)
    result = subprocess.run(
        ["udisksctl", "power-off", "-b", block_device],
        capture_output=True, text=True, timeout=30,
    )
    # power-off may fail on some devices (e.g. card readers) — that's OK,
    # the unmount above is what matters for data safety

    # Unregister the device
    settings = _load_settings()
    devices = settings.get("registered_devices", [])
    devices = [d for d in devices if d["path"] != path]
    settings["registered_devices"] = devices
    _save_settings(settings)

    return {"status": "ejected", "path": path}


# ─── ADB file operations ──────────────────────────────


@router.get("/files")
async def list_device_files(device_id: str, path: str = "/sdcard") -> list[DeviceFile]:
    """List files on a device at the given path.

    For volume devices (device_id starts with /), uses native filesystem.
    For ADB devices, uses adb shell.
    """
    if device_id.startswith("/"):
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
async def list_device_files_recursive(device_id: str, path: str = "/sdcard") -> list[DeviceFile]:
    """List all files recursively."""
    if device_id.startswith("/"):
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
    if device_id.startswith("/"):
        return _delete_volume_file(device_id, file_path)

    if not ADBManager.check_device_connected(device_id):
        raise HTTPException(status_code=404, detail=f"Device {device_id} not connected")

    success = await ADBManager.delete_file(file_path, device_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete {file_path}")

    return {"status": "deleted", "path": file_path}


# ─── Volume file operations (native filesystem) ───────


def _validate_volume_path(device_id: str, file_path: str) -> Path:
    """Ensure file_path is within the device mount to prevent path traversal."""
    base = Path(device_id).resolve()
    target = Path(file_path).resolve()
    if not str(target).startswith(str(base)):
        raise HTTPException(status_code=403, detail="Access denied")
    return target


def _list_volume_files(device_id: str, path: str) -> list[DeviceFile]:
    """List files in a directory on a mounted volume."""
    target = _validate_volume_path(device_id, path)
    if not target.is_dir():
        raise HTTPException(status_code=404, detail=f"Directory not found: {path}")

    result: list[DeviceFile] = []
    try:
        for entry in sorted(target.iterdir()):
            if entry.name.startswith("."):
                continue
            result.append(
                DeviceFile(
                    name=entry.name,
                    path=str(entry),
                    is_dir=entry.is_dir(),
                )
            )
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    return result


def _list_volume_files_recursive(device_id: str, path: str) -> list[DeviceFile]:
    """Recursively list files on a mounted volume."""
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
    """Delete a file from a mounted volume."""
    target = _validate_volume_path(device_id, file_path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    target.unlink()
    return {"status": "deleted", "path": file_path}


# ─── Volume setup ──────────────────────────────────────

DEVICE_ROMS_DIR = "ROMs"
DEVICE_BIOS_DIR = "BIOS"
ADB_ROMS_BASE = "/sdcard/ROMs"

PROTECTED_MOUNTS = frozenset({
    "/", "/boot", "/boot/efi", "/home", "/var", "/usr",
    "/etc", "/opt", "/tmp", "/root",
})


def _find_block_device(mount_path: str) -> str:
    """Resolve a mount path to its underlying block device."""
    try:
        result = subprocess.run(
            ["findmnt", "-n", "-o", "SOURCE", mount_path],
            capture_output=True, text=True, timeout=5,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="findmnt not available")
    block_dev = result.stdout.strip()
    if not block_dev or not block_dev.startswith("/dev/"):
        raise HTTPException(
            status_code=400,
            detail=f"Could not determine block device for {mount_path}",
        )
    return block_dev


def _ensure_writable(mount_path: str) -> str:
    """Ensure a volume is writable by the current user.

    If not writable, attempts to remount via udisksctl (no sudo needed).
    Returns the (possibly new) mount path.
    """
    if os.access(mount_path, os.W_OK):
        return mount_path

    block_dev = _find_block_device(mount_path)

    # Unmount via udisksctl
    result = subprocess.run(
        ["udisksctl", "unmount", "-b", block_dev],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise HTTPException(
            status_code=403,
            detail=f"Cannot remount for write access: {result.stderr.strip()}",
        )

    # Remount via udisksctl — mounts with user ownership automatically
    result = subprocess.run(
        ["udisksctl", "mount", "-b", block_dev],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Remount failed: {result.stderr.strip()}",
        )

    # Parse new mount path from udisksctl output: "Mounted /dev/sde1 at /run/media/user/LABEL"
    new_path = mount_path
    stdout = result.stdout.strip()
    if " at " in stdout:
        new_path = stdout.split(" at ", 1)[1].rstrip(".")

    # Update registered device path if it changed
    if new_path != mount_path:
        settings = _load_settings()
        for d in settings.get("registered_devices", []):
            if d["path"] == mount_path:
                d["path"] = new_path
        _save_settings(settings)

    return new_path


@router.get("/volumes/status")
async def volume_status(device_id: str) -> dict:
    """Get filesystem type and initialization status of a volume."""
    mount_path = Path(device_id)
    if not mount_path.is_dir():
        raise HTTPException(status_code=404, detail="Volume not accessible")

    # Filesystem type via findmnt
    fstype = None
    try:
        result = subprocess.run(
            ["findmnt", "-n", "-o", "FSTYPE", device_id],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            fstype = result.stdout.strip() or None
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Check initialization
    roms_dir = mount_path / DEVICE_ROMS_DIR
    bios_dir = mount_path / DEVICE_BIOS_DIR

    systems_on_device: list[dict] = []
    if roms_dir.is_dir():
        for d in sorted(roms_dir.iterdir()):
            if d.is_dir() and not d.name.startswith("."):
                game_count = sum(
                    1 for f in d.iterdir()
                    if f.is_file() and not f.name.startswith(".")
                )
                systems_on_device.append({"name": d.name, "game_count": game_count})

    bios_count = 0
    if bios_dir.is_dir():
        bios_count = sum(
            1 for f in bios_dir.iterdir()
            if f.is_file() and not f.name.startswith(".")
        )

    return {
        "fstype": fstype,
        "is_initialized": roms_dir.is_dir(),
        "systems": systems_on_device,
        "bios_count": bios_count,
    }


class FormatVolumeRequest(BaseModel):
    device_id: str
    label: str = "EMUROMS"


@router.post("/volumes/format")
async def format_volume(req: FormatVolumeRequest) -> dict:
    """Format a registered volume as exFAT for Android compatibility.

    Uses udisksctl (no sudo needed) for unmount/remount.
    WARNING: This erases all data on the volume.
    """
    mount_path = req.device_id

    # Safety checks
    registered = _get_registered_devices()
    if not any(d["path"] == mount_path for d in registered):
        raise HTTPException(status_code=400, detail="Device not registered")

    settings = _load_settings()
    if mount_path == settings.get("library_path", ""):
        raise HTTPException(status_code=403, detail="Cannot format the library drive")

    if mount_path in PROTECTED_MOUNTS:
        raise HTTPException(status_code=403, detail="Cannot format a system mount")

    if not Path(mount_path).is_dir():
        raise HTTPException(status_code=400, detail=f"Mount path not accessible: {mount_path}")

    block_device = _find_block_device(mount_path)
    label = req.label[:11].strip() or "EMUROMS"

    # Step 1: Unmount via udisksctl
    result = subprocess.run(
        ["udisksctl", "unmount", "-b", block_device],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Unmount failed: {result.stderr.strip()}",
        )

    # Step 2: Format as exFAT (mkfs.exfat still needs appropriate permissions)
    result = subprocess.run(
        ["mkfs.exfat", "-n", label, block_device],
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0:
        # Try to remount on failure
        subprocess.run(
            ["udisksctl", "mount", "-b", block_device],
            capture_output=True, timeout=30,
        )
        stderr = result.stderr.strip()
        if "permission" in stderr.lower() or "not permitted" in stderr.lower():
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Format requires elevated permissions. "
                    f"Run: sudo mkfs.exfat -n {label} {block_device}"
                ),
            )
        raise HTTPException(status_code=500, detail=f"Format failed: {stderr}")

    # Step 3: Remount via udisksctl — auto-sets user ownership
    result = subprocess.run(
        ["udisksctl", "mount", "-b", block_device],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Formatted but remount failed: {result.stderr.strip()}",
        )

    # Parse new mount path from udisksctl output
    new_path = mount_path
    stdout = result.stdout.strip()
    if " at " in stdout:
        new_path = stdout.split(" at ", 1)[1].rstrip(".")

    # Update settings with new path and label
    settings = _load_settings()
    for d in settings.get("registered_devices", []):
        if d["path"] == mount_path:
            d["path"] = new_path
            d["label"] = label
    _save_settings(settings)

    return {
        "status": "formatted",
        "filesystem": "exfat",
        "label": label,
        "new_path": new_path,
    }


class InitializeVolumeRequest(BaseModel):
    device_id: str


@router.post("/volumes/initialize")
async def initialize_volume(req: InitializeVolumeRequest):
    """Create ES-DE ROM folder structure and copy BIOS files. Returns SSE progress."""
    # Ensure we can write to the volume (remounts via udisksctl if needed)
    actual_path = _ensure_writable(req.device_id)
    mount_path = Path(actual_path)
    if not mount_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Volume not accessible: {req.device_id}")

    settings = _load_settings()
    library_path = Path(settings.get("library_path", ""))
    if not library_path.is_dir():
        raise HTTPException(status_code=400, detail="Library path not configured")

    # Only create directories for systems that have game files
    non_system_dirs = {"BIOS", "downloaded_media", "media", "images"}
    systems_to_create: list[str] = []
    for d in sorted(library_path.iterdir()):
        if (
            d.is_dir()
            and not d.name.startswith(".")
            and d.name not in non_system_dirs
        ):
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
            yield f"data: {json.dumps({'step': 'folder', 'name': system_name, 'current': current, 'total': total_steps})}\n\n"

        bios_dest.mkdir(parents=True, exist_ok=True)
        copied_names: set[str] = set()
        bios_copied = 0
        for bios_file in bios_files:
            current += 1
            if bios_file.name in copied_names:
                yield f"data: {json.dumps({'step': 'bios_skip', 'name': bios_file.name, 'current': current, 'total': total_steps})}\n\n"
                continue
            copied_names.add(bios_file.name)
            dest = bios_dest / bios_file.name
            try:
                if not dest.exists():
                    shutil.copy2(bios_file, dest)
                bios_copied += 1
            except OSError as e:
                errors.append(f"{bios_file.name}: {e}")
            yield f"data: {json.dumps({'step': 'bios', 'name': bios_file.name, 'current': current, 'total': total_steps})}\n\n"

        yield f"data: {json.dumps({'step': 'done', 'systems_created': len(systems_to_create), 'bios_copied': bios_copied, 'errors': errors, 'current': total_steps, 'total': total_steps})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ─── Game management ──────────────────────────────────────


def _device_roms_path(device_id: str, system: str) -> str:
    """Get the ROM directory path on a device for a system."""
    if device_id.startswith("/"):
        return str(Path(device_id) / DEVICE_ROMS_DIR / system)
    return f"{ADB_ROMS_BASE}/{system}"


@router.get("/games")
async def list_device_games(device_id: str, system: str) -> list[str]:
    """List game filenames on a device for a given system."""
    roms_path = _device_roms_path(device_id, system)

    if device_id.startswith("/"):
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
            raise HTTPException(status_code=404, detail=f"Device {device_id} not connected")
        try:
            files = await ADBManager.list_files(roms_path, device_id, recursive=False)
            return sorted(f.rstrip("/") for f in files if not f.endswith("/"))
        except Exception:
            return []


@router.get("/games/installed")
async def list_installed_games(device_id: str) -> list[SearchResult]:
    """List all games installed on a device across all systems, with library metadata."""
    from gamegobler.api.routers.library import _get_library_path

    library_path = _get_library_path()
    results: list[SearchResult] = []

    if device_id.startswith("/"):
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
                size = lib_file.stat().st_size if lib_file.is_file() else f.stat().st_size
                results.append(SearchResult(
                    name=f.name,
                    size=size,
                    has_cover=False,
                    meta=parse_rom_filename(f.name),
                    system=system,
                ))
    else:
        if not ADBManager.check_device_connected(device_id):
            raise HTTPException(status_code=404, detail=f"Device {device_id} not connected")
        if library_path.exists():
            for system_dir in sorted(library_path.iterdir()):
                if not system_dir.is_dir() or system_dir.name.startswith("."):
                    continue
                system = system_dir.name
                roms_path = _device_roms_path(device_id, system)
                try:
                    files = await ADBManager.list_files(roms_path, device_id, recursive=False)
                    for fname in sorted(f.rstrip("/") for f in files if not f.endswith("/")):
                        lib_file = library_path / system / fname
                        size = lib_file.stat().st_size if lib_file.is_file() else 0
                        results.append(SearchResult(
                            name=fname,
                            size=size,
                            has_cover=False,
                            meta=parse_rom_filename(fname),
                            system=system,
                        ))
                except Exception:
                    continue
    return results


COPY_CHUNK_SIZE = 1024 * 1024  # 1 MB


def _copy_with_progress(source_file: Path, dest_file: Path):
    """Sync generator: copies in 1 MB chunks, yielding SSE progress events."""
    total = source_file.stat().st_size
    written = 0
    try:
        with open(source_file, "rb") as src, open(dest_file, "wb") as dst:
            while True:
                chunk = src.read(COPY_CHUNK_SIZE)
                if not chunk:
                    break
                dst.write(chunk)
                written += len(chunk)
                yield f"data: {json.dumps({'bytes': written, 'total': total})}\n\n"
        yield f"data: {json.dumps({'done': True, 'name': dest_file.name, 'size': written})}\n\n"
    except OSError as e:
        with contextlib.suppress(OSError):
            dest_file.unlink(missing_ok=True)
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


class CopyGameRequest(BaseModel):
    device_id: str
    system: str
    game: str


@router.post("/games/copy")
async def copy_game_to_device(req: CopyGameRequest) -> StreamingResponse:
    """Copy a single game from the library to a device, streaming SSE progress."""
    settings = _load_settings()
    library_path = Path(settings.get("library_path", ""))
    source_file = library_path / req.system / req.game

    if not source_file.is_file():
        raise HTTPException(
            status_code=404, detail=f"Game not found in library: {req.system}/{req.game}"
        )

    unzip = settings.get("unzip_on_transfer", False) and source_file.suffix.lower() == ".zip"
    sse_headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}

    if req.device_id.startswith("/"):
        actual_path = _ensure_writable(req.device_id)
        dest_dir_path = _device_roms_path(actual_path, req.system)
        _validate_volume_path(actual_path, dest_dir_path)
        dest_dir = Path(dest_dir_path)
        dest_dir.mkdir(parents=True, exist_ok=True)

        if not unzip:
            # Chunked copy with per-chunk progress events
            return StreamingResponse(
                _copy_with_progress(source_file, dest_dir / req.game),
                media_type="text/event-stream",
                headers=sse_headers,
            )

        async def _volume_unzip_stream():
            try:
                with tempfile.TemporaryDirectory() as tmp_dir:
                    with zipfile.ZipFile(source_file) as zf:
                        zf.extractall(tmp_dir)
                    total_size = 0
                    for extracted in sorted(Path(tmp_dir).rglob("*")):
                        if extracted.is_file():
                            rel = extracted.relative_to(tmp_dir)
                            dest = dest_dir / rel
                            dest.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(extracted, dest)
                            total_size += dest.stat().st_size
                yield f"data: {json.dumps({'done': True, 'name': source_file.stem, 'size': total_size})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return StreamingResponse(_volume_unzip_stream(), media_type="text/event-stream", headers=sse_headers)

    else:
        async def _adb_stream():
            if not ADBManager.check_device_connected(req.device_id):
                yield f"data: {json.dumps({'error': f'Device {req.device_id} not connected'})}\n\n"
                return
            adb_dest_dir = _device_roms_path(req.device_id, req.system)
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
                            success = await ADBManager.push_file(extracted, dest_path, req.device_id)
                            if not success:
                                yield f"data: {json.dumps({'error': f'Failed to push {rel}'})}\n\n"
                                return
                            yield f"data: {json.dumps({'bytes': i + 1, 'total': len(game_files)})}\n\n"
                    yield f"data: {json.dumps({'done': True, 'name': source_file.stem, 'size': source_file.stat().st_size})}\n\n"
                except zipfile.BadZipFile as e:
                    yield f"data: {json.dumps({'error': f'Invalid zip: {e}'})}\n\n"
            else:
                dest_path = f"{adb_dest_dir}/{req.game}"
                success = await ADBManager.push_file(source_file, dest_path, req.device_id)
                if success:
                    yield f"data: {json.dumps({'done': True, 'name': req.game, 'size': source_file.stat().st_size})}\n\n"
                else:
                    yield f"data: {json.dumps({'error': f'Failed to push {req.game}'})}\n\n"

        return StreamingResponse(_adb_stream(), media_type="text/event-stream", headers=sse_headers)


@router.delete("/games")
async def remove_game_from_device(device_id: str, system: str, game: str) -> dict:
    """Remove a game from a device."""
    game_path = f"{_device_roms_path(device_id, system)}/{game}"

    if device_id.startswith("/"):
        actual_path = _ensure_writable(device_id)
        actual_game_path = f"{_device_roms_path(actual_path, system)}/{game}"
        target = _validate_volume_path(actual_path, actual_game_path)
        if not target.is_file():
            raise HTTPException(status_code=404, detail=f"Game not found on device: {game}")
        try:
            target.unlink()
        except OSError as e:
            raise HTTPException(status_code=500, detail=f"Delete failed: {e}")
        return {"status": "removed", "name": game}
    else:
        if not ADBManager.check_device_connected(device_id):
            raise HTTPException(status_code=404, detail=f"Device {device_id} not connected")
        success = await ADBManager.delete_file(game_path, device_id)
        if not success:
            raise HTTPException(status_code=500, detail=f"Failed to delete {game}")
        return {"status": "removed", "name": game}
