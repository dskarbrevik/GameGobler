import { useState } from "react";
import {
  Upload,
  Check,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Search,
} from "lucide-react";
import type { SystemInfo } from "../types";
import { useGames, useAddGame } from "../hooks/useApi";
import { formatBytes } from "../utils";

interface Props {
  deviceId: string | null;
  systems: SystemInfo[];
}

export function TransferPanel({ deviceId, systems }: Props) {
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [destPath, setDestPath] = useState("/sdcard/ROMs");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<
    { name: string; status: "ok" | "error"; error?: string }[]
  >([]);
  const addMut = useAddGame();

  const system = systems.find((s) => s.name === selectedSystem) ?? null;
  const { data: games = [], isLoading: gamesLoading } = useGames(
    selectedSystem
  );

  const filtered = games.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!deviceId) {
    return (
      <div className="panel">
        <h2>
          <Upload size={18} /> Transfer
        </h2>
        <p className="muted">Select a device in the Devices tab first</p>
      </div>
    );
  }

  const handleSend = (gameName: string) => {
    if (!system) return;
    const systemDest = `${destPath}/${system.name}`;
    const sourcePath = `${system.path}/${gameName}`;
    const unzip = gameName.toLowerCase().endsWith(".zip");

    addMut.mutate(
      { deviceId, sourcePath, destDir: systemDest, unzip },
      {
        onSuccess: (data) => {
          setResults((prev) => [
            { name: data.name, status: "ok" },
            ...prev,
          ]);
        },
        onError: (err) => {
          setResults((prev) => [
            { name: gameName, status: "error", error: String(err) },
            ...prev,
          ]);
        },
      }
    );
  };

  return (
    <div className="panel">
      <h2>
        <Upload size={18} /> Transfer to Device
      </h2>

      <div className="transfer-dest">
        <label className="setting-label">
          <span>Device destination</span>
          <input
            type="text"
            value={destPath}
            onChange={(e) => setDestPath(e.target.value)}
            placeholder="/sdcard/ROMs"
          />
          <span className="muted">
            System subfolders (nes/, snes/) are created automatically
          </span>
        </label>
      </div>

      {!selectedSystem ? (
        <div className="system-list">
          <h3 className="transfer-subtitle">Pick a system</h3>
          {systems.length === 0 ? (
            <p className="muted">
              No systems in library. Set your ROM Library Path in Settings.
            </p>
          ) : (
            systems.map((sys) => (
              <button
                key={sys.name}
                className="system-card"
                onClick={() => setSelectedSystem(sys.name)}
              >
                <div className="system-info">
                  <span className="system-name">{sys.name.toUpperCase()}</span>
                  <span className="system-meta">
                    {sys.game_count} games &middot;{" "}
                    {formatBytes(sys.total_size)}
                  </span>
                </div>
                <ChevronRight size={16} />
              </button>
            ))
          )}
        </div>
      ) : (
        <>
          <div className="list-header">
            <button
              className="btn-back"
              onClick={() => {
                setSelectedSystem(null);
                setSearch("");
              }}
            >
              &larr; Systems
            </button>
            <h3>{system?.name.toUpperCase()}</h3>
          </div>
          <div className="search-bar">
            <Search size={14} />
            <input
              type="text"
              placeholder="Filter games..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {gamesLoading ? (
            <p className="muted">Loading games...</p>
          ) : (
            <div className="game-list">
              {filtered.map((game) => (
                <div key={game.name} className="game-row">
                  <span className="game-name">{game.name}</span>
                  <span className="game-size">{formatBytes(game.size)}</span>
                  <button
                    className="btn-primary btn-small"
                    onClick={() => handleSend(game.name)}
                    disabled={addMut.isPending}
                    title="Send to device"
                  >
                    {addMut.isPending ? (
                      <Loader2 size={12} className="spin" />
                    ) : (
                      <Upload size={12} />
                    )}
                  </button>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="muted">No games match &ldquo;{search}&rdquo;</p>
              )}
            </div>
          )}
        </>
      )}

      {results.length > 0 && (
        <div className="transfer-results">
          <h3>Recent transfers</h3>
          {results.slice(0, 20).map((r, i) => (
            <div key={i} className={`transfer-result-row ${r.status}`}>
              {r.status === "ok" ? (
                <Check size={14} className="result-icon-ok" />
              ) : (
                <AlertTriangle size={14} className="result-icon-err" />
              )}
              <span>{r.name}</span>
              {r.error && <span className="muted">{r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
