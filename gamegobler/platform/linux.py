"""Linux platform backend — uses lsblk, udisksctl, findmnt."""

import json
import os
import subprocess
from pathlib import Path

from gamegobler.platform.base import (
    EjectResult,
    FormatResult,
    PlatformBackend,
    VolumeCandidate,
    VolumeInfo,
)


class LinuxPlatform(PlatformBackend):
    """Volume operations backed by standard Linux userspace tools."""

    # ── discovery ──────────────────────────────────────

    def discover_volumes(
        self,
        exclude_paths: set[str] | None = None,
    ) -> list[VolumeCandidate]:
        exclude = exclude_paths or set()
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
            if result.returncode != 0:
                return []
            data = json.loads(result.stdout)
            candidates: list[VolumeCandidate] = []
            for dev in data.get("blockdevices", []):
                self._collect(dev, candidates, exclude)
            return candidates
        except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError):
            return []

    def _collect(
        self,
        dev: dict,
        out: list[VolumeCandidate],
        exclude: set[str],
        parent_tran: str = "",
    ) -> None:
        tran = dev.get("tran") or parent_tran
        mp = dev.get("mountpoint")
        if mp and tran == "usb" and mp not in exclude:
            fstype = dev.get("fstype") or ""
            if fstype and fstype not in ("swap", "vfat"):
                raw_label = dev.get("label")
                label = (
                    raw_label if raw_label and raw_label != "None" else Path(mp).name
                )
                out.append(
                    VolumeCandidate(
                        path=mp,
                        label=label,
                        size=dev.get("size"),
                        fstype=fstype,
                        model=dev.get("model"),
                    )
                )
        for child in dev.get("children", []):
            self._collect(child, out, exclude, parent_tran=tran)

    # ── info ───────────────────────────────────────────

    def get_volume_info(self, mount_path: str) -> VolumeInfo:
        fstype = None
        block_device = None
        try:
            result = subprocess.run(
                ["findmnt", "-n", "-o", "FSTYPE,SOURCE", mount_path],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                parts = result.stdout.strip().split()
                if len(parts) >= 1:
                    fstype = parts[0]
                if len(parts) >= 2:
                    block_device = parts[1]
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        return VolumeInfo(fstype=fstype, block_device=block_device)

    def _resolve_block_device(self, mount_path: str) -> str:
        """Return /dev/... block device for a mount, or raise."""
        info = self.get_volume_info(mount_path)
        bd = info.block_device
        if not bd or not bd.startswith("/dev/"):
            raise RuntimeError(f"Could not determine block device for {mount_path}")
        return bd

    # ── eject ──────────────────────────────────────────

    def eject_volume(self, mount_path: str) -> EjectResult:
        try:
            block_device = self._resolve_block_device(mount_path)
        except RuntimeError as exc:
            return EjectResult(success=False, error=str(exc))

        # Flush writes
        subprocess.run(["sync"], timeout=30)

        result = subprocess.run(
            ["udisksctl", "unmount", "-b", block_device],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            return EjectResult(
                success=False,
                error=f"Unmount failed: {result.stderr.strip()}",
            )

        # Power-off is best-effort (card readers may not support it)
        subprocess.run(
            ["udisksctl", "power-off", "-b", block_device],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return EjectResult(success=True)

    # ── format ─────────────────────────────────────────

    def format_volume(
        self,
        mount_path: str,
        label: str = "EMUROMS",
        filesystem: str = "exfat",
    ) -> FormatResult:
        try:
            block_device = self._resolve_block_device(mount_path)
        except RuntimeError as exc:
            return FormatResult(success=False, error=str(exc))

        safe_label = label[:11].strip() or "EMUROMS"

        # Unmount
        result = subprocess.run(
            ["udisksctl", "unmount", "-b", block_device],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            return FormatResult(
                success=False,
                error=f"Unmount failed: {result.stderr.strip()}",
            )

        # Format
        mkfs = f"mkfs.{filesystem}"
        result = subprocess.run(
            [mkfs, "-n", safe_label, block_device],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            # Try to remount on failure
            subprocess.run(
                ["udisksctl", "mount", "-b", block_device],
                capture_output=True,
                timeout=30,
            )
            stderr = result.stderr.strip()
            if "permission" in stderr.lower() or "not permitted" in stderr.lower():
                return FormatResult(
                    success=False,
                    error=(
                        f"Format requires elevated permissions. "
                        f"Run: sudo {mkfs} -n {safe_label} {block_device}"
                    ),
                )
            return FormatResult(success=False, error=f"Format failed: {stderr}")

        # Remount
        result = subprocess.run(
            ["udisksctl", "mount", "-b", block_device],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            return FormatResult(
                success=False,
                error=f"Formatted, but remount failed: {result.stderr.strip()}",
            )

        new_path = mount_path
        stdout = result.stdout.strip()
        if " at " in stdout:
            new_path = stdout.split(" at ", 1)[1].rstrip(".")

        return FormatResult(success=True, new_path=new_path)

    # ── writable ───────────────────────────────────────

    def ensure_writable(self, mount_path: str) -> str:
        if os.access(mount_path, os.W_OK):
            return mount_path

        try:
            block_device = self._resolve_block_device(mount_path)
        except RuntimeError as exc:
            raise OSError(str(exc)) from exc

        # Unmount then remount via udisksctl (gives user ownership)
        result = subprocess.run(
            ["udisksctl", "unmount", "-b", block_device],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise OSError(f"Cannot remount for write access: {result.stderr.strip()}")

        result = subprocess.run(
            ["udisksctl", "mount", "-b", block_device],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise OSError(f"Remount failed: {result.stderr.strip()}")

        new_path = mount_path
        stdout = result.stdout.strip()
        if " at " in stdout:
            new_path = stdout.split(" at ", 1)[1].rstrip(".")
        return new_path
