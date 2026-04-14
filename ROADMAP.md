# GameGobler Roadmap

> A versatile way to connect a ROM library to microSD cards or Android devices — making adding and removing games a fun, seamless experience on Mac, Linux, and Windows.

**Last updated:** 2025-07-22

---

## Current State (v0.2.0-dev)

- Single-repo prototype with working FastAPI backend + React 19 frontend
- Core features functional: ROM parsing, library browsing, cover scraping, ADB transfers, device file browsing
- **Cross-platform** volume discovery/ejection/formatting via `platform/` abstraction (Linux, macOS, Windows)
- Unified settings module with schema versioning
- API binds to 127.0.0.1 by default; CORS configurable via env var
- ADB path injection and filesystem path traversal protections in place
- 97 backend tests (rom_parser, settings, cover_scraper, API routes) + 57 frontend tests passing
- GitHub Actions CI: ruff, pyright, pytest, eslint, tsc, vitest, vite build
- Two-process startup required (backend + frontend dev server)
- Root README with architecture overview and setup instructions

### Architecture Decision: Single Repo + Platform Abstraction

All platforms share one codebase. OS-specific behavior (volume discovery, ejection, formatting) lives behind a common interface in a `platform/` module with per-OS implementations. Everything else — API routes, frontend, ROM parser, cover scraper, transfer logic — is shared.

---

## Phase 1: Foundation — Make It Work Everywhere

Goal: Cross-platform parity and security hardening. After this phase, GameGobler works correctly on macOS, Linux, and Windows.

| #   | Task                                        | Status      | Notes |
|-----|---------------------------------------------|-------------|-------|
| 1.1 | Platform abstraction module                 | Done        | `gamegobler/platform/{base,linux,macos,windows}.py` with common interface: `discover_volumes()`, `eject_volume()`, `format_volume()`, `get_volume_info()` |
| 1.2 | Linux platform implementation               | Done        | Extracted existing `lsblk`/`udisksctl` logic from `devices.py` into `platform/linux.py` |
| 1.3 | macOS platform implementation               | Done        | `diskutil` with plistlib parsing; `/Volumes/` scanning; system volume filtering |
| 1.4 | Windows platform implementation             | Done        | PowerShell `Get-Volume`; `Format-Volume`; COM `Shell.Application` for eject |
| 1.5 | Wire filesystem transfers for volumes       | Done        | `shutil.copy2` for non-ADB devices in sync.py; volume file listing via pathlib |
| 1.6 | Security hardening                          | Done        | ADB path injection validation; path traversal checks in remove-game; bind 127.0.0.1 |
| 1.7 | Unified settings module                     | Done        | `gamegobler/settings.py` — load/save/get/put API; schema version 1; migration support |
| 1.8 | Configurable CORS origins                   | Done        | `GAMEGOBLER_CORS_ORIGINS` env var; defaults include localhost variants |
| 1.9 | Clean dead code                             | Done        | Removed `App.css`, orphaned `SyncPanel.tsx`; updated tests for new component APIs |
| 1.10| Root README                                 | Done        | Architecture overview, quick start, env vars, project structure |

**Exit criteria:** GameGobler can discover, browse, eject, and transfer files to a USB volume on all three platforms. No known path traversal or injection vulnerabilities.

---

## Phase 2: Quality & CI — Make It Reliable

Goal: Automated testing, linting, and CI pipeline. Confidence that changes don't break things.

