# Package Manager Distribution

GameGobler provides manifests for three package managers. After each release, update the manifests and submit to the respective repositories.

## Updating Manifests

After publishing a GitHub release, run the update script to fill in SHA256 hashes:

```bash
./packaging/update-manifests.sh 0.1.0   # replace with the released version
```

This downloads the release binaries, computes SHA256 checksums, and patches all manifest files in-place.

---

## Homebrew (macOS & Linux)

The formula is in `homebrew/gamegobler.rb`. To distribute it, create a tap repository:

1. Create a new repo named `homebrew-gamegobler` on GitHub
2. Copy the formula: `cp packaging/homebrew/gamegobler.rb <tap-repo>/Formula/gamegobler.rb`
3. Push the tap repo

Users install with:

```bash
brew tap dskarbrevik/gamegobler
brew install gamegobler
```

## Flatpak (Linux)

Files in `flatpak/` are ready for [Flathub](https://github.com/flathub/flathub/wiki/App-Submission) submission:

- `com.github.dskarbrevik.GameGobler.yml` — build manifest
- `com.github.dskarbrevik.GameGobler.desktop` — desktop entry
- `com.github.dskarbrevik.GameGobler.metainfo.xml` — AppStream metadata

To submit, fork `flathub/flathub`, add a new repo request, and provide these files.

Users install with:

```bash
flatpak install flathub com.github.dskarbrevik.GameGobler
```

## winget (Windows)

Files in `winget/` follow the [winget manifest v1.6 schema](https://github.com/microsoft/winget-pkgs):

- `dskarbrevik.GameGobler.yaml` — version manifest
- `dskarbrevik.GameGobler.installer.yaml` — installer manifest
- `dskarbrevik.GameGobler.locale.en-US.yaml` — locale manifest

To submit, fork `microsoft/winget-pkgs` and create a PR adding these files under:

```
manifests/d/dskarbrevik/GameGobler/0.1.0/
```

Users install with:

```bash
winget install dskarbrevik.GameGobler
```
