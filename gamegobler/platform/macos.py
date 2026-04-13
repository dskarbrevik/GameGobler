"""macOS platform backend — uses diskutil and standard mount points."""

import os
import plistlib
import subprocess
from pathlib import Path

from gamegobler.platform.base import (
    EjectResult,
    FormatResult,
    PlatformBackend,
    VolumeCandidate,
    VolumeInfo,
)

# Volumes mounted here by macOS; skip built-in system volumes.
_VOLUMES_ROOT = Path("/Volumes")
_SKIP_LABELS = frozenset({"Macintosh HD", "Macintosh HD - Data", "Recovery"})


class MacOSPlatform(PlatformBackend):
    """Volume operations backed by macOS ``diskutil``."""

    # ── discovery ──────────────────────────────────────

    def discover_volumes(
        self,
        exclude_paths: set[str] | None = None,
    ) -> list[VolumeCandidate]:
        exclude = exclude_paths or set()
        candidates: list[VolumeCandidate] = []

        if not _VOLUMES_ROOT.is_dir():
            return candidates

        for entry in _VOLUMES_ROOT.iterdir():
            mp = str(entry)
            if (
                not entry.is_dir()
                or entry.name.startswith(".")
                or entry.name in _SKIP_LABELS
                or mp in exclude
            ):
                continue

            info = self._diskutil_info(mp)
            if not info:
                continue

            # Only include removable / external media
            if not info.get("removable", False) and not info.get("external", False):
                continue

            candidates.append(
                VolumeCandidate(
                    path=mp,
                    label=info.get("label", entry.name),
                    size=info.get("total_size"),
                    fstype=info.get("fstype"),
                    model=info.get("media_name"),
                )
            )

        return candidates

    # ── info ───────────────────────────────────────────

    def get_volume_info(self, mount_path: str) -> VolumeInfo:
        info = self._diskutil_info(mount_path)
        if not info:
            return VolumeInfo()
        return VolumeInfo(
            fstype=info.get("fstype"),
            block_device=info.get("device_node"),
        )

    # ── eject ──────────────────────────────────────────

    def eject_volume(self, mount_path: str) -> EjectResult:
        info = self._diskutil_info(mount_path)
        if not info or not info.get("device_node"):
            return EjectResult(success=False, error="Cannot find disk for volume")

        device_node = info["device_node"]
        result = subprocess.run(
            ["diskutil", "eject", device_node],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            return EjectResult(
                success=False,
                error=f"Eject failed: {result.stderr.strip()}",
            )
        return EjectResult(success=True)

    # ── format ─────────────────────────────────────────

    def format_volume(
        self,
        mount_path: str,
        label: str = "EMUROMS",
        filesystem: str = "exfat",
    ) -> FormatResult:
        info = self._diskutil_info(mount_path)
        if not info or not info.get("device_node"):
            return FormatResult(success=False, error="Cannot find disk for volume")

        device_node = info["device_node"]
        safe_label = label[:11].strip() or "EMUROMS"

        # Map generic filesystem name to diskutil format identifiers
        fs_map = {"exfat": "ExFAT", "fat32": "FAT32", "apfs": "APFS"}
        fs_id = fs_map.get(filesystem.lower(), "ExFAT")

        result = subprocess.run(
            ["diskutil", "eraseDisk", fs_id, safe_label, device_node],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            stderr = result.stderr.strip()
            if "permission" in stderr.lower():
                return FormatResult(
                    success=False,
                    error=(
                        f"Format requires elevated permissions. "
                        f"Run: sudo diskutil eraseDisk {fs_id} {safe_label} {device_node}"
                    ),
                )
            return FormatResult(success=False, error=f"Format failed: {stderr}")

        # diskutil re-mounts automatically; find the new path
        new_path = f"/Volumes/{safe_label}"
        if not Path(new_path).is_dir():
            new_path = mount_path

        return FormatResult(success=True, new_path=new_path)

    # ── writable ───────────────────────────────────────

    def ensure_writable(self, mount_path: str) -> str:
        # macOS volumes mounted via Finder are typically writable already
        if os.access(mount_path, os.W_OK):
            return mount_path
        raise OSError(
            f"Volume {mount_path} is not writable. "
            "It may be formatted as a read-only filesystem (NTFS, APFS snapshot)."
        )

    # ── private helpers ────────────────────────────────

    @staticmethod
    def _diskutil_info(mount_path: str) -> dict | None:
        """Run ``diskutil info -plist <path>`` and return a simplified dict."""
        try:
            result = subprocess.run(
                ["diskutil", "info", "-plist", mount_path],
                capture_output=True,
                timeout=10,
            )
            if result.returncode != 0:
                return None
            plist = plistlib.loads(result.stdout)
            return {
                "device_node": plist.get("DeviceNode"),
                "fstype": plist.get("FilesystemType"),
                "label": plist.get("VolumeName") or Path(mount_path).name,
                "total_size": plist.get("TotalSize"),
                "removable": plist.get("Removable", False)
                or plist.get("RemovableMedia", False),
                "external": plist.get("Internal") is False,
                "media_name": plist.get("MediaName"),
            }
        except (
            FileNotFoundError,
            subprocess.TimeoutExpired,
            plistlib.InvalidFileException,
        ):
            return None

    @staticmethod
    def _diskutil_list_plist() -> dict:
        """Run ``diskutil list -plist`` for top-level disk enumeration."""
        try:
            result = subprocess.run(
                ["diskutil", "list", "-plist"],
                capture_output=True,
                timeout=10,
            )
            if result.returncode == 0:
                return plistlib.loads(result.stdout)
        except (
            FileNotFoundError,
            subprocess.TimeoutExpired,
            plistlib.InvalidFileException,
        ):
            pass
        return {}
