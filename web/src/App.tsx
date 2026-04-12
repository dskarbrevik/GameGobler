import { useEffect, useState } from "react";
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import {
  Smartphone,
  Gamepad2,
  Settings2,
} from "lucide-react";
import { DevicePanel } from "./components/DevicePanel";
import { LibraryPanel } from "./components/LibraryPanel";
import { DeviceFilesPanel } from "./components/DeviceFilesPanel";
import { GameManagerPanel } from "./components/GameManagerPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { useToast } from "./components/Toast";
import { useDevices, useSystems } from "./hooks/useApi";
import { useQueryClient } from "@tanstack/react-query";
import { formatVolume } from "./api/client";
import type { InitializeEvent } from "./types";

const NAV = [
  { to: "/devices", label: "Devices", icon: Smartphone },
  { to: "/library", label: "Library", icon: Gamepad2 },
  { to: "/settings", label: "Settings", icon: Settings2 },
];

function DevicesPage() {
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"files" | "games">("files");
  const [formatting, setFormatting] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [initProgress, setInitProgress] = useState<InitializeEvent | null>(null);
  const { data: devices = [], isLoading } = useDevices();
  const queryClient = useQueryClient();
  const { toast, confirm } = useToast();

  // Clear stale selection when device is no longer in the list (e.g. remounted at different path)
  useEffect(() => {
    if (selectedDevice && devices.length > 0 && !devices.some((d) => d.device_id === selectedDevice)) {
      setSelectedDevice(null);
    }
  }, [selectedDevice, devices]);

  const selectedInfo = devices.find((d) => d.device_id === selectedDevice);
  const isVolume = selectedInfo?.device_type === "volume";

  const handleFormat = async () => {
    if (!selectedDevice || !selectedInfo) return;
    const label = prompt("Volume label (max 11 chars):", "EMUROMS");
    if (!label) return;
    const ok = await confirm({
      message: `⚠️ FORMAT will ERASE ALL DATA on "${selectedInfo.label}". Continue?`,
      confirmLabel: "Format",
      danger: true,
    });
    if (!ok) return;
    setFormatting(true);
    try {
      const result = await formatVolume(selectedDevice, label);
      if (result.new_path && result.new_path !== selectedDevice) {
        setSelectedDevice(result.new_path);
      }
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      void queryClient.invalidateQueries({ queryKey: ["volumeStatus"] });
      toast("Volume formatted successfully", "success");
    } catch (e) {
      toast(`Format failed: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setFormatting(false);
    }
  };

  const handleInitialize = async () => {
    if (!selectedDevice || !selectedInfo) return;
    const ok = await confirm({
      message: `Initialize "${selectedInfo.label}" with ES-DE folders and BIOS files?`,
      confirmLabel: "Initialize",
    });
    if (!ok) return;
    setInitializing(true);
    setInitProgress(null);
    try {
      const res = await fetch("/api/devices/volumes/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: selectedDevice }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const event = JSON.parse(line.slice(6)) as InitializeEvent;
            setInitProgress(event);
          }
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      void queryClient.invalidateQueries({ queryKey: ["volumeStatus"] });
      void queryClient.invalidateQueries({ queryKey: ["deviceGames"] });
      toast("Device initialized successfully", "success");
    } catch (e) {
      toast(`Initialize failed: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setInitializing(false);
    }
  };

  return (
    <div className="devices-layout">
      <DevicePanel
        devices={devices}
        selected={selectedDevice}
        onSelect={setSelectedDevice}
        onDevicesChanged={() => void queryClient.invalidateQueries({ queryKey: ["devices"] })}
        isLoading={isLoading}
      />
      <div className="device-content-area">
        {selectedDevice && (
          <div className="device-actions-bar">
            <div className="view-toggle">
              <button
                className={`toggle-btn ${viewMode === "files" ? "active" : ""}`}
                onClick={() => setViewMode("files")}
              >
                Files
              </button>
              <button
                className={`toggle-btn ${viewMode === "games" ? "active" : ""}`}
                onClick={() => setViewMode("games")}
              >
                Games
              </button>
            </div>
            {isVolume && (
              <div className="volume-actions">
                <button
                  className="btn-small"
                  onClick={() => void handleFormat()}
                  disabled={formatting}
                >
                  {formatting ? "Formatting..." : "Format exFAT"}
                </button>
                <button
                  className="btn-small"
                  onClick={() => void handleInitialize()}
                  disabled={initializing}
                >
                  {initializing ? "Initializing..." : "Initialize ES-DE"}
                </button>
              </div>
            )}
          </div>
        )}

        {initializing && initProgress && (
          <div className="init-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(initProgress.current / Math.max(initProgress.total, 1)) * 100}%` }}
              />
            </div>
            <span className="muted">
              {initProgress.step === "done"
                ? `Done! ${initProgress.systems_created} folders, ${initProgress.bios_copied} BIOS files`
                : `${initProgress.name} (${initProgress.current}/${initProgress.total})`}
            </span>
          </div>
        )}

        {viewMode === "files" ? (
          <DeviceFilesPanel
            deviceId={selectedDevice}
            deviceType={selectedInfo?.device_type}
          />
        ) : (
          <GameManagerPanel
            deviceId={selectedDevice}
            deviceType={selectedInfo?.device_type}
          />
        )}
      </div>
    </div>
  );
}

function LibraryPage() {
  const { data: systems = [], isLoading } = useSystems();
  return <LibraryPanel systems={systems} isLoading={isLoading} />;
}

function App() {
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <Gamepad2 size={24} />
          <span>GameGobler</span>
        </div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/devices" replace />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/library/:system" element={<LibraryPage />} />
          <Route path="/settings" element={<SettingsPanel />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
