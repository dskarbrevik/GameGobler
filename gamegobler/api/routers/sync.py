"""Sync operations API routes."""

import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, HTTPException

from gamegobler.api.models import SyncPreview, SyncPreviewItem, SyncRequest, SyncResult
from gamegobler.transfer import ADBManager

router = APIRouter()


@router.post("/preview")
async def sync_preview(req: SyncRequest) -> SyncPreview:
    """Preview what a sync operation would do without making changes."""
    if not ADBManager.check_device_connected(req.device_id):
        raise HTTPException(status_code=404, detail=f"Device {req.device_id} not connected")

    source_dir = Path(req.source_dir)
    if not source_dir.exists():
        raise HTTPException(status_code=404, detail=f"Source directory not found: {req.source_dir}")

    # Get expected files (from the request's game list)
    expected_files: dict[str, int] = {}
    for game_name in req.games:
        game_path = source_dir / game_name
        if game_path.exists():
            if req.unzip_on_transfer and game_name.lower().endswith(".zip"):
                # Use the unzipped name and approximate size
                unzipped_name = game_name.rsplit(".", 1)[0]
                try:
                    with zipfile.ZipFile(game_path) as zf:
                        expected_files[unzipped_name] = sum(i.file_size for i in zf.infolist())
                except Exception:
                    expected_files[unzipped_name] = game_path.stat().st_size
            else:
                expected_files[game_name] = game_path.stat().st_size

    # Get current files on device
    device_files = await ADBManager.list_files(req.dest_dir, req.device_id, recursive=False)
    device_file_set = set(device_files)

    to_add: list[SyncPreviewItem] = []
    to_remove: list[SyncPreviewItem] = []
    to_keep: list[SyncPreviewItem] = []

    # Files to add (in expected but not on device)
    for name, size in expected_files.items():
        if name in device_file_set:
            to_keep.append(SyncPreviewItem(name=name, action="keep", size=size))
        else:
            to_add.append(SyncPreviewItem(name=name, action="add", size=size))

    # Files to remove (on device but not in expected)
    expected_names = set(expected_files.keys())
    for name in device_files:
        if name not in expected_names:
            to_remove.append(SyncPreviewItem(name=name, action="remove", size=None))

    total_add_size = sum(item.size or 0 for item in to_add)

    return SyncPreview(
        system_name=source_dir.name,
        device_id=req.device_id,
        dest_dir=req.dest_dir,
        to_add=to_add,
        to_remove=to_remove,
        to_keep=to_keep,
        total_add_size=total_add_size,
        total_remove_count=len(to_remove),
    )


@router.post("/execute")
async def sync_execute(req: SyncRequest) -> SyncResult:
    """Execute a sync operation: remove extra files and add missing ones."""
    if not ADBManager.check_device_connected(req.device_id):
        raise HTTPException(status_code=404, detail=f"Device {req.device_id} not connected")

    source_dir = Path(req.source_dir)
    if not source_dir.exists():
        raise HTTPException(status_code=404, detail=f"Source directory not found: {req.source_dir}")

    errors: list[str] = []

    # Build expected file set
    expected_files: dict[str, Path] = {}
    for game_name in req.games:
        game_path = source_dir / game_name
        if game_path.exists():
            if req.unzip_on_transfer and game_name.lower().endswith(".zip"):
                unzipped_name = game_name.rsplit(".", 1)[0]
                expected_files[unzipped_name] = game_path
            else:
                expected_files[game_name] = game_path
        else:
            errors.append(f"Source file not found: {game_name}")

    # Get current files on device
    device_files = await ADBManager.list_files(req.dest_dir, req.device_id, recursive=False)
    device_file_set = set(device_files)
    expected_names = set(expected_files.keys())

    # Remove extra files
    removed = 0
    for name in device_files:
        if name not in expected_names:
            file_path = f"{req.dest_dir}/{name}"
            success = await ADBManager.delete_file(file_path, req.device_id)
            if success:
                removed += 1
            else:
                errors.append(f"Failed to delete: {name}")

    # Add missing files
    added = 0
    kept = 0
    for name, source_path in expected_files.items():
        if name in device_file_set:
            kept += 1
            continue

        # Transfer the file
        dest_path = f"{req.dest_dir}/{name}"

        if req.unzip_on_transfer and source_path.suffix.lower() == ".zip":
            # Extract and push
            try:
                with tempfile.TemporaryDirectory() as tmp_dir:
                    with zipfile.ZipFile(source_path) as zf:
                        zf.extractall(tmp_dir)

                    # Push extracted files
                    tmp_path = Path(tmp_dir)
                    extracted = list(tmp_path.rglob("*"))
                    for extracted_file in extracted:
                        if extracted_file.is_file():
                            rel = extracted_file.relative_to(tmp_path)
                            push_dest = f"{req.dest_dir}/{rel}"
                            success = await ADBManager.push_file(extracted_file, push_dest, req.device_id)
                            if not success:
                                errors.append(f"Failed to push: {rel}")
                    added += 1
            except Exception as e:
                errors.append(f"Failed to extract/push {source_path.name}: {e}")
        else:
            success = await ADBManager.push_file(source_path, dest_path, req.device_id)
            if success:
                added += 1
            else:
                errors.append(f"Failed to push: {source_path.name}")

    return SyncResult(added=added, removed=removed, kept=kept, errors=errors)


@router.post("/add-game")
async def add_game(device_id: str, source_path: str, dest_dir: str, unzip: bool = False) -> dict:
    """Add a single game to a device."""
    if not ADBManager.check_device_connected(device_id):
        raise HTTPException(status_code=404, detail=f"Device {device_id} not connected")

    src = Path(source_path)
    if not src.exists():
        raise HTTPException(status_code=404, detail=f"Source file not found: {source_path}")

    if unzip and src.suffix.lower() == ".zip":
        try:
            with tempfile.TemporaryDirectory() as tmp_dir:
                with zipfile.ZipFile(src) as zf:
                    zf.extractall(tmp_dir)

                tmp_path = Path(tmp_dir)
                for extracted_file in tmp_path.rglob("*"):
                    if extracted_file.is_file():
                        rel = extracted_file.relative_to(tmp_path)
                        dest_path = f"{dest_dir}/{rel}"
                        success = await ADBManager.push_file(extracted_file, dest_path, device_id)
                        if not success:
                            raise HTTPException(status_code=500, detail=f"Failed to push {rel}")

            return {"status": "added", "name": src.stem}
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid zip file")
    else:
        dest_path = f"{dest_dir}/{src.name}"
        success = await ADBManager.push_file(src, dest_path, device_id)
        if not success:
            raise HTTPException(status_code=500, detail=f"Failed to push {src.name}")

        return {"status": "added", "name": src.name}


@router.delete("/remove-game")
async def remove_game(device_id: str, file_path: str) -> dict:
    """Remove a single game from a device."""
    if not ADBManager.check_device_connected(device_id):
        raise HTTPException(status_code=404, detail=f"Device {device_id} not connected")

    success = await ADBManager.delete_file(file_path, device_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete {file_path}")

    return {"status": "removed", "path": file_path}
