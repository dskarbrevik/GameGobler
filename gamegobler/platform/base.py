"""Abstract base for platform-specific volume operations."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class VolumeCandidate:
    """A discovered removable volume that could be registered as a device."""

    path: str
    label: str
    size: int | str | None = None
    fstype: str | None = None
    model: str | None = None


@dataclass
class VolumeInfo:
    """Filesystem metadata about a mounted volume."""

    fstype: str | None = None
    block_device: str | None = None


@dataclass
class FormatResult:
    """Outcome of a format operation."""

    success: bool
    new_path: str = ""
    error: str = ""


@dataclass
class EjectResult:
    """Outcome of an eject / safe-remove operation."""

    success: bool
    error: str = ""


class PlatformBackend(ABC):
    """Interface that every OS backend must implement."""

    # ── discovery ──────────────────────────────────────

    @abstractmethod
    def discover_volumes(
        self,
        exclude_paths: set[str] | None = None,
    ) -> list[VolumeCandidate]:
        """Return removable / USB volumes currently mounted.

        Parameters
        ----------
        exclude_paths:
            Mount-paths to skip (e.g. the library drive, already-registered
            devices).
        """

    @abstractmethod
    def get_volume_info(self, mount_path: str) -> VolumeInfo:
        """Return filesystem type and block-device path for *mount_path*."""

    # ── mutation ───────────────────────────────────────

    @abstractmethod
    def eject_volume(self, mount_path: str) -> EjectResult:
        """Safely unmount (and optionally power-off) the volume.

        The volume should be safe to physically remove after a successful
        eject.
        """

    @abstractmethod
    def format_volume(
        self,
        mount_path: str,
        label: str = "EMUROMS",
        filesystem: str = "exfat",
    ) -> FormatResult:
        """Format the volume and remount it.

        Returns the (possibly changed) mount path.
        """

    @abstractmethod
    def ensure_writable(self, mount_path: str) -> str:
        """Make *mount_path* writable, remounting if necessary.

        Returns the (possibly new) mount path.
        """