| #   | Task                                        | Status      | Notes |
|-----|---------------------------------------------|-------------|-------|
| 2.1 | Python test suite                           | Done        | 97 tests: `rom_parser` (edge cases, BIOS, multi-region), `cover_scraper` (URL gen, 404, respx mocks), `settings` (load/save/migration), API routes (TestClient) |
| 2.2 | Expand frontend tests                       | Done        | 56 tests: App, DevicePanel, LibraryPanel, SettingsPanel, Toast, consoleIcons, utils, API client |
| 2.3 | GitHub Actions CI                           | Done        | `.github/workflows/ci.yml` — push/PR: ruff, pyright, pytest, eslint, tsc, vitest, vite build |
| 2.4 | Pre-flight space check                      | Done        | Volume: `shutil.disk_usage` → HTTP 507 if insufficient; ADB: `df` → SSE error; zip-aware size estimation |
| 2.5 | Transfer resilience                         | Done        | Volume copies write to `.partial` then `rename()`; cleanup on failure; `.partial` excluded from library scanner |
| 2.6 | Settings schema migration                   | Done        | Completed in Phase 1 (1.7) — version field + migration-on-load |
| 2.7 | Error handling audit                        | Done        | Global exception handler (no stack traces in responses); settings whitelist validation; consistent HTTP status codes |

**Exit criteria:** CI passes on every PR. 97 backend + 57 frontend tests. Transfers are resilient to interruption.

---

## Phase 3: Distribution — Make It Accessible

Goal: Non-technical users can download and run GameGobler with minimal setup.

| #   | Task                                        | Status      | Notes |
|-----|---------------------------------------------|-------------|-------|
| 3.1 | Serve frontend from backend                 | Done        | `vite build` → `web/dist/`; FastAPI `StaticFiles` + catch-all SPA fallback; single-process `gamegobler-api` serves both API + UI |
| 3.2 | Single-binary packaging                     | Done        | PyInstaller spec; bundles Python + frontend + platform modules; `sys._MEIPASS` for frozen data; 18 MB arm64 binary verified |
| 3.3 | GitHub Releases workflow                    | Done        | `.github/workflows/release.yml` — `v*` tag trigger; matrix build (Linux, macOS, Windows); PyInstaller + `softprops/action-gh-release` |
| 3.4 | First-run wizard                            | Done        | `SetupWizard` component shown when `library_path` is empty; guided path selection; saves settings and transitions to main UI |
| 3.5 | In-app update check                         | Done        | `GET /api/version` compares `__version__` against latest GitHub Release; sidebar banner with link when update available; 1 h stale time |
| 3.6 | Package manager distribution                | Deferred    | Removed premature scaffolds; will revisit when submitting to Homebrew Cask, Flathub, winget-pkgs |
| 3.7 | Landing page / docs site                    | Done        | `docs/index.html` — static landing page; `.github/workflows/pages.yml` deploys to GitHub Pages on push to main |

**Exit criteria:** A retro gaming enthusiast can download a single file, run it, and manage their ROM library without touching a terminal.

---

## Phase 4: Native Desktop App — Make It a Real App

Goal: GameGobler feels like a native desktop application — not a CLI tool that opens a browser.

**Approach:** Wrap the existing React frontend + Python backend in **Tauri v2**. The React UI renders in a native OS webview window; the Python backend runs as a Tauri sidecar process. Tauri handles installers, code signing, auto-updates, and native window management.

