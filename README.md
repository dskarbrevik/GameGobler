# GameGobler

A cross-platform ROM library manager that makes adding and removing games to microSD cards and Android devices a seamless experience — on macOS, Linux, and Windows.

## What It Does

- **Browse** your ROM library organized by system, with cover art and No-Intro metadata parsing
- **Discover** connected USB volumes and Android devices automatically
- **Transfer** games with progress tracking — drag from library, push to device
- **Sync** a curated game set to a device, adding missing and removing extra files
- **Scrape** cover art from libretro-thumbnails for your entire collection

## Architecture

```
┌─────────────────────────────┐
│   React 19 + TypeScript     │  ← web/
│   Vite · React Query        │
├─────────────────────────────┤
│   FastAPI REST + SSE        │  ← gamegobler/api/
│   Pydantic models           │
├──────────┬──────────────────┤
│ Platform │  ROM Parser      │
│ Linux    │  Cover Scraper   │  ← gamegobler/
│ macOS    │  ADB Manager     │
│ Windows  │  Settings        │
└──────────┴──────────────────┘
```

**Platform abstraction:** OS-specific volume operations (discovery, ejection, formatting) live behind a common interface in `gamegobler/platform/`, with per-OS implementations. Everything else is shared.

## Quick Start

### Prerequisites

- **Python 3.12+**
- **Node.js 18+** (for frontend development)
- **ADB** (optional, only needed for Android device support)

### Backend

```bash
# Install with uv (recommended)
uv run gamegobler-api

# Or with pip
pip install -e .
gamegobler-api
```

The API starts at `http://127.0.0.1:8000`.

### Frontend

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Configuration

On first run, visit **Settings** to set your ROM library path. GameGobler expects a directory structure like:

```
/path/to/roms/
├── Nintendo DS/
│   ├── Game1 (USA).nds
│   └── Game2 (Europe).zip
├── Game Boy Advance/
│   └── ...
├── BIOS/
│   └── bios7.bin
└── downloaded_media/
    └── Nintendo DS/
        └── covers/
            └── Game1 (USA).png
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GAMEGOBLER_HOST` | `127.0.0.1` | API bind address |
| `GAMEGOBLER_PORT` | `8000` | API port |
| `GAMEGOBLER_CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated allowed origins |

## Project Structure

```
gamegobler/             # Python backend
├── api/                # FastAPI routes
│   ├── main.py         # App entry point
│   ├── models.py       # Pydantic schemas
│   └── routers/        # devices, library, sync
├── platform/           # OS-specific backends
│   ├── base.py         # Abstract interface
│   ├── linux.py        # lsblk, udisksctl
│   ├── macos.py        # diskutil
│   └── windows.py      # PowerShell, WMI
├── settings.py         # Centralized config I/O
├── rom_parser.py       # No-Intro filename parser
├── cover_scraper.py    # libretro-thumbnails downloader
├── transfer.py         # ADB file operations
└── config.py           # Transfer config models

web/                    # React frontend
├── src/
│   ├── api/client.ts   # API communication
│   ├── hooks/useApi.ts # React Query hooks
│   ├── components/     # UI panels
│   └── types/          # TypeScript interfaces
└── ...
```

## Development

```bash
# Lint Python
uv run ruff check gamegobler/

# Lint + test frontend
cd web && npm run lint && npm test
```

## License

MIT
