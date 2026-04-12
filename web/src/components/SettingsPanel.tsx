import { useState } from "react";
import { Settings2, Save, Loader2 } from "lucide-react";
import { useSettings, useUpdateSettings } from "../hooks/useApi";

export function SettingsPanel() {
  const { data: settings, isLoading } = useSettings();
  const updateMut = useUpdateSettings();

  if (isLoading) {
    return (
      <div className="panel">
        <h2>
          <Settings2 size={18} /> Settings
        </h2>
        <p className="muted">Loading settings...</p>
      </div>
    );
  }

  return (
    <SettingsForm
      key={settings?.library_path ?? ""}
      initialLibraryPath={settings?.library_path ?? ""}
      initialUnzipOnTransfer={settings?.unzip_on_transfer ?? false}
      updateMut={updateMut}
    />
  );
}

function SettingsForm({
  initialLibraryPath,
  initialUnzipOnTransfer,
  updateMut,
}: {
  initialLibraryPath: string;
  initialUnzipOnTransfer: boolean;
  updateMut: ReturnType<typeof useUpdateSettings>;
}) {
  const [libraryPath, setLibraryPath] = useState(initialLibraryPath);
  const [unzipOnTransfer, setUnzipOnTransfer] = useState(initialUnzipOnTransfer);

  const handleSave = () => {
    updateMut.mutate({ library_path: libraryPath || undefined, unzip_on_transfer: unzipOnTransfer });
  };

  return (
    <div className="panel">
      <h2>
        <Settings2 size={18} /> Settings
      </h2>

      <div className="settings-layout">
        <section className="settings-section">
          <h3 className="settings-section-title">General</h3>
          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-label">ROM Library Path</span>
              <span className="settings-row-desc">Local directory containing ROM folders (nes/, snes/, nds/, etc.)</span>
            </div>
            <input
              className="settings-input"
              type="text"
              value={libraryPath}
              onChange={(e) => setLibraryPath(e.target.value)}
              placeholder="/path/to/roms"
            />
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Transfer</h3>
          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-label">Unzip games on transfer</span>
              <span className="settings-row-desc">Automatically extract .zip files when copying games to a device</span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={unzipOnTransfer}
                onChange={(e) => setUnzipOnTransfer(e.target.checked)}
              />
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
            </label>
          </div>
        </section>

        <div className="settings-footer">
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={updateMut.isPending}
          >
            {updateMut.isPending ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            Save Settings
          </button>
          {updateMut.isSuccess && (
            <span className="success-msg">Saved to ~/.gamegobler/</span>
          )}
        </div>
      </div>
    </div>
  );
}
