import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchSystems,
  fetchGames,
  searchGames,
  getCoverUrl,
  fetchSettings,
  updateSettings,
  fetchDevices,
  fetchDeviceFiles,
  fetchCoverStats,
  fetchScrapeSupported,
  scrapeCoverUrl,
} from "../api/client";

// Stub global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function errorResponse(body: string, status: number) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.reject(new Error("not json")),
    text: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchSystems", () => {
  it("calls the correct endpoint", async () => {
    mockFetch.mockReturnValue(jsonResponse([]));
    await fetchSystems();
    expect(mockFetch).toHaveBeenCalledWith("/api/library/systems", undefined);
  });

  it("returns parsed data", async () => {
    const systems = [{ name: "nes", path: "/roms/nes", game_count: 5, total_size: 1024 }];
    mockFetch.mockReturnValue(jsonResponse(systems));
    const result = await fetchSystems();
    expect(result).toEqual(systems);
  });
});

describe("fetchGames", () => {
  it("encodes system name in URL", async () => {
    mockFetch.mockReturnValue(jsonResponse([]));
    await fetchGames("Game Boy Advance");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/library/systems/Game%20Boy%20Advance/games",
      undefined
    );
  });
});

describe("searchGames", () => {
  it("passes query as URL param", async () => {
    mockFetch.mockReturnValue(jsonResponse([]));
    await searchGames("mario");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("q=mario");
  });
});

describe("getCoverUrl", () => {
  it("returns correct URL", () => {
    expect(getCoverUrl("nes", "Super Mario.nes")).toBe(
      "/api/library/systems/nes/games/Super%20Mario.nes/cover"
    );
  });
});

describe("scrapeCoverUrl", () => {
  it("returns correct URL", () => {
    expect(scrapeCoverUrl("snes")).toBe("/api/library/systems/snes/scrape-covers");
  });
});

describe("fetchDevices", () => {
  it("calls devices endpoint", async () => {
    mockFetch.mockReturnValue(jsonResponse([]));
    await fetchDevices();
    expect(mockFetch).toHaveBeenCalledWith("/api/devices/", undefined);
  });
});

describe("fetchDeviceFiles", () => {
  it("passes device_id and path params", async () => {
    mockFetch.mockReturnValue(jsonResponse([]));
    await fetchDeviceFiles("abc", "/sdcard");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("device_id=abc");
    expect(url).toContain("path=%2Fsdcard");
  });
});

describe("fetchCoverStats", () => {
  it("calls the correct endpoint", async () => {
    const stats = { system: "nes", total_games: 10, with_cover: 5, cover_dir: "/covers/nes" };
    mockFetch.mockReturnValue(jsonResponse(stats));
    const result = await fetchCoverStats("nes");
    expect(result).toEqual(stats);
  });
});

describe("fetchScrapeSupported", () => {
  it("returns array", async () => {
    mockFetch.mockReturnValue(jsonResponse(["nes", "snes"]));
    const result = await fetchScrapeSupported();
    expect(result).toEqual(["nes", "snes"]);
  });
});

describe("fetchSettings", () => {
  it("returns settings", async () => {
    const settings = { library_path: "/roms" };
    mockFetch.mockReturnValue(jsonResponse(settings));
    const result = await fetchSettings();
    expect(result).toEqual(settings);
  });
});

describe("updateSettings", () => {
  it("sends PUT with JSON body", async () => {
    mockFetch.mockReturnValue(jsonResponse({ library_path: "/new" }));
    await updateSettings({ library_path: "/new" });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/settings");
    expect(init.method).toBe("PUT");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ library_path: "/new" });
  });
});

describe("error handling", () => {
  it("throws on non-ok response", async () => {
    mockFetch.mockReturnValue(errorResponse("not found", 404));
    await expect(fetchSystems()).rejects.toThrow("API error 404: not found");
  });

  it("includes status code in error message", async () => {
    mockFetch.mockReturnValue(errorResponse("server error", 500));
    await expect(fetchSettings()).rejects.toThrow("500");
  });
});
