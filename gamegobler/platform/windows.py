"""Windows platform backend — uses PowerShell and WMI for volume operations."""

import os
import subprocess

from gamegobler.platform.base import (
    EjectResult,
    FormatResult,
    PlatformBackend,
    VolumeCandidate,
    VolumeInfo,
)


def _powershell(script: str, timeout: int = 30) -> subprocess.CompletedProcess:
    """Run a one-liner PowerShell script and return the result."""
    return subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        capture_output=True,
        text=True,
        timeout=timeout,
    )


class WindowsPlatform(PlatformBackend):
    """Volume operations backed by PowerShell / WMI on Windows."""

    # ── discovery ──────────────────────────────────────

    def discover_volumes(
        self,
        exclude_paths: set[str] | None = None,
    ) -> list[VolumeCandidate]:
        exclude = exclude_paths or set()
        candidates: list[VolumeCandidate] = []

        try:
            # Get removable drives via Get-Volume + Get-Partition + Get-Disk
            # DriveType 2 = Removable
            script = (
                "Get-Volume | Where-Object { $_.DriveType -eq 'Removable' -and $_.DriveLetter } | "
                "ForEach-Object { "
                "  $letter = $_.DriveLetter; $label = $_.FileSystemLabel; "
                "  $fs = $_.FileSystem; $size = $_.Size; "
                "  $model = ''; "
                "  try { "
                "    $part = Get-Partition -DriveLetter $letter -ErrorAction SilentlyContinue; "
                "    if ($part) { $disk = Get-Disk -Number $part.DiskNumber -ErrorAction SilentlyContinue; $model = $disk.FriendlyName } "
                "  } catch {} "
                '  "${letter}|${label}|${fs}|${size}|${model}" '
                "}"
            )
            result = _powershell(script, timeout=15)
            if result.returncode != 0:
                return candidates

            for line in result.stdout.strip().splitlines():
                parts = line.split("|", 4)
                if len(parts) < 5:
                    continue
                letter, label, fstype, size_str, model = parts
                mp = f"{letter}:\\"
                if mp in exclude:
                    continue
                size = int(size_str) if size_str.isdigit() else None
                candidates.append(
                    VolumeCandidate(
                        path=mp,
                        label=label or letter,
                        size=size,
                        fstype=fstype or None,
                        model=model or None,
                    )
                )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        return candidates

    # ── info ───────────────────────────────────────────

    def get_volume_info(self, mount_path: str) -> VolumeInfo:
        # mount_path on Windows is like "E:\\"
        drive_letter = mount_path.rstrip(":\\")[0] if mount_path else ""
        if not drive_letter:
            return VolumeInfo()

        try:
            script = (
                f"$v = Get-Volume -DriveLetter '{drive_letter}' -ErrorAction SilentlyContinue; "
                f'if ($v) {{ "$($v.FileSystem)|$($v.DriveLetter)" }}'
            )
            result = _powershell(script, timeout=10)
            if result.returncode == 0 and result.stdout.strip():
                parts = result.stdout.strip().split("|")
                fstype = parts[0] if parts else None
                return VolumeInfo(
                    fstype=fstype,
                    block_device=f"\\\\.\\{drive_letter}:",
                )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        return VolumeInfo()

    # ── eject ──────────────────────────────────────────

    def eject_volume(self, mount_path: str) -> EjectResult:
        drive_letter = mount_path.rstrip(":\\")[0] if mount_path else ""
        if not drive_letter.isalpha():
            return EjectResult(success=False, error=f"Invalid drive: {mount_path}")

        try:
            # Use a COM-based eject via PowerShell
            script = (
                f"$drive = (New-Object -ComObject Shell.Application)"
                f".Namespace(17).ParseName('{drive_letter}:'); "
                f"if ($drive) {{ $drive.InvokeVerb('Eject') }}"
            )
            result = _powershell(script, timeout=30)
            if result.returncode != 0:
                return EjectResult(
                    success=False,
                    error=f"Eject failed: {result.stderr.strip()}",
                )
            return EjectResult(success=True)
        except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
            return EjectResult(success=False, error=str(exc))

    # ── format ─────────────────────────────────────────

    def format_volume(
        self,
        mount_path: str,
        label: str = "EMUROMS",
        filesystem: str = "exfat",
    ) -> FormatResult:
        drive_letter = mount_path.rstrip(":\\")[0] if mount_path else ""
        if not drive_letter.isalpha():
            return FormatResult(success=False, error=f"Invalid drive: {mount_path}")

        safe_label = label[:11].strip() or "EMUROMS"
        fs_upper = filesystem.upper()

        try:
            # Format-Volume (requires admin in most cases)
            script = (
                f"Format-Volume -DriveLetter '{drive_letter}' "
                f"-FileSystem {fs_upper} -NewFileSystemLabel '{safe_label}' "
                f"-Confirm:$false -Force"
            )
            result = _powershell(script, timeout=120)
            if result.returncode != 0:
                stderr = result.stderr.strip()
                if "denied" in stderr.lower() or "privilege" in stderr.lower():
                    return FormatResult(
                        success=False,
                        error="Format requires Administrator privileges.",
                    )
                return FormatResult(success=False, error=f"Format failed: {stderr}")

            new_path = f"{drive_letter}:\\"
            return FormatResult(success=True, new_path=new_path)
        except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
            return FormatResult(success=False, error=str(exc))

    # ── writable ───────────────────────────────────────

    def ensure_writable(self, mount_path: str) -> str:
        if os.access(mount_path, os.W_OK):
            return mount_path
        raise OSError(
            f"Volume {mount_path} is not writable. "
            "Check that it is not write-protected or formatted as a read-only filesystem."
        )
