import { useState, useMemo } from "react";
import { Gamepad2, Plus, Trash2, Search, Loader, Eye, EyeOff, X } from "lucide-react";
import type { GameFile, SearchResult } from "../types";
import { useSystems, useGames, useDeviceGames, useGameSearch, useInstalledGames } from "../hooks/useApi";
import { useQueryClient } from "@tanstack/react-query";
import { formatBytes } from "../utils";
import { streamCopyGame, removeDeviceGame } from "../api/client";
import { useToast } from "./Toast";

interface Props {
  deviceId: string | null;
  deviceType?: "android" | "volume";
}

export function GameManagerPanel({ deviceId }: Props) {
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [featureFilter, setFeatureFilter] = useState("all");
  const [hideBios, setHideBios] = useState(true);
  const [installFilter, setInstallFilter] = useState<"all" | "installed" | "not-installed">("all");
  const [copying, setCopying] = useState<Set<string>>(new Set());
  const [copyProgress, setCopyProgress] = useState<Map<string, number>>(new Map());
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());

  const queryClient = useQueryClient();
  const { toast, confirm: confirmFn } = useToast();
  const { data: systems = [] } = useSystems();
  const { data: libraryGames = [] } = useGames(selectedSystem);
  const { data: deviceGames = [] } = useDeviceGames(deviceId, selectedSystem);
  const { data: searchResults = [], isFetching: isSearching } = useGameSearch(
    !selectedSystem ? search : ""
  );

  // Global filter mode: no system, filter active but no search text
  const globalSearch = !selectedSystem && search.length >= 2;
  const globalFilterMode = !selectedSystem && installFilter !== "all" && search.length < 2;
  const globalMode = globalSearch || globalFilterMode;

  const { data: installedGames = [], isFetching: isLoadingInstalled } = useInstalledGames(
    deviceId,
    globalFilterMode
  );

  const deviceGameSet = new Set(deviceGames);
  const globalDeviceGameSet = useMemo(
    () => new Set(installedGames.map((g) => `${g.system}/${g.name}`)),
    [installedGames]
  );

  // isOnDevice checks per-system deviceGames OR globally installed games (cross-system)
  const isOnDevice = (name: string, key?: string) => {
    const k = key ?? name;
    return (deviceGameSet.has(name) || addedKeys.has(k) || globalDeviceGameSet.has(k)) && !removedKeys.has(k);
  };

  // Source games for global mode: search results or all installed games
  const sourceGames = globalSearch ? searchResults : installedGames;

  // Collect unique filter options from the active game source
  const activeGames = selectedSystem ? libraryGames : sourceGames;
  const allRegions = useMemo(() =>
    [...new Set(activeGames.flatMap((g) => g.meta?.regions ?? []))].sort(), [activeGames]);
  const allTypes = useMemo(() =>
    [...new Set(activeGames.map((g) => g.meta?.release_type).filter(Boolean))] as string[], [activeGames]);
  const allFeatures = useMemo(() =>
    [...new Set(activeGames.flatMap((g) => g.meta?.features ?? []))].sort(), [activeGames]);
  const biosCount = useMemo(() =>
    activeGames.filter((g) => g.meta?.is_bios).length, [activeGames]);

  const filteredSourceResults = useMemo(() => {
    if (!globalMode) return [];
    return sourceGames.filter((g) => {
      if (hideBios && g.meta?.is_bios) return false;
      const key = `${g.system}/${g.name}`;
      if (installFilter !== "all") {
        const on = isOnDevice(g.name, key);
        if (installFilter === "installed" && !on) return false;
        if (installFilter === "not-installed" && on) return false;
      }
      if (regionFilter !== "all" && !(g.meta?.regions ?? []).includes(regionFilter)) return false;
      if (typeFilter !== "all") {
        const t = g.meta?.release_type ?? null;
        if (typeFilter === "normal" && t !== null) return false;
        if (typeFilter !== "normal" && t !== typeFilter) return false;
      }
      if (featureFilter !== "all" && !(g.meta?.features ?? []).includes(featureFilter)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceGames, globalMode, hideBios, installFilter, regionFilter, typeFilter, featureFilter, globalDeviceGameSet, deviceGameSet, addedKeys, removedKeys]);

  if (!deviceId) {
    return (
      <div className="panel">
        <h2><Gamepad2 size={18} /> Game Manager</h2>
        <p className="muted">Select a device to manage games</p>
      </div>
    );
  }

  const handleAdd = async (game: GameFile | SearchResult, system?: string) => {
    const sys = system ?? selectedSystem;
    if (!sys) return;
    const key = "system" in game ? `${(game as SearchResult).system}/${game.name}` : game.name;
    setCopying((prev) => new Set(prev).add(key));
    setCopyProgress((prev) => new Map(prev).set(key, 0));
    let lastReportedPct = -1;
    try {
      await streamCopyGame(deviceId, sys, game.name, (bytes, total) => {
        const pct = total > 0 ? bytes / total : 0;
        if (pct - lastReportedPct >= 0.01) {
          lastReportedPct = pct;
          setCopyProgress((prev) => new Map(prev).set(key, pct));
        }
      });
      setAddedKeys((prev) => new Set(prev).add(key));
      setRemovedKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
      void queryClient.invalidateQueries({ queryKey: ["deviceGames", deviceId, sys] });
      void queryClient.invalidateQueries({ queryKey: ["volumeStatus", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["gameSearch"] });
      void queryClient.invalidateQueries({ queryKey: ["installedGames", deviceId] });
    } catch (e) {
      toast(`Copy failed: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setCopying((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setCopyProgress((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleRemove = async (gameName: string, system?: string) => {
    const sys = system ?? selectedSystem;
    if (!sys) return;
    const ok = await confirmFn({
      message: `Remove "${gameName}" from device?`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    const key = system ? `${system}/${gameName}` : gameName;
    setRemoving((prev) => new Set(prev).add(key));
    try {
      await removeDeviceGame(deviceId, sys, gameName);
      setRemovedKeys((prev) => new Set(prev).add(key));
      setAddedKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
      void queryClient.invalidateQueries({ queryKey: ["deviceGames", deviceId, sys] });
      void queryClient.invalidateQueries({ queryKey: ["volumeStatus", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["gameSearch"] });
      void queryClient.invalidateQueries({ queryKey: ["installedGames", deviceId] });
    } catch (e) {
      toast(`Remove failed: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const filteredGames = libraryGames.filter((g) => {
    if (hideBios && g.meta?.is_bios) return false;
    if (installFilter !== "all") {
      const on = isOnDevice(g.name);
      if (installFilter === "installed" && !on) return false;
      if (installFilter === "not-installed" && on) return false;
    }
    if (regionFilter !== "all" && !(g.meta?.regions ?? []).includes(regionFilter)) return false;
    if (typeFilter !== "all") {
      const t = g.meta?.release_type ?? null;
      if (typeFilter === "normal" && t !== null) return false;
      if (typeFilter !== "normal" && t !== typeFilter) return false;
    }
    if (featureFilter !== "all" && !(g.meta?.features ?? []).includes(featureFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      const title = g.meta?.title ?? g.name;
      return title.toLowerCase().includes(q) || g.name.toLowerCase().includes(q);
    }
    return true;
  });

  const displayedGames = selectedSystem ? filteredGames : filteredSourceResults;
  const onDeviceCount = displayedGames.filter((g) => {
    const sys = "system" in g ? (g as SearchResult).system : undefined;
    const key = sys ? `${sys}/${g.name}` : g.name;
    return isOnDevice(g.name, key);
  }).length;

  const renderGameRow = (game: GameFile, opts: { system?: string; showSystem?: boolean }) => {
    const sys = opts.system;
    const key = sys ? `${sys}/${game.name}` : game.name;
    const showOnDevice = isOnDevice(game.name, key);
    const isCopying = copying.has(key);
    const isRemoving = removing.has(key);
    const pct = copyProgress.get(key);

    return (
      <div key={key} className={`game-row ${showOnDevice ? "on-device" : ""}`}>
        <div className="game-info">
          <span className="game-title" title={game.name}>
            {showOnDevice && <span className="on-device-dot" />}
            {game.meta?.title || game.name}
            {opts.showSystem && sys && (
              <span className="tag tag-system">{sys}</span>
            )}
            {game.meta?.release_type && (
              <span className="tag tag-release">{game.meta.release_type}{game.meta.release_num ? ` ${game.meta.release_num}` : ""}</span>
            )}
            {game.meta?.revision && (
              <span className="tag tag-rev">{game.meta.revision}</span>
            )}
            {game.meta?.features?.map((f) => (
              <span key={f} className="tag">{f}</span>
            ))}
          </span>
          <span className="game-meta muted">
            {game.meta?.regions?.length ? game.meta.regions.join(", ") : ""}
            {game.meta?.regions?.length ? " · " : ""}
            {formatBytes(game.size)}
          </span>
        </div>
        <div className="game-actions">
          {showOnDevice ? (
            <button
              className="btn-small btn-danger"
              onClick={() => void handleRemove(game.name, sys)}
              disabled={isRemoving}
              title="Remove from device"
            >
              {isRemoving ? <Loader size={12} className="spin" /> : <Trash2 size={12} />}
            </button>
          ) : isCopying ? (
            <div className="copy-progress-wrap">
              <div className="copy-progress-bar">
                <div
                  className={`copy-progress-fill${pct === 0 ? " indeterminate" : ""}`}
                  style={{ width: `${Math.round((pct ?? 0) * 100)}%` }}
                />
              </div>
              <span className="copy-progress-pct">
                {pct === 0 ? "…" : `${Math.round((pct ?? 0) * 100)}%`}
              </span>
            </div>
          ) : (
            <button
              className="btn-small btn-add"
              onClick={() => void handleAdd(game, sys)}
              disabled={isCopying}
              title="Add to device"
            >
              <Plus size={12} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="panel game-manager">
      {/* Global search bar — always visible */}
      <div className="game-manager-header">
        <div className="search-wrapper">
          <Search size={14} />
          <input
            type="text"
            placeholder={selectedSystem ? `Search ${selectedSystem} games...` : "Search all games..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          {isSearching && <Loader size={14} className="spin" />}
        </div>
        {selectedSystem && (
          <button
            className="btn-small"
            onClick={() => { setSelectedSystem(null); setRegionFilter("all"); setTypeFilter("all"); setFeatureFilter("all"); setInstallFilter("all"); }}
            title="Back to all systems"
          >
            <X size={12} /> {selectedSystem}
          </button>
        )}
        {!selectedSystem && !globalMode && (
          <select
            className="rom-filter-select"
            value={installFilter}
            onChange={(e) => setInstallFilter(e.target.value as "all" | "installed" | "not-installed")}
          >
            <option value="all">All games</option>
            <option value="installed">Installed</option>
            <option value="not-installed">Not installed</option>
          </select>
        )}
        {(selectedSystem || globalMode) && (
          <span className="game-stats muted">
            {onDeviceCount} / {displayedGames.length} on device
          </span>
        )}
      </div>

      {/* Global mode: search results or installed-games filter (no system selected) */}
      {globalMode ? (
        <>
          <div className="game-manager-filters">
            {allRegions.length > 0 && (
              <select
                className="rom-filter-select"
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
              >
                <option value="all">All regions</option>
                {allRegions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}

            <select
              className="rom-filter-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All types</option>
              <option value="normal">Normal</option>
              {allTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>

            {allFeatures.length > 0 && (
              <select
                className="rom-filter-select"
                value={featureFilter}
                onChange={(e) => setFeatureFilter(e.target.value)}
              >
                <option value="all">All variants</option>
                {allFeatures.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            )}

            <select
              className="rom-filter-select"
              value={installFilter}
              onChange={(e) => setInstallFilter(e.target.value as "all" | "installed" | "not-installed")}
            >
              <option value="all">All games</option>
              <option value="installed">Installed</option>
              <option value="not-installed">Not installed</option>
            </select>
          </div>

          <div className="game-list-scroll">
            {filteredSourceResults.length === 0 ? (
              <p className="muted" style={{ padding: "1rem" }}>
                {isSearching || isLoadingInstalled ? "Loading..." : "No games found"}
              </p>
            ) : (
              filteredSourceResults.map((game) =>
                renderGameRow(game, { system: game.system, showSystem: true })
              )
            )}
          </div>
        </>
      ) : (
        /* System sidebar + per-system game list */
        <div className="game-manager-layout">
          <div className="game-manager-systems">
            <h3>Systems</h3>
            <div className="system-list">
              {systems
                .filter((s) => s.game_count > 0)
                .map((system) => (
                  <button
                    key={system.name}
                    className={`system-item ${selectedSystem === system.name ? "active" : ""}`}
                    onClick={() => { setSelectedSystem(system.name); setSearch(""); setRegionFilter("all"); setTypeFilter("all"); setFeatureFilter("all"); setInstallFilter("all"); setAddedKeys(new Set()); setRemovedKeys(new Set()); }}
                  >
                    <span className="system-name">{system.name}</span>
                    <span className="system-counts">
                      <span className="count-badge">{system.game_count}</span>
                    </span>
                  </button>
                ))}
            </div>
          </div>

          <div className="game-manager-games">
            {selectedSystem ? (
              <>
                <div className="game-manager-filters">
                  {allRegions.length > 0 && (
                    <select
                      className="rom-filter-select"
                      value={regionFilter}
                      onChange={(e) => setRegionFilter(e.target.value)}
                    >
                      <option value="all">All regions</option>
                      {allRegions.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}

                  <select
                    className="rom-filter-select"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    <option value="all">All types</option>
                    <option value="normal">Normal</option>
                    {allTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>

                  {allFeatures.length > 0 && (
                    <select
                      className="rom-filter-select"
                      value={featureFilter}
                      onChange={(e) => setFeatureFilter(e.target.value)}
                    >
                      <option value="all">All variants</option>
                      {allFeatures.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  )}

                  <select
                    className="rom-filter-select"
                    value={installFilter}
                    onChange={(e) => setInstallFilter(e.target.value as "all" | "installed" | "not-installed")}
                  >
                    <option value="all">All games</option>
                    <option value="installed">Installed</option>
                    <option value="not-installed">Not installed</option>
                  </select>

                  {biosCount > 0 && (
                    <button className="rom-filter-toggle" onClick={() => setHideBios((v) => !v)}>
                      {hideBios ? <Eye size={13} /> : <EyeOff size={13} />}
                      {hideBios ? `Show ${biosCount} BIOS` : "Hide BIOS"}
                    </button>
                  )}
                </div>

                <div className="game-list-scroll">
                  {filteredGames.length === 0 ? (
                    <p className="muted" style={{ padding: "1rem" }}>No games found</p>
                  ) : (
                    filteredGames.map((game) =>
                      renderGameRow(game, {})
                    )
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Gamepad2 size={32} />
                <p>Select a system or search across all games</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
