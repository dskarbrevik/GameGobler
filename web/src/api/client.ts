/** API client for the GameGobler backend. */

import type {
  DeviceFile,
  DeviceInfo,
  GameFile,
  SearchResult,
  Settings,
  SystemInfo,
} from "../types";

const API_BASE = "/api";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─── Devices ──────────────────────────────────────────

export function fetchDevices(): Promise<DeviceInfo[]> {
  return fetchJson<DeviceInfo[]>(`${API_BASE}/devices/`);
}

export interface VolumeCandidate {
  path: string;
  label: string;
  size: string | null;
  fstype: string | null;
  model: string | null;
}

export function discoverVolumes(): Promise<VolumeCandidate[]> {
  return fetchJson<VolumeCandidate[]>(`${API_BASE}/devices/volumes/discover`);
}

export function registerVolume(
  path: string,
  label: string
): Promise<DeviceInfo> {
  return fetchJson<DeviceInfo>(`${API_BASE}/devices/volumes/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, label }),
  });
}

export function unregisterVolume(path: string): Promise<{ status: string }> {
  const params = new URLSearchParams({ path });
  return fetchJson(`${API_BASE}/devices/volumes/register?${params}`, {
    method: "DELETE",
  });
}

export function ejectVolume(path: string): Promise<{ status: string }> {
  const params = new URLSearchParams({ path });
  return fetchJson(`${API_BASE}/devices/volumes/eject?${params}`, {
    method: "POST",
  });
}

export function fetchDeviceFiles(
  deviceId: string,
  path: string
): Promise<DeviceFile[]> {
  const params = new URLSearchParams({ device_id: deviceId, path });
  return fetchJson<DeviceFile[]>(
    `${API_BASE}/devices/files?${params}`
  );
}

export function deleteDeviceFile(
  deviceId: string,
  filePath: string
): Promise<{ status: string; path: string }> {
  const params = new URLSearchParams({ device_id: deviceId, file_path: filePath });
  return fetchJson(`${API_BASE}/devices/files?${params}`, {
    method: "DELETE",
  });
}

// ─── Library ──────────────────────────────────────────

export function fetchSystems(): Promise<SystemInfo[]> {
  return fetchJson<SystemInfo[]>(`${API_BASE}/library/systems`);
}

export function fetchGames(systemName: string): Promise<GameFile[]> {
  return fetchJson<GameFile[]>(
    `${API_BASE}/library/systems/${encodeURIComponent(systemName)}/games`
  );
}

export function searchGames(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query });
  return fetchJson<SearchResult[]>(`${API_BASE}/library/search?${params}`);
}

export function getCoverUrl(systemName: string, gameName: string): string {
  return `${API_BASE}/library/systems/${encodeURIComponent(systemName)}/games/${encodeURIComponent(gameName)}/cover`;
}

export function fetchCoverStats(
  systemName: string
): Promise<{ system: string; total_games: number; with_cover: number; cover_dir: string | null }> {
  return fetchJson(
    `${API_BASE}/library/systems/${encodeURIComponent(systemName)}/cover-stats`
  );
}

export function fetchScrapeSupported(): Promise<string[]> {
  return fetchJson<string[]>(`${API_BASE}/library/systems/scrape-supported`);
}

export function scrapeCoverUrl(systemName: string): string {
  return `${API_BASE}/library/systems/${encodeURIComponent(systemName)}/scrape-covers`;
}

// ─── Transfer (add/remove games to device) ────────────

export function addGameToDevice(
  deviceId: string,
  sourcePath: string,
  destDir: string,
  unzip: boolean = false
): Promise<{ status: string; name: string }> {
  const params = new URLSearchParams({
    device_id: deviceId,
    source_path: sourcePath,
    dest_dir: destDir,
    unzip: String(unzip),
  });
  return fetchJson(`${API_BASE}/sync/add-game?${params}`, {
    method: "POST",
  });
}

export function removeGameFromDevice(
  deviceId: string,
  filePath: string
): Promise<{ status: string; path: string }> {
  const params = new URLSearchParams({
    device_id: deviceId,
    file_path: filePath,
  });
  return fetchJson(`${API_BASE}/sync/remove-game?${params}`, {
    method: "DELETE",
  });
}

// ─── Volume setup ───────────────────────────────────────

import type { VolumeStatus } from "../types";

export function fetchVolumeStatus(deviceId: string): Promise<VolumeStatus> {
  const params = new URLSearchParams({ device_id: deviceId });
  return fetchJson<VolumeStatus>(`${API_BASE}/devices/volumes/status?${params}`);
}

export function formatVolume(
  deviceId: string,
  label: string = "EMUROMS"
): Promise<{ status: string; filesystem: string; label: string; new_path?: string }> {
  return fetchJson(`${API_BASE}/devices/volumes/format`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId, label }),
  });
}

// ─── Device game management ─────────────────────────────

export function fetchDeviceGames(
  deviceId: string,
  system: string
): Promise<string[]> {
  const params = new URLSearchParams({ device_id: deviceId, system });
  return fetchJson<string[]>(`${API_BASE}/devices/games?${params}`);
}

export function copyGameToDevice(
  deviceId: string,
  system: string,
  game: string
): Promise<{ status: string; name: string; size: number }> {
  return fetchJson(`${API_BASE}/devices/games/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId, system, game }),
  });
}

export function streamCopyGame(
  deviceId: string,
  system: string,
  game: string,
  onProgress: (bytes: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    fetch(`${API_BASE}/devices/games/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, system, game }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          reject(new Error(`API error ${res.status}: ${body}`));
          return;
        }
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop()!;
          for (const part of parts) {
            if (!part.startsWith("data: ")) continue;
            let evt: Record<string, unknown>;
            try { evt = JSON.parse(part.slice(6)) as Record<string, unknown>; }
            catch { continue; }
            if (typeof evt.error === "string") { reject(new Error(evt.error)); return; }
            if (evt.done) { resolve(); return; }
            if (typeof evt.bytes === "number" && typeof evt.total === "number") {
              onProgress(evt.bytes, evt.total);
            }
          }
        }
        resolve();
      })
      .catch(reject);
  });
}

export function removeDeviceGame(
  deviceId: string,
  system: string,
  game: string
): Promise<{ status: string; name: string }> {
  const params = new URLSearchParams({ device_id: deviceId, system, game });
  return fetchJson(`${API_BASE}/devices/games?${params}`, { method: "DELETE" });
}

export function fetchInstalledGames(deviceId: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ device_id: deviceId });
  return fetchJson<SearchResult[]>(`${API_BASE}/devices/games/installed?${params}`);
}

// ─── Settings ───────────────────────────────────────────

export function fetchSettings(): Promise<Settings> {
  return fetchJson<Settings>(`${API_BASE}/settings`);
}

export function updateSettings(settings: Settings): Promise<Settings> {
  return fetchJson<Settings>(`${API_BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}
