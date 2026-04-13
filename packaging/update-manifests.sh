#!/usr/bin/env bash
# Update all package-manager manifests with SHA256 hashes from a GitHub release.
#
# Usage:
#   ./packaging/update-manifests.sh 0.1.0
#
# Prerequisites: curl, shasum (or sha256sum)
set -euo pipefail

VERSION="${1:?Usage: $0 <version>  (e.g. 0.1.0)}"
TAG="v${VERSION}"
BASE_URL="https://github.com/dskarbrevik/GameGobler/releases/download/${TAG}"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading release binaries for ${TAG} ..."

for asset in GameGobler-macos GameGobler-linux GameGobler-windows.exe; do
    echo "  ${asset}"
    curl -fSL --retry 3 -o "${TMPDIR}/${asset}" "${BASE_URL}/${asset}"
done

sha_cmd() {
    if command -v sha256sum &>/dev/null; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

SHA_MACOS="$(sha_cmd "${TMPDIR}/GameGobler-macos")"
SHA_LINUX="$(sha_cmd "${TMPDIR}/GameGobler-linux")"
SHA_WINDOWS="$(sha_cmd "${TMPDIR}/GameGobler-windows.exe")"

echo ""
echo "SHA256 hashes:"
echo "  macOS:   ${SHA_MACOS}"
echo "  Linux:   ${SHA_LINUX}"
echo "  Windows: ${SHA_WINDOWS}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Homebrew formula ─────────────────────────────────────────────────────
BREW="${SCRIPT_DIR}/homebrew/gamegobler.rb"
if [[ -f "$BREW" ]]; then
    sed -i'' -e "s|releases/download/v[^/]*/|releases/download/${TAG}/|g" "$BREW"
    # Replace any SHA256 value (placeholder or real) on the macOS block
    # The formula has on_macos / on_linux blocks; update both
    # Use awk for multi-line awareness
    python3 -c "
import re, sys
text = open('${BREW}').read()
text = re.sub(r'version \"[^\"]+\"', 'version \"${VERSION}\"', text)
# Replace sha256 after macos url
parts = text.split('on_macos do')
if len(parts) == 2:
    before_linux = parts[1].split('on_linux do')
    parts[1] = re.sub(r'sha256 \"[^\"]+\"', 'sha256 \"${SHA_MACOS}\"', before_linux[0]) + 'on_linux do' + re.sub(r'sha256 \"[^\"]+\"', 'sha256 \"${SHA_LINUX}\"', before_linux[1])
    text = 'on_macos do'.join(parts)
open('${BREW}', 'w').write(text)
"
    echo "✓ Updated ${BREW}"
fi

# ── Flatpak manifest ────────────────────────────────────────────────────
FLATPAK="${SCRIPT_DIR}/flatpak/com.github.dskarbrevik.GameGobler.yml"
if [[ -f "$FLATPAK" ]]; then
    sed -i'' -e "s|releases/download/v[^/]*/|releases/download/${TAG}/|g" "$FLATPAK"
    sed -i'' -e "s/sha256: .*/sha256: ${SHA_LINUX}/" "$FLATPAK"
    # Clean up macOS sed backup files
    rm -f "${FLATPAK}-e"
    echo "✓ Updated ${FLATPAK}"
fi

METAINFO="${SCRIPT_DIR}/flatpak/com.github.dskarbrevik.GameGobler.metainfo.xml"
if [[ -f "$METAINFO" ]]; then
    sed -i'' -e "s|version=\"[^\"]*\"|version=\"${VERSION}\"|" "$METAINFO"
    rm -f "${METAINFO}-e"
    echo "✓ Updated ${METAINFO}"
fi

# ── winget manifests ─────────────────────────────────────────────────────
for f in "${SCRIPT_DIR}"/winget/*.yaml; do
    if [[ -f "$f" ]]; then
        sed -i'' -e "s/^PackageVersion: .*/PackageVersion: ${VERSION}/" "$f"
        sed -i'' -e "s|releases/download/v[^/]*/|releases/download/${TAG}/|g" "$f"
        sed -i'' -e "s/InstallerSha256: .*/InstallerSha256: ${SHA_WINDOWS}/" "$f"
        rm -f "${f}-e"
    fi
done
echo "✓ Updated winget manifests"

# Clean up macOS sed backup files
rm -f "${BREW}-e"

echo ""
echo "Done. Review changes with: git diff packaging/"
