"""Platform abstraction layer.

Provides a unified interface for OS-specific operations (volume discovery,
ejection, formatting) while delegating to the correct platform backend.

Usage::

    from gamegobler.platform import get_platform
    plat = get_platform()
    volumes = plat.discover_volumes(exclude_paths={"/mnt/library"})
"""

import platform as _platform

from gamegobler.platform.base import PlatformBackend, VolumeCandidate, VolumeInfo


def get_platform() -> PlatformBackend:
    """Return the correct :class:`PlatformBackend` for the running OS."""
    system = _platform.system()
    if system == "Linux":
        from gamegobler.platform.linux import LinuxPlatform

        return LinuxPlatform()
    elif system == "Darwin":
        from gamegobler.platform.macos import MacOSPlatform

        return MacOSPlatform()
    elif system == "Windows":
        from gamegobler.platform.windows import WindowsPlatform

        return WindowsPlatform()
    else:
        raise RuntimeError(f"Unsupported platform: {system}")


__all__ = [
    "get_platform",
    "PlatformBackend",
    "VolumeCandidate",
    "VolumeInfo",
]
