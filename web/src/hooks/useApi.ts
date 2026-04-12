import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchDevices,
  fetchDeviceFiles,
  fetchSystems,
  fetchGames,
  searchGames,
  fetchCoverStats,
  fetchScrapeSupported,
  fetchVolumeStatus,
  fetchDeviceGames,
  fetchInstalledGames,
  addGameToDevice,
  removeGameFromDevice,
  fetchSettings,
  updateSettings,
} from "../api/client";
import type { Settings } from "../types";

export function useDevices() {
  return useQuery({
    queryKey: ["devices"],
    queryFn: fetchDevices,
    refetchInterval: 5000,
  });
}

export function useDeviceFiles(deviceId: string | null, path: string) {
  return useQuery({
    queryKey: ["deviceFiles", deviceId, path],
    queryFn: () => fetchDeviceFiles(deviceId!, path),
    enabled: !!deviceId,
  });
}

export function useSystems() {
  return useQuery({
    queryKey: ["systems"],
    queryFn: fetchSystems,
  });
}

export function useGames(systemName: string | null) {
  return useQuery({
    queryKey: ["games", systemName],
    queryFn: () => fetchGames(systemName!),
    enabled: !!systemName,
  });
}

export function useGameSearch(query: string) {
  return useQuery({
    queryKey: ["gameSearch", query],
    queryFn: () => searchGames(query),
    enabled: query.length >= 2,
    placeholderData: (prev) => prev,
  });
}

export function useInstalledGames(deviceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["installedGames", deviceId],
    queryFn: () => fetchInstalledGames(deviceId!),
    enabled: !!deviceId && enabled,
  });
}

export function useAddGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      deviceId: string;
      sourcePath: string;
      destDir: string;
      unzip: boolean;
    }) =>
      addGameToDevice(
        params.deviceId,
        params.sourcePath,
        params.destDir,
        params.unzip
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["deviceFiles"] });
    },
  });
}

export function useRemoveGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { deviceId: string; filePath: string }) =>
      removeGameFromDevice(params.deviceId, params.filePath),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["deviceFiles"] });
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Settings) => updateSettings(settings),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings"] });
      void qc.invalidateQueries({ queryKey: ["systems"] });
    },
  });
}

export function useCoverStats(systemName: string | null) {
  return useQuery({
    queryKey: ["coverStats", systemName],
    queryFn: () => fetchCoverStats(systemName!),
    enabled: !!systemName,
  });
}

export function useScrapeSupported() {
  return useQuery({
    queryKey: ["scrapeSupported"],
    queryFn: fetchScrapeSupported,
  });
}

export function useVolumeStatus(deviceId: string | null) {
  return useQuery({
    queryKey: ["volumeStatus", deviceId],
    queryFn: () => fetchVolumeStatus(deviceId!),
    enabled: !!deviceId,
  });
}

export function useDeviceGames(deviceId: string | null, system: string | null) {
  return useQuery({
    queryKey: ["deviceGames", deviceId, system],
    queryFn: () => fetchDeviceGames(deviceId!, system!),
    enabled: !!deviceId && !!system,
  });
}
