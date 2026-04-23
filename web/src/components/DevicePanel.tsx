import { useState } from "react";
import {
  Smartphone,
  HardDrive,
  WifiOff,
  Database,
  Plus,
  X,
  Power,
} from "lucide-react";
import type { DeviceInfo } from "../types";
import { formatBytes } from "../utils";
import { useToast } from "./Toast";
import {
  discoverVolumes,
  registerVolume,
  unregisterVolume,
  ejectVolume,
  type VolumeCandidate,
} from "../api/client";

interface Props {
  devices: DeviceInfo[];
  selected: string | null;
  onSelect: (id: string) => void;
  onDevicesChanged: () => void;
  isLoading: boolean;
}

export function DevicePanel({
  devices,
  selected,
  onSelect,
  onDevicesChanged,
  isLoading,
}: Props) {
  const [showDiscover, setShowDiscover] = useState(false);
  const [candidates, setCandidates] = useState<VolumeCandidate[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const { toast, confirm: confirmDialog } = useToast();

  const handleDiscover = async () => {
    setShowDiscover(true);
    setDiscovering(true);
    try {
      setCandidates(await discoverVolumes());
    } catch {
      setCandidates([]);
    } finally {
      setDiscovering(false);
    }
  };

  const handleRegister = async (c: VolumeCandidate) => {
    await registerVolume(c.path, c.label);
    setCandidates((prev) => prev.filter((v) => v.path !== c.path));
    onDevicesChanged();
  };

  const handleUnregister = async (deviceId: string) => {
    const ok = await confirmDialog({ message: "Remove this device?" });
    if (!ok) return;
    await unregisterVolume(deviceId);
    onDevicesChanged();
  };

  const handleEject = async (deviceId: string) => {
    const ok = await confirmDialog({ message: "Safely eject this device?", confirmLabel: "Eject" });
    if (!ok) return;
    try {
      await ejectVolume(deviceId);
      onDevicesChanged();
      toast("Device ejected safely", "success");
    } catch (e) {
      toast(`Eject failed: ${e instanceof Error ? e.message : e}`, "error");
    }
  };

  if (isLoading) {
    return (
      <div className="panel">
        <h2>
          <Smartphone size={18} /> Devices
        </h2>
        <p className="muted">Scanning for devices...</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h2>
          <Smartphone size={18} /> Devices
        </h2>
        <button className="btn-icon" onClick={handleDiscover} title="Add volume device">
          <Plus size={16} />
        </button>
      </div>

      {showDiscover && (
        <div className="discover-panel">
          <div className="discover-header">
            <strong>Add Volume Device</strong>
            <button className="btn-icon" onClick={() => setShowDiscover(false)}>
              <X size={14} />
            </button>
          </div>
          {discovering ? (
            <p className="muted">Scanning for volumes...</p>
          ) : candidates.length === 0 ? (
            <p className="muted">No new volumes found</p>
          ) : (
            <div className="discover-list">
              {candidates.map((c) => (
                <div key={c.path} className="discover-item">
                  <div className="discover-info">
                    <span className="discover-label">
                      <HardDrive size={14} /> {c.label || c.path}
                    </span>
                    <span className="discover-meta muted">
                      {c.path}
                      {c.fstype ? ` · ${c.fstype}` : ""}
                      {c.size ? ` · ${c.size}` : ""}
                    </span>
                  </div>
                  <button
                    className="btn-small"
                    onClick={() => void handleRegister(c)}
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {devices.length === 0 ? (
        <div className="empty-state">
          <WifiOff size={32} />
          <p>No devices connected</p>
          <p className="muted">
            Connect a device or add a volume with the + button
          </p>
        </div>
      ) : (
        <div className="device-list">
          {devices.map((device) => (
            <button
              key={device.device_id}
              className={`device-card ${selected === device.device_id ? "active" : ""}`}
              onClick={() => onSelect(device.device_id)}
            >
              <div className="device-header">
                <span className="status-dot connected" />
                {device.device_type === "volume" ? (
                  <HardDrive size={14} />
                ) : (
                  <Smartphone size={14} />
                )}
                <span className="device-id">{device.label || device.device_id}</span>
                {device.device_type === "volume" && (
                  <>
                    <button
                      type="button"
                      className="btn-remove-device"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleEject(device.device_id);
                      }}
                      title="Eject device"
                      aria-label={`Eject ${device.label || device.device_id}`}
                    >
                      <Power size={12} />
                    </button>
                    <button
                      type="button"
                      className="btn-remove-device"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleUnregister(device.device_id);
                      }}
                      title="Remove device"
                      aria-label={`Remove ${device.label || device.device_id}`}
                    >
                      <X size={12} />
                    </button>
                  </>
                )}
              </div>
              {Object.entries(device.storage).map(([type, info]) => {
                const storageKeys = Object.keys(device.storage);
                const label = type === "internal" ? "internal" : type === "sd" ? "SD card" : "volume";
                return (
                  <div key={type} className="storage-row">
                    {type === "internal" ? (
                      <Database size={12} />
                    ) : (
                      <HardDrive size={12} />
                    )}
                    {storageKeys.length > 1 && <span className="storage-label">{label}</span>}
                    {info.free != null && info.total != null ? (
                      <span className="storage-size">
                        {formatBytes(info.free)} free / {formatBytes(info.total)}
                      </span>
                    ) : (
                      <span className="storage-size muted">Unknown</span>
                    )}
                  </div>
                );
              })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
