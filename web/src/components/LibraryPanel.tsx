import { useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Gamepad2, Search, EyeOff, Eye, ChevronUp, ChevronDown, ChevronsUpDown, Download, ImageOff } from "lucide-react";
import type { GameFile, SystemInfo, ScrapeEvent } from "../types";
import { formatBytes } from "../utils";
import { useGames, useCoverStats, useScrapeSupported } from "../hooks/useApi";
import { getConsoleIconUri } from "../consoleIcons";
import { getCoverUrl, scrapeCoverUrl } from "../api/client";

interface Props {
  systems: SystemInfo[];
  isLoading: boolean;
}

export function LibraryPanel({ systems, isLoading }: Props) {
  const { system: expandedSystem } = useParams<{ system: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);

  const expanded = systems.find((s) => s.name === expandedSystem) ?? null;

  const populated = systems.filter((s) => s.game_count > 0);
  const empty = systems.filter((s) => s.game_count === 0);

  return (
    <div className="panel library-panel">
      <h2>
        <Gamepad2 size={18} /> ROM Library
      </h2>

      {isLoading ? (
        <p className="muted">Loading library...</p>
      ) : systems.length === 0 ? (
        <div className="empty-state">
          <Gamepad2 size={32} />
          <p>No ROM systems found</p>
          <p className="muted">Configure your library path in Settings</p>
        </div>
      ) : expanded ? (
        <GameList
          system={expanded}
          search={search}
          onSearchChange={setSearch}
          onBack={() => {
            navigate("/library");
            setSearch("");
          }}
        />
      ) : (
        <>
          {populated.length > 0 && (
            <div className="system-grid">
              {populated.map((sys) => (
                <button
                  key={sys.name}
                  className="sys-tile"
                  onClick={() => navigate(`/library/${sys.name}`)}
                >
                  <img
                    className="sys-tile-icon"
                    src={getConsoleIconUri(sys.name)}
                    alt=""
                    aria-hidden="true"
                  />
                  <span className="sys-tile-name">{sys.name.toUpperCase()}</span>
                  <span className="sys-tile-meta">
                    {sys.game_count} game{sys.game_count !== 1 ? "s" : ""}
                  </span>
                  <span className="sys-tile-size">{formatBytes(sys.total_size)}</span>
                </button>
              ))}
            </div>
          )}

          {empty.length > 0 && (
            <div className="empty-systems-section">
              <button
                className="empty-systems-toggle"
                onClick={() => setShowEmpty((v) => !v)}
              >
                {showEmpty ? <EyeOff size={14} /> : <Eye size={14} />}
                {showEmpty ? "Hide" : "Show"} {empty.length} empty system
                {empty.length !== 1 ? "s" : ""}
              </button>
              {showEmpty && (
                <div className="system-grid system-grid-empty">
                  {empty.map((sys) => (
                    <button
                      key={sys.name}
                      className="sys-tile sys-tile-empty"
                      onClick={() => navigate(`/library/${sys.name}`)}
                    >
                      <img
                        className="sys-tile-icon"
                        src={getConsoleIconUri(sys.name)}
                        alt=""
                        aria-hidden="true"
                      />
                      <span className="sys-tile-name">{sys.name.toUpperCase()}</span>
                      <span className="sys-tile-meta">Empty</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {populated.length === 0 && (
            <div className="empty-state">
              <Gamepad2 size={32} />
              <p>All {systems.length} system folders are empty</p>
              <p className="muted">Add ROMs to your library to get started</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type SortKey = "title" | "regions" | "type" | "languages" | "revision" | "size";
type SortDir = "asc" | "desc";

function releaseLabel(game: GameFile): string {
  if (!game.meta) return "";
  const { release_type, release_num } = game.meta;
  if (!release_type) return "";
  return release_num != null ? `${release_type} ${release_num}` : release_type;
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={12} className="sort-icon muted" />;
  return sortDir === "asc" ? <ChevronUp size={12} className="sort-icon" /> : <ChevronDown size={12} className="sort-icon" />;
}

function GameList({
  system,
  search,
  onSearchChange,
  onBack,
}: {
  system: SystemInfo;
  search: string;
  onSearchChange: (s: string) => void;
  onBack: () => void;
}) {
  const { data: games = [], isLoading, isError } = useGames(system.name);
  const { data: coverStats } = useCoverStats(system.name);
  const { data: supported = [] } = useScrapeSupported();
  const canScrape = supported.includes(system.name);
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [regionFilter, setRegionFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [hideBios, setHideBios] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<ScrapeEvent | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancelScrape = useCallback(() => {
    abortRef.current?.abort();
    setScraping(false);
  }, []);

  const startScrape = useCallback(() => {
    if (scraping) return;
    setScraping(true);
    setScrapeProgress(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    fetch(scrapeCoverUrl(system.name), {
      method: "POST",
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const evt = JSON.parse(line.slice(6)) as ScrapeEvent;
              setScrapeProgress(evt);
            }
          }
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Scrape error:", err);
      })
      .finally(() => {
        setScraping(false);
        abortRef.current = null;
      });
  }, [scraping, system.name]);

  // Collect unique filter options from loaded data
  const allRegions = [...new Set(games.flatMap((g) => g.meta?.regions ?? []))].sort();
  const allTypes = [...new Set(games.map((g) => g.meta?.release_type ?? null).filter(Boolean))] as string[];

  const filtered = games
    .filter((g) => {
      if (hideBios && g.meta?.is_bios) return false;
      if (regionFilter !== "all" && !(g.meta?.regions ?? []).includes(regionFilter)) return false;
      if (typeFilter !== "all") {
        const t = g.meta?.release_type ?? null;
        if (typeFilter === "normal" && t !== null) return false;
        if (typeFilter !== "normal" && t !== typeFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const title = g.meta?.title ?? g.name;
        return title.toLowerCase().includes(q) || g.name.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "title":
          return dir * (a.meta?.title ?? a.name).localeCompare(b.meta?.title ?? b.name);
        case "regions":
          return dir * (a.meta?.regions.join() ?? "").localeCompare(b.meta?.regions.join() ?? "");
        case "type": {
          const at = releaseLabel(a) || "Normal";
          const bt = releaseLabel(b) || "Normal";
          return dir * at.localeCompare(bt);
        }
        case "languages":
          return dir * (a.meta?.languages.join() ?? "").localeCompare(b.meta?.languages.join() ?? "");
        case "revision":
          return dir * (a.meta?.revision ?? "").localeCompare(b.meta?.revision ?? "");
        case "size":
          return dir * (a.size - b.size);
        default:
          return 0;
      }
    });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const renderTh = (col: SortKey, label: string) => (
    <th className="rom-th" onClick={() => toggleSort(col)}>
      {label} <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
    </th>
  );

  const biosCount = games.filter((g) => g.meta?.is_bios).length;

  return (
    <>
      <div className="list-header">
        <button className="btn-back" onClick={onBack}>&larr; Systems</button>
        <h3>
          <img className="sys-tile-icon-sm" src={getConsoleIconUri(system.name)} alt="" />
          {system.name.toUpperCase()} ({games.length} game{games.length !== 1 ? "s" : ""})
        </h3>
        {canScrape && (
          <button
            className="btn-scrape"
            onClick={scraping ? cancelScrape : startScrape}
            title={coverStats ? `${coverStats.with_cover}/${coverStats.total_games} covers` : "Scrape box art"}
          >
            <Download size={14} />
            {scraping ? "Cancel Scrape" : "Scrape Box Art"}
          </button>
        )}
        {!canScrape && (
          <span className="muted scrape-unsupported" title="No libretro-thumbnails mapping for this system">
            <ImageOff size={14} /> No box art source
          </span>
        )}
      </div>

      {scrapeProgress && (
        <div className="scrape-progress">
          <div className="scrape-bar-track">
            <div
              className="scrape-bar-fill"
              style={{ width: `${Math.round(((scrapeProgress.downloaded + scrapeProgress.skipped + scrapeProgress.not_found + scrapeProgress.errors) / scrapeProgress.total) * 100)}%` }}
            />
          </div>
          <span className="scrape-stats">
            {scrapeProgress.status === "done" ? (
              <>Done: {scrapeProgress.downloaded} downloaded, {scrapeProgress.skipped} skipped, {scrapeProgress.not_found} not found</>
            ) : (
              <>{scrapeProgress.downloaded + scrapeProgress.skipped + scrapeProgress.not_found + scrapeProgress.errors} / {scrapeProgress.total} — {scrapeProgress.downloaded} new, {scrapeProgress.skipped} skipped</>
            )}
          </span>
        </div>
      )}

      <div className="rom-filters">
        <div className="search-bar">
          <Search size={14} aria-hidden="true" />
          <input
            type="text"
            aria-label="Search games"
            placeholder="Search titles..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

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

        {biosCount > 0 && (
          <button className="rom-filter-toggle" onClick={() => setHideBios((v) => !v)}>
            {hideBios ? <Eye size={13} /> : <EyeOff size={13} />}
            {hideBios ? `Show ${biosCount} BIOS` : "Hide BIOS"}
          </button>
        )}

        <span className="rom-count muted">{filtered.length} / {games.length}</span>
      </div>

      {isLoading ? (
        <p className="muted">Loading games...</p>
      ) : isError ? (
        <p className="muted">Failed to load games — is the backend running?</p>
      ) : (
        <div className="rom-table-wrap">
          <table className="rom-table">
            <thead>
              <tr>
                <th className="rom-th-cover" />
                {renderTh("title", "Title")}
                {renderTh("regions", "Region")}
                {renderTh("type", "Type")}
                {renderTh("languages", "Languages")}
                <th className="rom-th">Features</th>
                {renderTh("revision", "Rev")}
                {renderTh("size", "Size")}
              </tr>
            </thead>
            <tbody>
              {filtered.map((game) => {
                const m = game.meta;
                const typeLabel = releaseLabel(game);
                return (
                  <tr key={game.name} className="rom-row" title={game.name}>
                    <td className="rom-td-cover">
                      {game.has_cover ? (
                        <img
                          className="rom-cover-thumb"
                          src={getCoverUrl(system.name, game.name)}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <div className="rom-cover-placeholder">
                          <ImageOff size={12} />
                        </div>
                      )}
                    </td>
                    <td className="rom-td-title">
                      {m?.title ?? game.name}
                      {m?.is_bios && <span className="rom-badge rom-badge-bios">BIOS</span>}
                    </td>
                    <td className="rom-td">{m?.regions.join(", ") ?? ""}</td>
                    <td className="rom-td">
                      {typeLabel ? (
                        <span className={`rom-badge rom-badge-${(m?.release_type ?? "").toLowerCase()}`}>
                          {typeLabel}
                        </span>
                      ) : null}
                    </td>
                    <td className="rom-td">{m?.languages.join(", ") ?? ""}</td>
                    <td className="rom-td rom-td-features">
                      {m?.features.map((f) => (
                        <span key={f} className="rom-feature">{f}</span>
                      ))}
                    </td>
                    <td className="rom-td">{m?.revision ?? ""}</td>
                    <td className="rom-td rom-td-size">{formatBytes(game.size)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="muted" style={{ padding: "1rem" }}>
              No games match the current filters.
            </p>
          )}
        </div>
      )}
    </>
  );
}
