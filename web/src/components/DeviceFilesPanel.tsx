import { useState, useEffect } from "react";
import {
  MonitorSmartphone,
  Trash2,
  RefreshCw,
  FolderOpen,
  FileText,
  ChevronUp,
} from "lucide-react";
import type { DeviceFile } from "../types";
import { useDeviceFiles, useRemoveGame } from "../hooks/useApi";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "./Toast";

interface Props {
  deviceId: string | null;
  deviceType?: "android" | "volume";
}

export function DeviceFilesPanel({ deviceId, deviceType = "android" }: Props) {
  const rootPath = deviceType === "volume" && deviceId ? deviceId : "/sdcard";
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const { confirm: confirmDialog } = useToast();

  // Reset path when device changes
  useEffect(() => {
    setCurrentPath(rootPath);
    setPathHistory([]);
  }, [deviceId, rootPath]);
  const queryClient = useQueryClient();
  const {
    data: files = [],
    isLoading,
    refetch,
  } = useDeviceFiles(deviceId, currentPath);
  const removeMut = useRemoveGame();

  if (!deviceId) {
    return (
      <div className="panel">
        <h2>
          <MonitorSmartphone size={18} /> Device Files
        </h2>
        <p className="muted">Select a device to browse files</p>
      </div>
    );
  }

  const handleRemove = async (file: DeviceFile) => {
    const ok = await confirmDialog({ message: `Delete "${file.name}" from device?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    removeMut.mutate(
      { deviceId, filePath: file.path },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: ["deviceFiles", deviceId, currentPath],
          });
        },
      }
    );
  };

  const navigateTo = (file: DeviceFile) => {
    setPathHistory((prev) => [...prev, currentPath]);
    setCurrentPath(file.path);
  };

  const navigateUp = () => {
    if (pathHistory.length > 0) {
      const prev = pathHistory[pathHistory.length - 1];
      setPathHistory((h) => h.slice(0, -1));
      setCurrentPath(prev);
    } else {
      // Go to parent directory
      const parts = currentPath.split("/").filter(Boolean);
      if (parts.length > 1) {
        parts.pop();
        setCurrentPath("/" + parts.join("/"));
      }
    }
  };

  const breadcrumbParts = currentPath.split("/").filter(Boolean);

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h2>
          <MonitorSmartphone size={18} /> Device Files
        </h2>
        <button
          className="btn-icon"
          onClick={() => void refetch()}
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="breadcrumb">
        <button className="btn-link" onClick={() => { setCurrentPath(rootPath); setPathHistory([]); }}>
          /
        </button>
        {breadcrumbParts.map((part, i) => {
          const fullPath = "/" + breadcrumbParts.slice(0, i + 1).join("/");
          return (
            <span key={fullPath}>
              <span className="breadcrumb-sep">/</span>
              <button
                className="btn-link"
                onClick={() => {
                  setCurrentPath(fullPath);
                  setPathHistory([]);
                }}
              >
                {part}
              </button>
            </span>
          );
        })}
      </div>

      {isLoading ? (
        <p className="muted">Loading files...</p>
      ) : (
        <div className="file-list">
          {currentPath !== "/" && (
            <div className="file-row file-row-dir">
              <button className="btn-link file-name" onClick={navigateUp}>
                <ChevronUp size={14} /> ..
              </button>
            </div>
          )}
          {files.length === 0 && (
            <div className="empty-state">
              <FolderOpen size={32} />
              <p>Empty directory</p>
            </div>
          )}
          {/* Directories first, then files */}
          {files
            .slice()
            .sort((a, b) => {
              if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .map((file) => (
              <div key={file.name} className={`file-row ${file.is_dir ? "file-row-dir" : ""}`}>
                {file.is_dir ? (
                  <button
                    className="btn-link file-name"
                    onClick={() => navigateTo(file)}
                  >
                    <FolderOpen size={14} /> {file.name}
                  </button>
                ) : (
                  <span className="file-name">
                    <FileText size={14} /> {file.name}
                  </span>
                )}
                {!file.is_dir && (
                  <button
                    className="btn-danger-small"
                    onClick={() => handleRemove(file)}
                    disabled={removeMut.isPending}
                    title="Delete from device"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
