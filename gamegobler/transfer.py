"""File transfer module for GameGobler - supports filesystem and ADB transfers."""

import asyncio
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

from rich.console import Console
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    TaskID,
    TextColumn,
    TimeRemainingColumn,
    TransferSpeedColumn,
)

from gamegobler.config import TransferConfig, TransferSystemConfig

console = Console()


class TransferError(Exception):
    """Custom exception for transfer errors."""

    pass


class ADBManager:
    """Manages ADB operations for Android device transfers."""

    @staticmethod
    def check_adb_available() -> bool:
        """Check if ADB is available in PATH."""
        try:
            subprocess.run(
                ["adb", "version"],
                capture_output=True,
                check=True,
                timeout=5,
            )
            return True
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            return False

    @staticmethod
    def check_device_connected(device_id: str) -> bool:
        """Check if a specific ADB device is connected."""
        try:
            result = subprocess.run(
                ["adb", "devices"],
                capture_output=True,
                check=True,
                text=True,
                timeout=10,
            )
            # Parse output to find device
            for line in result.stdout.split('\n')[1:]:  # Skip header
                if line.strip() and device_id in line and 'device' in line:
                    return True
            return False
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return False

    @staticmethod
    def get_first_device() -> Optional[str]:
        """Get the first connected ADB device ID.
        
        Returns:
            Device ID string, or None if no devices connected
        """
        try:
            result = subprocess.run(
                ["adb", "devices"],
                capture_output=True,
                check=True,
                text=True,
                timeout=10,
            )
            # Parse output to find first device
            for line in result.stdout.split('\n')[1:]:  # Skip header
                if line.strip() and 'device' in line:
                    # Line format: "DEVICE_ID   device"
                    parts = line.split()
                    if len(parts) >= 2 and parts[1] == 'device':
                        return parts[0]
            return None
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return None
    
    @staticmethod
    def get_all_devices() -> list[str]:
        """Get all connected ADB device IDs.
        
        Returns:
            List of device ID strings
        """
        try:
            result = subprocess.run(
                ["adb", "devices"],
                capture_output=True,
                check=True,
                text=True,
                timeout=10,
            )
            devices = []
            # Parse output to find all devices
            for line in result.stdout.split('\n')[1:]:  # Skip header
                if line.strip() and 'device' in line:
                    # Line format: "DEVICE_ID   device"
                    parts = line.split()
                    if len(parts) >= 2 and parts[1] == 'device':
                        devices.append(parts[0])
            return devices
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return []

    @staticmethod
    async def push_file(
        source_path: Path, dest_path: str, device_id: str
    ) -> bool:
        """Push a file to Android device via ADB.

        Args:
            source_path: Local file path
            dest_path: Destination path on Android device
            device_id: ADB device ID

        Returns:
            True if successful, False otherwise
        """
        try:
            # Ensure destination directory exists
            dest_dir = str(Path(dest_path).parent)
            mkdir_cmd = ["adb", "-s", device_id, "shell", "mkdir", "-p", dest_dir]
            mkdir_process = await asyncio.create_subprocess_exec(
                *mkdir_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            # Wait for mkdir to complete before pushing
            await mkdir_process.communicate()

            # Push the file
            push_cmd = ["adb", "-s", device_id, "push", str(source_path), dest_path]
            process = await asyncio.create_subprocess_exec(
                *push_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                console.print(
                    f"[red]ADB push failed for {source_path.name}: {stderr.decode()}[/red]"
                )
                return False

            return True

        except Exception as e:
            console.print(f"[red]Error pushing {source_path.name} via ADB: {e}[/red]")
            return False

    @staticmethod
    async def get_file_size(file_path: str, device_id: str) -> Optional[int]:
        """Get file size on Android device.

        Args:
            file_path: Path on Android device
            device_id: ADB device ID

        Returns:
            File size in bytes, or None if file doesn't exist
        """
        try:
            cmd = ["adb", "-s", device_id, "shell", "stat", "-c", "%s", file_path]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                return int(stdout.decode().strip())
            return None

        except Exception:
            return None


    @staticmethod
    async def get_free_space(path: str, device_id: str) -> Optional[int]:
        """Get free space on Android device for a given path.

        Args:
            path: Path on Android device
            device_id: ADB device ID

        Returns:
            Free space in bytes, or None if unable to determine
        """
        try:
            # Use df command to get filesystem stats
            # -k for kilobyte output, then we'll get the available column
            cmd = ["adb", "-s", device_id, "shell", "df", path]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                # Parse df output
                # Example output:
                # Filesystem     1K-blocks    Used Available Use% Mounted on
                # /data          123456789  98765432  24691357  80% /data
                lines = stdout.decode().strip().split('\n')
                if len(lines) >= 2:
                    # Get the second line (data line)
                    parts = lines[1].split()
                    if len(parts) >= 4:
                        # Available is typically the 4th column (index 3)
                        available_kb = int(parts[3])
                        return available_kb * 1024  # Convert to bytes
            return None

        except Exception:
            return None

    @staticmethod
    async def list_storage_locations(device_id: str) -> dict[str, dict]:
        """Discover available storage locations on Android device.

        Args:
            device_id: ADB device ID

        Returns:
            Dict mapping storage type to info dict with 'path', 'free', 'total' keys
            Example: {
                'internal': {'path': '/sdcard', 'free': 10000000, 'total': 64000000},
                'external': {'path': '/storage/XXXX-XXXX', 'free': 50000000, 'total': 128000000}
            }
        """
        storage_info = {}

        try:
            # Check internal storage (/sdcard is standard internal storage path)
            internal_path = "/sdcard"
            internal_free = await ADBManager.get_free_space(internal_path, device_id)
            if internal_free is not None:
                # Get total size too
                cmd = ["adb", "-s", device_id, "shell", "df", internal_path]
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, _ = await process.communicate()
                total_size = None
                if process.returncode == 0:
                    lines = stdout.decode().strip().split('\n')
                    if len(lines) >= 2:
                        parts = lines[1].split()
                        if len(parts) >= 2:
                            total_kb = int(parts[1])
                            total_size = total_kb * 1024

                storage_info['internal'] = {
                    'path': internal_path,
                    'free': internal_free,
                    'total': total_size
                }

            # Check for external storage (SD cards)
            # SD cards are typically mounted under /storage/ with UUID-like names
            cmd = ["adb", "-s", device_id, "shell", "ls", "/storage"]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await process.communicate()

            if process.returncode == 0:
                storage_dirs = stdout.decode().strip().split('\n')
                # Look for UUID-pattern directories (SD cards typically have XXXX-XXXX format)
                for storage_dir in storage_dirs:
                    storage_dir = storage_dir.strip()
                    # Skip internal storage aliases and empty lines
                    if storage_dir in ['', 'self', 'emulated'] or storage_dir.startswith('.'):
                        continue
                    # Check if it looks like an external storage UUID
                    if '-' in storage_dir or len(storage_dir) > 8:
                        ext_path = f"/storage/{storage_dir}"
                        ext_free = await ADBManager.get_free_space(ext_path, device_id)
                        if ext_free is not None:
                            # Get total size
                            cmd = ["adb", "-s", device_id, "shell", "df", ext_path]
                            process = await asyncio.create_subprocess_exec(
                                *cmd,
                                stdout=asyncio.subprocess.PIPE,
                                stderr=asyncio.subprocess.PIPE,
                            )
                            stdout, _ = await process.communicate()
                            total_size = None
                            if process.returncode == 0:
                                lines = stdout.decode().strip().split('\n')
                                if len(lines) >= 2:
                                    parts = lines[1].split()
                                    if len(parts) >= 2:
                                        total_kb = int(parts[1])
                                        total_size = total_kb * 1024

                            storage_info['external'] = {
                                'path': ext_path,
                                'free': ext_free,
                                'total': total_size
                            }
                            break  # Only take first external storage

            return storage_info

        except Exception as e:
            console.print(f"[yellow]⚠ Could not detect storage locations: {e}[/yellow]")
            return storage_info

    @staticmethod
    async def list_files(path: str, device_id: str, recursive: bool = False) -> list[str]:
        """List files on Android device at given path.

        Args:
            path: Path on Android device
            device_id: ADB device ID
            recursive: If True, list files recursively

        Returns:
            List of file paths (relative to given path)
        """
        try:
            if recursive:
                # Use find command for recursive listing
                cmd = ["adb", "-s", device_id, "shell", "find", path, "-type", "f"]
            else:
                # ls -1p appends '/' to directory names for easy detection
                cmd = ["adb", "-s", device_id, "shell", "ls", "-1p", path]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                files = []
                for line in stdout.decode().strip().split('\n'):
                    line = line.strip()
                    if line:
                        # For recursive listings, make paths relative
                        if recursive and line.startswith(path):
                            rel_path = line[len(path):].lstrip('/')
                            if rel_path:  # Skip the base directory itself
                                files.append(rel_path)
                        elif not recursive:
                            files.append(line)
                return files
            return []

        except Exception:
            return []

    @staticmethod
    async def delete_file(path: str, device_id: str) -> bool:
        """Delete a file from Android device.

        Args:
            path: Path on Android device
            device_id: ADB device ID

        Returns:
            True if successful, False otherwise
        """
        try:
            cmd = ["adb", "-s", device_id, "shell", "rm", path]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                console.print(
                    f"[red]ADB delete failed for {path}: {stderr.decode()}[/red]"
                )
                return False

            return True

        except Exception as e:
            console.print(f"[red]Error deleting {path} via ADB: {e}[/red]")
            return False


class Transferer:
    """Handles file transfers for configured systems."""

    def __init__(self, config: TransferConfig, force: bool = False):
        """Initialize transferer with configuration.

        Args:
            config: Transfer configuration
            force: If True, bypass space checks
        """
        self.config = config
        self.force = force
        self.semaphore = asyncio.Semaphore(config.concurrent_transfers)

    def _format_size(self, size_bytes: int) -> str:
        """Format size in human-readable format."""
        size_float = float(size_bytes)
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if size_float < 1024.0:
                return f"{size_float:.2f} {unit}"
            size_float /= 1024.0
        return f"{size_float:.2f} PB"

    async def _get_destination_free_space(self, system: TransferSystemConfig) -> Optional[int]:
        """Get free space at destination.

        Args:
            system: System configuration

        Returns:
            Free space in bytes, or None if unable to determine
        """
        if system.transfer_method == "filesystem":
            try:
                dest_path = Path(system.dest_dir)
                # Create directory if it doesn't exist
                dest_path.mkdir(parents=True, exist_ok=True)
                # Get filesystem stats
                stat = shutil.disk_usage(dest_path)
                return stat.free
            except Exception:
                return None
        elif system.transfer_method == "adb":
            return await ADBManager.get_free_space(system.dest_dir, system.adb_device_id)
        return None

    async def _get_expected_destination_files(self, source_path: Path, system: TransferSystemConfig) -> set[str]:
        """Get set of files that should exist at destination based on source and config.

        Args:
            source_path: Source directory
            system: System configuration

        Returns:
            Set of filenames that should be at destination
        """
        expected_files = set()
        all_files, _ = self._collect_files(source_path, system)
        
        for file_path in all_files:
            rel_path = file_path.relative_to(source_path)
            
            # If unzipping, destination file won't have .zip extension
            if system.unzip_on_transfer and file_path.suffix.lower() == '.zip':
                expected_files.add(str(rel_path.with_suffix('')))
            else:
                expected_files.add(str(rel_path))
        
        return expected_files

    async def _sync_destination(self, system: TransferSystemConfig) -> tuple[int, int]:
        """Remove files from destination that aren't in the expected set.

        Args:
            system: System configuration

        Returns:
            Tuple of (files_deleted, space_freed)
        """
        source_path = Path(system.source_dir)
        if not source_path.exists():
            console.print(f"[yellow]⚠ Source directory does not exist: {source_path}[/yellow]")
            return 0, 0

        # Get expected files from source/config
        expected_files = await self._get_expected_destination_files(source_path, system)
        
        if not expected_files:
            console.print("[yellow]⚠ No files in source match config filters[/yellow]")
            return 0, 0

        # Get actual files at destination
        actual_files = set()
        files_to_delete = []
        
        if system.transfer_method == "filesystem":
            dest_path = Path(system.dest_dir)
            if dest_path.exists():
                for file_path in dest_path.rglob('*'):
                    if file_path.is_file():
                        rel_path = file_path.relative_to(dest_path)
                        actual_files.add(str(rel_path))
                        if str(rel_path) not in expected_files:
                            files_to_delete.append(file_path)
        
        elif system.transfer_method == "adb":
            # List files on device
            device_files = await ADBManager.list_files(
                system.dest_dir, system.adb_device_id, recursive=True
            )
            for file_name in device_files:
                actual_files.add(file_name)
                if file_name not in expected_files:
                    files_to_delete.append(f"{system.dest_dir}/{file_name}")
        
        if not files_to_delete:
            console.print("[green]✓ Destination already synced (no extra files)[/green]")
            return 0, 0
        
        # Show what will be deleted
        console.print(f"\n[yellow]📋 Sync mode: {len(files_to_delete)} file(s) at destination not in source/config:[/yellow]")
        if len(files_to_delete) <= 20:
            for item in files_to_delete:
                file_name = item if isinstance(item, str) else item.name
                console.print(f"  [dim]• {file_name}[/dim]")
        else:
            for item in files_to_delete[:10]:
                file_name = item if isinstance(item, str) else item.name
                console.print(f"  [dim]• {file_name}[/dim]")
            console.print(f"  [dim]... and {len(files_to_delete) - 10} more[/dim]")
        
        if self.config.dry_run:
            console.print(f"[cyan]DRY RUN: Would delete {len(files_to_delete)} file(s)[/cyan]\n")
            return 0, 0
        
        # Delete extra files
        console.print(f"[red]Deleting {len(files_to_delete)} file(s)...[/red]")
        deleted_count = 0
        space_freed = 0
        
        if system.transfer_method == "filesystem":
            for file_path in files_to_delete:
                try:
                    file_size = file_path.stat().st_size
                    file_path.unlink()
                    deleted_count += 1
                    space_freed += file_size
                except Exception as e:
                    console.print(f"[red]Error deleting {file_path.name}: {e}[/red]")
        
        elif system.transfer_method == "adb":
            for file_path in files_to_delete:
                success = await ADBManager.delete_file(file_path, system.adb_device_id)
                if success:
                    deleted_count += 1
                    # Note: Can't easily get file size before deletion on ADB
        
        console.print(f"[green]✓ Deleted {deleted_count} file(s)[/green]")
        if deleted_count < len(files_to_delete):
            failed_count = len(files_to_delete) - deleted_count
            console.print(f"[yellow]⚠ {failed_count} file(s) could not be deleted[/yellow]")
        console.print()
        
        return deleted_count, space_freed

    async def transfer_all(self):
        """Transfer files for all configured systems."""
        if self.config.dry_run:
            console.print("\n[bold yellow]🔍 DRY RUN MODE - No files will be transferred[/bold yellow]\n")
        else:
            console.print("\n[bold cyan]Starting transfer process...[/bold cyan]\n")

        # Validate ADB if needed
        adb_systems = [s for s in self.config.systems if s.transfer_method == "adb"]
        if adb_systems:
            if not ADBManager.check_adb_available():
                raise TransferError(
                    "ADB is not available. Please install Android Platform Tools and ensure 'adb' is in your PATH."
                )
            
            # Auto-detect device IDs if not specified
            all_devices = ADBManager.get_all_devices()
            if not all_devices:
                raise TransferError(
                    "No ADB devices connected. Please connect a device and enable USB debugging."
                )
            
            # Check/assign device IDs for each system
            for system in adb_systems:
                if not system.adb_device_id:
                    # Auto-detect device
                    if len(all_devices) == 1:
                        system.adb_device_id = all_devices[0]
                        console.print(f"[cyan]Auto-detected ADB device for {system.name}: {system.adb_device_id}[/cyan]")
                    else:
                        raise TransferError(
                            f"Multiple ADB devices connected: {', '.join(all_devices)}. "
                            f"Please specify 'adb_device_id' in config for system '{system.name}'."
                        )
                else:
                    # Verify specified device is connected
                    if not ADBManager.check_device_connected(system.adb_device_id):
                        raise TransferError(
                            f"ADB device '{system.adb_device_id}' is not connected. "
                            f"Run 'adb devices' to see available devices."
                        )
            console.print("[green]✓ ADB devices verified[/green]\n")

        # Transfer each system
        total_files_to_transfer = 0
        total_files_skipped = 0
        total_files_missing = 0
        total_transfer_size = 0
        
        for system in self.config.systems:
            files_to_transfer, files_skipped, files_missing, transfer_size = await self._transfer_system(system)
            total_files_to_transfer += files_to_transfer
            total_files_skipped += files_skipped
            total_files_missing += files_missing
            total_transfer_size += transfer_size

        if self.config.dry_run:
            console.print("\n[bold yellow]📋 Dry Run Summary:[/bold yellow]")
            console.print(f"  • Files that would be transferred: {total_files_to_transfer}")
            console.print(f"  • Total transfer size: {self._format_size(total_transfer_size)}")
            console.print(f"  • Files that would be skipped (already exist): {total_files_skipped}")
            if total_files_missing > 0:
                console.print(f"  • Files not found in source: {total_files_missing}")
            console.print("\n[bold yellow]Run without --dry-run to perform actual transfer[/bold yellow]")
        else:
            console.print("\n[bold green]✓ All transfers completed![/bold green]")
            console.print(f"  • Transferred: {self._format_size(total_transfer_size)}")
            if total_files_missing > 0:
                console.print(f"[yellow]⚠ {total_files_missing} file(s) were not found in source directories[/yellow]")

    async def _transfer_system(self, system: TransferSystemConfig):
        """Transfer files for a single system.

        Args:
            system: System configuration
            
        Returns:
            Tuple of (files_transferred, files_skipped, files_missing, transfer_size_bytes)
        """
        console.print(f"[bold cyan]{'Checking' if self.config.dry_run else ('Syncing' if system.sync_mode else 'Transferring')}: {system.name}[/bold cyan]")
        console.print(f"Source: {system.source_dir}")
        console.print(f"Destination: {system.dest_dir}")
        console.print(f"Method: {system.transfer_method}")
        if system.sync_mode:
            console.print("[bold yellow]⚠ Sync mode enabled - extra files will be removed[/bold yellow]")

        source_path = Path(system.source_dir)
        if not source_path.exists():
            console.print(f"[yellow]⚠ Source directory does not exist: {source_path}[/yellow]\n")
            return 0, 0, 0, 0

        # Sync mode: remove extra files from destination
        if system.sync_mode:
            deleted_count, space_freed = await self._sync_destination(system)
            if deleted_count > 0:
                console.print(f"[green]Sync: Removed {deleted_count} extra file(s)[/green]")
                if space_freed > 0:
                    console.print(f"[green]Sync: Freed {self._format_size(space_freed)}[/green]")
                console.print()

        # Collect files to transfer
        files_to_transfer, files_to_skip, missing_files = await self._collect_files_with_status(source_path, system)

        # Calculate transfer size (accounting for unzipped files)
        transfer_size = await self._calculate_transfer_size(files_to_transfer, system)

        total_files = len(files_to_transfer) + len(files_to_skip)
        
        if total_files == 0 and len(missing_files) == 0:
            console.print(f"[yellow]No files matching filters for {system.name}[/yellow]\n")
            return 0, 0, 0, 0

        # Check destination free space
        if files_to_transfer and not self.config.dry_run:
            free_space = await self._get_destination_free_space(system)
            if free_space is not None:
                console.print(f"Destination free space: {self._format_size(free_space)}")
                console.print(f"Transfer size needed: {self._format_size(transfer_size)}")
                
                if transfer_size > free_space:
                    shortage = transfer_size - free_space
                    if self.force:
                        console.print(
                            f"[bold yellow]⚠ WARNING: Not enough space "
                            f"(need {self._format_size(shortage)} more), "
                            f"but continuing due to --force flag[/bold yellow]"
                        )
                    else:
                        console.print(
                            "[bold red]✗ ERROR: Not enough space on destination![/bold red]"
                        )
                        console.print(
                            f"[red]Need {self._format_size(transfer_size)}, "
                            f"only {self._format_size(free_space)} available "
                            f"(shortage: {self._format_size(shortage)})[/red]"
                        )
                        console.print(
                            "[yellow]Use --force to override this check and attempt transfer anyway[/yellow]\n"
                        )
                        return 0, 0, 0, 0
                else:
                    remaining = free_space - transfer_size
                    console.print(
                        f"[green]✓ Sufficient space available "
                        f"({self._format_size(remaining)} will remain after transfer)[/green]"
                    )
            else:
                console.print(
                    "[yellow]⚠ Unable to determine destination free space[/yellow]"
                )

        if self.config.dry_run:
            console.print(f"Found {len(files_to_transfer)} file(s) to transfer ({self._format_size(transfer_size)})")
            console.print(f"Found {len(files_to_skip)} file(s) already at destination (will skip)")
            if missing_files:
                console.print(f"[yellow]Missing {len(missing_files)} file(s) from source[/yellow]")
            
            # Check space in dry-run mode too
            free_space = await self._get_destination_free_space(system)
            if free_space is not None and files_to_transfer:
                console.print(f"Destination free space: {self._format_size(free_space)}")
                if transfer_size > free_space:
                    shortage = transfer_size - free_space
                    console.print(
                        f"[bold yellow]⚠ WARNING: Not enough space! "
                        f"Need {self._format_size(shortage)} more[/bold yellow]"
                    )
                else:
                    remaining = free_space - transfer_size
                    console.print(
                        f"[green]Space check: OK ({self._format_size(remaining)} will remain)[/green]"
                    )
            
            if files_to_transfer:
                # Only show file list if 20 or fewer files
                if len(files_to_transfer) <= 20:
                    console.print("\n[bold]Files that would be transferred:[/bold]")
                    for i, file_path in enumerate(files_to_transfer, 1):
                        rel_path = file_path.relative_to(source_path)
                        size = self._format_size(file_path.stat().st_size)
                        console.print(f"  {i}. {rel_path} ({size})")
                else:
                    console.print(f"\n[bold]Sample of files that would be transferred (showing 10 of {len(files_to_transfer)}):[/bold]")
                    for i, file_path in enumerate(files_to_transfer[:10], 1):
                        rel_path = file_path.relative_to(source_path)
                        size = self._format_size(file_path.stat().st_size)
                        console.print(f"  {i}. {rel_path} ({size})")
                    console.print(f"  ... and {len(files_to_transfer) - 10} more")
            console.print()
            return len(files_to_transfer), len(files_to_skip), len(missing_files), transfer_size

        if not files_to_transfer:
            if missing_files:
                console.print(f"[yellow]⚠ All specified files already exist at destination (but {len(missing_files)} were missing from source)[/yellow]\n")
            else:
                console.print("[green]✓ All files already exist at destination[/green]\n")
            return 0, len(files_to_skip), len(missing_files), 0

        skip_msg = f" (skipping {len(files_to_skip)} existing)" if files_to_skip else ""
        missing_msg = f" ({len(missing_files)} missing from source)" if missing_files else ""
        console.print(f"Transferring {len(files_to_transfer)} file(s) ({self._format_size(transfer_size)}){skip_msg}{missing_msg}\n")

        # Transfer files with progress bar
        with Progress(
            TextColumn("[bold blue]{task.description}"),
            BarColumn(),
            MofNCompleteColumn(),
            TransferSpeedColumn(),
            TimeRemainingColumn(),
            console=console,
            transient=True,
        ) as progress:
            task = progress.add_task(
                f"Transferring {system.name}...", total=len(files_to_transfer)
            )

            # Create transfer tasks
            transfer_tasks = [
                self._transfer_file(file_path, system, progress, task)
                for file_path in files_to_transfer
            ]

            # Execute transfers
            results = await asyncio.gather(*transfer_tasks, return_exceptions=True)

            # Count successes and failures
            successes = sum(1 for r in results if r is True)
            failures = len(results) - successes

            console.print(
                f"[green]✓ {successes} file(s) transferred successfully[/green]"
            )
            if failures > 0:
                console.print(f"[red]✗ {failures} file(s) failed[/red]")
            console.print()
            
        return successes, len(files_to_skip), len(missing_files), transfer_size

    def _collect_files(
        self, source_dir: Path, system: TransferSystemConfig
    ) -> tuple[list[Path], list[str]]:
        """Collect files matching the system's filters.

        Args:
            source_dir: Source directory to scan
            system: System configuration

        Returns:
            Tuple of (list of file paths to transfer, list of missing filenames)
        """
        collected_files = []
        missing_files = []

        # If specific_files is provided, use that instead of patterns
        if system.specific_files:
            for filename in system.specific_files:
                file_path = source_dir / filename
                if file_path.is_file():
                    collected_files.append(file_path)
                else:
                    console.print(f"[yellow]⚠ Specific file not found: {filename}[/yellow]")
                    missing_files.append(filename)
        else:
            # Get all files matching patterns
            for pattern in system.file_patterns:
                for file_path in source_dir.rglob(pattern):
                    if file_path.is_file():
                        # Apply include/exclude filters
                        if self._should_include_file(file_path.name, system):
                            collected_files.append(file_path)

        return sorted(collected_files), missing_files

    async def _calculate_transfer_size(
        self, files: list[Path], system: TransferSystemConfig
    ) -> int:
        """Calculate the total size that will be transferred.
        
        For files that will be unzipped during transfer, this calculates
        the uncompressed size rather than the compressed archive size.
        
        Args:
            files: List of files to transfer
            system: System configuration
            
        Returns:
            Total size in bytes that will be written to destination
        """
        total_size = 0
        
        for file_path in files:
            # If this file will be unzipped, calculate uncompressed size
            if system.unzip_on_transfer and file_path.suffix.lower() == '.zip':
                try:
                    # Get uncompressed size from zip file
                    uncompressed_size = await asyncio.to_thread(
                        self._get_zip_uncompressed_size, file_path
                    )
                    total_size += uncompressed_size
                except Exception as e:
                    # Fall back to compressed size if we can't read the zip
                    console.print(
                        f"[yellow]⚠ Could not read zip contents for {file_path.name}, "
                        f"using compressed size: {e}[/yellow]"
                    )
                    total_size += file_path.stat().st_size
            else:
                # Regular file or won't be unzipped - use actual file size
                total_size += file_path.stat().st_size
        
        return total_size
    
    @staticmethod
    def _get_zip_uncompressed_size(zip_path: Path) -> int:
        """Get the total uncompressed size of all files in a zip archive.
        
        Args:
            zip_path: Path to zip file
            
        Returns:
            Total uncompressed size in bytes
        """
        total_size = 0
        with zipfile.ZipFile(zip_path, 'r') as zf:
            for info in zf.infolist():
                # Only count files, not directories
                if not info.is_dir():
                    total_size += info.file_size
        return total_size

    async def _collect_files_with_status(
        self, source_dir: Path, system: TransferSystemConfig
    ) -> tuple[list[Path], list[Path], list[str]]:
        """Collect files and separate into those to transfer vs skip.

        Args:
            source_dir: Source directory to scan
            system: System configuration

        Returns:
            Tuple of (files_to_transfer, files_to_skip, missing_files)
        """
        all_files, missing_files = self._collect_files(source_dir, system)
        
        if not system.skip_existing:
            return all_files, [], missing_files
        
        files_to_transfer = []
        files_to_skip = []
        
        for file_path in all_files:
            rel_path = file_path.relative_to(source_dir)
            
            if system.transfer_method == "filesystem":
                # For unzipped transfers, check unzipped destination
                if system.unzip_on_transfer and file_path.suffix.lower() == '.zip':
                    # Destination will be unzipped (no .zip extension)
                    dest_file = Path(system.dest_dir) / rel_path.with_suffix('')
                    # Get uncompressed size for comparison
                    try:
                        uncompressed_size = await asyncio.to_thread(
                            self._get_zip_uncompressed_size, file_path
                        )
                        if dest_file.exists() and dest_file.stat().st_size == uncompressed_size:
                            files_to_skip.append(file_path)
                        else:
                            files_to_transfer.append(file_path)
                    except Exception:
                        # Can't read zip, assume we need to transfer
                        files_to_transfer.append(file_path)
                else:
                    # Regular file transfer - compare as-is
                    dest_file = Path(system.dest_dir) / rel_path
                    if dest_file.exists() and dest_file.stat().st_size == file_path.stat().st_size:
                        files_to_skip.append(file_path)
                    else:
                        files_to_transfer.append(file_path)
            
            elif system.transfer_method == "adb":
                # For unzipped transfers, check unzipped destination
                if system.unzip_on_transfer and file_path.suffix.lower() == '.zip':
                    # Destination will be unzipped (no .zip extension)
                    unzipped_rel_path = rel_path.with_suffix('')
                    dest_path = f"{system.dest_dir}/{str(unzipped_rel_path).replace(chr(92), '/')}"
                    # Get uncompressed size for comparison
                    try:
                        uncompressed_size = await asyncio.to_thread(
                            self._get_zip_uncompressed_size, file_path
                        )
                        existing_size = await ADBManager.get_file_size(
                            dest_path, system.adb_device_id
                        )
                        if existing_size == uncompressed_size:
                            files_to_skip.append(file_path)
                        else:
                            files_to_transfer.append(file_path)
                    except Exception:
                        # Can't read zip or check device, assume we need to transfer
                        files_to_transfer.append(file_path)
                else:
                    # Regular file transfer - compare as-is
                    dest_path = f"{system.dest_dir}/{str(rel_path).replace(chr(92), '/')}"
                    existing_size = await ADBManager.get_file_size(
                        dest_path, system.adb_device_id
                    )
                    if existing_size == file_path.stat().st_size:
                        files_to_skip.append(file_path)
                    else:
                        files_to_transfer.append(file_path)
        
        return files_to_transfer, files_to_skip, missing_files

    def _should_include_file(self, filename: str, system: TransferSystemConfig) -> bool:
        """Check if a file should be included based on filters.

        Args:
            filename: File name to check
            system: System configuration

        Returns:
            True if file should be included
        """
        # Check include filters (must match ALL)
        if system.include_filenames:
            if not all(inc in filename for inc in system.include_filenames):
                return False

        # Check exclude filters (must match NONE)
        if system.exclude_filenames:
            if any(exc in filename for exc in system.exclude_filenames):
                return False

        return True

    async def _transfer_file(
        self,
        source_file: Path,
        system: TransferSystemConfig,
        progress: Progress,
        task_id: TaskID,
    ) -> bool:
        """Transfer a single file.

        Args:
            source_file: Source file path
            system: System configuration
            progress: Progress bar
            task_id: Progress task ID

        Returns:
            True if successful, False otherwise
        """
        async with self.semaphore:
            try:
                # Check if we need to unzip
                if system.unzip_on_transfer and source_file.suffix.lower() in ['.zip', '.7z']:
                    return await self._transfer_unzipped(source_file, system, progress, task_id)
                else:
                    return await self._transfer_single_file(source_file, system, progress, task_id)
            except Exception as e:
                console.print(f"[red]Error transferring {source_file.name}: {e}[/red]")
                progress.advance(task_id)
                return False

    async def _transfer_unzipped(
        self,
        source_file: Path,
        system: TransferSystemConfig,
        progress: Progress,
        task_id: TaskID,
    ) -> bool:
        """Extract and transfer contents of a zip file.

        Args:
            source_file: Source archive file path
            system: System configuration
            progress: Progress bar
            task_id: Progress task ID

        Returns:
            True if successful, False otherwise
        """
        # Create temporary directory for extraction
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            
            try:
                # Extract archive
                if source_file.suffix.lower() == '.zip':
                    await asyncio.to_thread(self._extract_zip, source_file, temp_path)
                elif source_file.suffix.lower() == '.7z':
                    # For 7z, we'd need py7zr or subprocess call to 7z
                    console.print(f"[yellow]⚠ 7z extraction not yet implemented for {source_file.name}[/yellow]")
                    progress.advance(task_id)
                    return False
                
                # Transfer all extracted files
                extracted_files = list(temp_path.rglob('*'))
                extracted_files = [f for f in extracted_files if f.is_file()]
                
                if not extracted_files:
                    console.print(f"[yellow]⚠ No files found in {source_file.name}[/yellow]")
                    progress.advance(task_id)
                    return False
                
                # Transfer each extracted file
                success = True
                for extracted_file in extracted_files:
                    # Calculate relative path within the archive
                    rel_path = extracted_file.relative_to(temp_path)
                    
                    # Calculate destination
                    if system.transfer_method == "filesystem":
                        dest_file = Path(system.dest_dir) / rel_path
                        
                        # Check if file already exists
                        if system.skip_existing and dest_file.exists():
                            if dest_file.stat().st_size == extracted_file.stat().st_size:
                                continue
                        
                        # Create destination directory
                        dest_file.parent.mkdir(parents=True, exist_ok=True)
                        
                        # Copy file
                        await asyncio.to_thread(shutil.copy2, extracted_file, dest_file)
                        
                        # Verify if requested
                        if self.config.verify_after_transfer:
                            if dest_file.stat().st_size != extracted_file.stat().st_size:
                                console.print(f"[red]Size mismatch for {rel_path}[/red]")
                                success = False
                    
                    elif system.transfer_method == "adb":
                        # Use forward slashes for Android paths
                        dest_path = f"{system.dest_dir}/{str(rel_path).replace(chr(92), '/')}"
                        
                        # Check if file already exists
                        if system.skip_existing:
                            existing_size = await ADBManager.get_file_size(
                                dest_path, system.adb_device_id
                            )
                            if existing_size == extracted_file.stat().st_size:
                                continue
                        
                        # Push file via ADB
                        file_success = await ADBManager.push_file(
                            extracted_file, dest_path, system.adb_device_id
                        )
                        
                        if not file_success:
                            success = False
                            continue
                        
                        # Verify if requested
                        if self.config.verify_after_transfer:
                            remote_size = await ADBManager.get_file_size(
                                dest_path, system.adb_device_id
                            )
                            if remote_size != extracted_file.stat().st_size:
                                console.print(f"[red]Size mismatch for {rel_path}[/red]")
                                success = False
                
                progress.advance(task_id)
                return success
                
            except Exception as e:
                console.print(f"[red]Error extracting/transferring {source_file.name}: {e}[/red]")
                progress.advance(task_id)
                return False
            # Temporary directory is automatically cleaned up here

    def _extract_zip(self, zip_path: Path, extract_to: Path):
        """Extract a zip file to a directory.
        
        Args:
            zip_path: Path to zip file
            extract_to: Directory to extract to
        """
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_to)

    async def _transfer_single_file(
        self,
        source_file: Path,
        system: TransferSystemConfig,
        progress: Progress,
        task_id: TaskID,
    ) -> bool:
        """Transfer a single file without unzipping.

        Args:
            source_file: Source file path
            system: System configuration
            progress: Progress bar
            task_id: Progress task ID

        Returns:
            True if successful, False otherwise
        """
        try:
            # Calculate destination path
            rel_path = source_file.relative_to(Path(system.source_dir))
            
            if system.transfer_method == "filesystem":
                dest_file = Path(system.dest_dir) / rel_path
                
                # Check if file already exists
                if system.skip_existing and dest_file.exists():
                    if dest_file.stat().st_size == source_file.stat().st_size:
                        progress.advance(task_id)
                        return True
                
                # Create destination directory
                dest_file.parent.mkdir(parents=True, exist_ok=True)
                
                # Copy file
                await asyncio.to_thread(shutil.copy2, source_file, dest_file)
                
                # Verify if requested
                if self.config.verify_after_transfer:
                    if dest_file.stat().st_size != source_file.stat().st_size:
                        console.print(
                            f"[red]Size mismatch for {source_file.name}[/red]"
                        )
                        progress.advance(task_id)
                        return False
            
            elif system.transfer_method == "adb":
                # Use forward slashes for Android paths
                dest_path = f"{system.dest_dir}/{str(rel_path).replace(chr(92), '/')}"
                
                # Check if file already exists
                if system.skip_existing:
                    existing_size = await ADBManager.get_file_size(
                        dest_path, system.adb_device_id
                    )
                    if existing_size == source_file.stat().st_size:
                        progress.advance(task_id)
                        return True
                
                # Push file via ADB
                success = await ADBManager.push_file(
                    source_file, dest_path, system.adb_device_id
                )
                
                if not success:
                    progress.advance(task_id)
                    return False
                
                # Verify if requested
                if self.config.verify_after_transfer:
                    remote_size = await ADBManager.get_file_size(
                        dest_path, system.adb_device_id
                    )
                    if remote_size != source_file.stat().st_size:
                        console.print(
                            f"[red]Size mismatch for {source_file.name}[/red]"
                        )
                        progress.advance(task_id)
                        return False

            progress.advance(task_id)
            return True

        except Exception as e:
            console.print(f"[red]Error transferring {source_file.name}: {e}[/red]")
            progress.advance(task_id)
            return False
