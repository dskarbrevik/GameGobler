/** Shared type definitions for the GameGobler Web UI. */

export interface StorageInfo {
  path: string;
  free: number | null;
  total: number | null;
}

export interface DeviceInfo {
  device_id: string;
  device_type: "android" | "volume";
  label: string;
  storage: Record<string, StorageInfo>;
}

export interface SystemInfo {
  name: string;
  path: string;
  game_count: number;
  total_size: number;
}

export interface RomMeta {
  title: string;
  regions: string[];
  languages: string[];
  release_type: string | null;
  release_num: number | null;
  revision: string | null;
  features: string[];
  date: string | null;
  is_bios: boolean;
  extension: string;
}

export interface GameFile {
  name: string;
  size: number;
  has_cover: boolean;
  meta: RomMeta | null;
}

export interface SearchResult extends GameFile {
  system: string;
}

export interface DeviceFile {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface TransferGameRequest {
  device_id: string;
  source_path: string;
  dest_dir: string;
  unzip: boolean;
}

export interface Settings {
  library_path?: string;
  unzip_on_transfer?: boolean;
}

export interface VolumeStatus {
  fstype: string | null;
  is_initialized: boolean;
  systems: { name: string; game_count: number }[];
  bios_count: number;
}

export interface InitializeEvent {
  step: "folder" | "bios" | "bios_skip" | "done";
  name?: string;
  current: number;
  total: number;
  systems_created?: number;
  bios_copied?: number;
  errors?: string[];
}

export interface ScrapeEvent {
  game: string;
  status: "ok" | "skip" | "404" | "error" | "done";
  current: number;
  total: number;
  downloaded: number;
  skipped: number;
  not_found: number;
  errors: number;
  message?: string;
}

export interface VersionInfo {
  version: string;
  latest: string | null;
  update_available: boolean;
  release_url: string | null;
}
