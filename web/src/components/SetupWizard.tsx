import { useState } from "react";
import { Gamepad2, FolderOpen, ArrowRight, Loader2 } from "lucide-react";
import { useUpdateSettings } from "../hooks/useApi";

const isTauri =
  typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [libraryPath, setLibraryPath] = useState("");
  const updateMut = useUpdateSettings();

  const handleBrowse = async () => {
    if (!isTauri) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (selected) setLibraryPath(selected as string);
  };

  const handleFinish = () => {
    if (!libraryPath.trim()) return;
    updateMut.mutate(
      { library_path: libraryPath.trim() },
      { onSuccess: onComplete },
    );
  };

  return (
    <div className="setup-wizard">
      <div className="setup-card">
        <div className="setup-header">
          <Gamepad2 size={36} />
          <h1>Welcome to GameGobler</h1>
          <p className="muted">
            Let&apos;s get your ROM library set up so you can manage and sync
            games to your devices.
          </p>
        </div>

        <div className="setup-body">
          <label className="setup-label">
            <FolderOpen size={16} />
            ROM Library Path
          </label>
          <p className="setup-hint">
            Point to the folder that contains your ROM sub-folders (e.g.{" "}
            <code>nes/</code>, <code>snes/</code>, <code>nds/</code>).
          </p>
          <div className="path-input-row">
            <input
              className="settings-input"
              type="text"
              value={libraryPath}
              onChange={(e) => setLibraryPath(e.target.value)}
              placeholder="/path/to/roms"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleFinish()}
            />
            {isTauri && (
              <button
                className="btn-browse"
                type="button"
                onClick={() => void handleBrowse()}
              >
                Browse…
              </button>
            )}
          </div>
          {updateMut.isError && (
            <p className="error-msg">
              {updateMut.error instanceof Error
                ? updateMut.error.message
                : "Failed to save settings"}
            </p>
          )}
        </div>

        <div className="setup-footer">
          <button
            className="btn-primary"
            onClick={handleFinish}
            disabled={!libraryPath.trim() || updateMut.isPending}
          >
            {updateMut.isPending ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <ArrowRight size={14} />
            )}
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