| #   | Task                                        | Status      | Notes |
|-----|---------------------------------------------|-------------|-------|
| 4.1 | Tauri v2 project scaffolding                | Done        | `web/src-tauri/` with `tauri.conf.json`, Rust boilerplate, capabilities, icons; `@tauri-apps/cli` + `@tauri-apps/api` added to `web/package.json` |
| 4.2 | Python backend as Tauri sidecar             | Done        | `externalBin` in `tauri.conf.json`; `tauri-plugin-shell` for sidecar spawn; Rust `lib.rs` launches `gamegobler-api`, logs output, kills on window close; dev wrapper script in `binaries/` |
| 4.3 | Auto-open UI in native window               | Done        | `BackendGate` component polls `/api/health` with spinner splash; CSS splash screen in `index.css`; wired into `main.tsx` |
| 4.4 | App icons & metadata                        | Done        | Custom SVG icon with GG/controller motif; `tauri icon` generated all sizes (`.icns`, `.ico`, `.png`); bundle ID `com.github.dskarbrevik.gamegobler` |
| 4.5 | macOS `.dmg` + code signing + notarization  | Config ready | `tauri.conf.json` + release workflow configured; needs `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` secrets |
| 4.6 | Windows `.msi` installer                    | Config ready | `tauri-action` produces `.msi` via WiX; needs `WINDOWS_CERTIFICATE` + `WINDOWS_CERTIFICATE_PASSWORD` secrets |
| 4.7 | Linux `.AppImage` + `.deb`                  | Config ready | `tauri-action` produces both; release workflow configured; no signing needed |
| 4.8 | System tray integration                     | Done        | Tray icon with "Show GameGobler" / "Quit" menu; window hides on close (keeps backend alive); click tray to re-show; sidecar killed on quit |
| 4.9 | Tauri auto-updater                          | Done        | `tauri-plugin-updater` registered; background update check on startup; signing key generated; `createUpdaterArtifacts: true` in config; `.tar.gz` updater artifact verified |
| 4.10| Release workflow update                     | Done        | Two-stage workflow: `build-sidecar` (PyInstaller per-platform) → `build-tauri` (`tauri-action` produces `.dmg`, `.msi`, `.AppImage`, `.deb`); auto-creates GitHub Release |

**Exit criteria:** Users download a native installer, double-click an app icon, and get a windowed experience with no terminal or browser required. macOS builds pass Gatekeeper without warnings.

---

## Phase 5: Polish — Make It Delightful

Goal: Quality-of-life features that make GameGobler the best tool for the job.

| #   | Task                                        | Status      | Notes |
|-----|---------------------------------------------|-------------|-------|
| 5.1 | Multi-disc / CUE+BIN handling              | Not started | Detect related files (`.cue`+`.bin`, `.gdi`+`.bin`+`.raw`); transfer as a unit |
| 5.2 | `.7z` extraction support                    | Not started | `py7zr` library; handle alongside `.zip` in unzip-on-transfer |
| 5.3 | Bulk operations                             | Not started | Multi-select games, batch add/remove, select-all-filtered |
| 5.4 | Device profiles / presets                   | Not started | "Miyoo Mini Plus", "Anbernic RG35XX", "AYN Odin" — auto-configure paths, supported systems, folder structure |
| 5.5 | Drag-and-drop transfers                     | Not started | Drag game from library panel to device panel |
| 5.6 | Redump / TOSEC filename parsing             | Not started | Extend rom_parser to handle alternate naming conventions |
| 5.7 | Light theme / theme toggle                  | Not started | CSS variable swap; persist preference in settings |
| 5.8 | Playlist / collection support               | Not started | User-created game lists; sync a playlist to a device in one action |
| 5.9 | Duplicate detection                         | Not started | Identify same game across regions/revisions; suggest cleanup |
| 5.10| Transfer queue                              | Not started | Queue multiple transfers; background processing with progress dashboard |

**Exit criteria:** Power users love it; casual users find it intuitive.

---

## Backlog / Ideas

Items not yet prioritized:

- BIOS management assistant (detect missing BIOS files per system, guide user)
- Save file backup/sync between devices
- RetroAchievements integration (show completion stats per game)
- Emulator auto-configuration (generate per-system config files for popular emulators)
- Network device support (FTP/SFTP to devices like MiSTer FPGA)
- ROM verification against No-Intro/Redump DATs
- Import from existing emulator setups (ES-DE, RetroArch, Pegasus)

---

## Versioning Plan

| Version | Milestone |
|---------|-----------|
| 0.1.0   | First public release — native desktop app via Tauri with full Phase 1–4 features |
| 0.x.x   | Phase 5 — iterative feature releases (multi-disc, bulk ops, device profiles, etc.) |
| 1.0.0   | Feature-complete — all Phase 5 items done, stable API |

---

## Contributing

_To be written after Phase 1. Will include dev setup, code style, PR process, and architecture guide._
