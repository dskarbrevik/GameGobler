import { type Page, type Route } from "@playwright/test";
import * as fixtures from "./fixtures";

type MockOverrides = {
  settings?: typeof fixtures.SETTINGS | typeof fixtures.SETTINGS_EMPTY;
  version?: typeof fixtures.VERSION;
  systems?: typeof fixtures.SYSTEMS;
  devices?: typeof fixtures.DEVICES;
  /** Make specific endpoints return errors. Keys are endpoint names. */
  errors?: {
    settings?: boolean;
    systems?: boolean;
    devices?: boolean;
    health?: boolean;
    gameCopy?: boolean;
    gameRemove?: boolean;
  };
};

/**
 * Intercept all /api/* requests and return deterministic mock data.
 * Call once per test before navigating.
 *
 * Pass `overrides` to swap specific fixtures (e.g. empty settings for setup wizard).
 */
export async function mockApi(page: Page, overrides: MockOverrides = {}) {
  const settings = overrides.settings ?? fixtures.SETTINGS;
  const version = overrides.version ?? fixtures.VERSION;
  const systems = overrides.systems ?? fixtures.SYSTEMS;
  const devices = overrides.devices ?? fixtures.DEVICES;
  const errors = overrides.errors ?? {};

  await page.route("**/api/health", (route: Route) =>
    errors.health
      ? route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"Service unavailable"}' })
      : route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );

  await page.route("**/api/settings", async (route: Route) => {
    if (errors.settings) {
      return route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Internal server error"}' });
    }
    if (route.request().method() === "PUT") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(settings) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(settings) });
  });

  await page.route("**/api/version", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(version) }),
  );

  await page.route("**/api/library/systems", (route: Route) => {
    if (route.request().url().includes("/systems/")) return route.continue();
    if (errors.systems) {
      return route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Internal server error"}' });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(systems) });
  });

  await page.route("**/api/library/systems/*/games", (route: Route) => {
    const url = route.request().url();
    if (url.includes("/gba/games")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.GBA_GAMES) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/api/library/systems/*/cover-stats", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.COVER_STATS) }),
  );

  await page.route("**/api/library/systems/*/games/*/cover", (route: Route) =>
    route.fulfill({ status: 404 }),
  );

  await page.route("**/api/library/search*", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.SEARCH_RESULTS) }),
  );

  await page.route("**/api/library/systems/scrape-supported", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.SCRAPE_SUPPORTED) }),
  );

  await page.route("**/api/library/path", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.LIBRARY_PATH) }),
  );

  await page.route("**/api/devices/", (route: Route) =>
    errors.devices
      ? route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Internal server error"}' })
      : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(devices) }),
  );

  await page.route("**/api/devices/volumes/discover", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.DISCOVER_VOLUMES) }),
  );

  await page.route("**/api/devices/volumes/status*", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.VOLUME_STATUS) }),
  );

  await page.route("**/api/devices/files?*", (route: Route) => {
    if (route.request().method() === "DELETE") {
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"ok","path":"/readme.txt"}' });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.DEVICE_FILES) });
  });

  await page.route("**/api/devices/games?*", (route: Route) => {
    if (route.request().method() === "DELETE") {
      if (errors.gameRemove) {
        return route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Remove failed"}' });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"ok","name":"game.gba"}' });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.DEVICE_GAME_NAMES_GBA) });
  });

  await page.route("**/api/devices/games/installed*", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.INSTALLED_GAMES) }),
  );

  // Game copy (streaming SSE response)
  await page.route("**/api/devices/games/copy", (route: Route) => {
    if (errors.gameCopy) {
      return route.fulfill({ status: 500, contentType: "text/plain", body: "Copy failed: disk full" });
    }
    const sseBody = `data: {"bytes":4194304,"total":8388608}\n\ndata: {"bytes":8388608,"total":8388608}\n\ndata: {"done":true}\n\n`;
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sseBody,
    });
  });

  // Game remove from device
  await page.route("**/api/devices/games", (route: Route) => {
    if (route.request().method() === "DELETE") {
      if (errors.gameRemove) {
        return route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Remove failed"}' });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"ok","name":"game.gba"}' });
    }
    // GET already handled by **/api/devices/games?* above
    return route.continue();
  });

  // Device file delete
  await page.route("**/api/devices/files", (route: Route) => {
    if (route.request().method() === "DELETE") {
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"ok","path":"/readme.txt"}' });
    }
    return route.continue();
  });

  // Volume eject
  await page.route("**/api/devices/volumes/eject*", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"ok"}' }),
  );

  // Volume register
  await page.route("**/api/devices/volumes/register", (route: Route) => {
    if (route.request().method() === "DELETE") {
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"ok"}' });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixtures.DEVICES[0]),
    });
  });

  // Volume format
  await page.route("**/api/devices/volumes/format", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"status":"ok","filesystem":"exfat","label":"EMUROMS"}',
    }),
  );

  // Volume initialize (streaming SSE)
  await page.route("**/api/devices/volumes/initialize", (route: Route) => {
    const sseBody = `data: {"step":"system","name":"gba","current":1,"total":3,"systems_created":1,"bios_copied":0}\n\ndata: {"step":"done","name":"done","current":3,"total":3,"systems_created":3,"bios_copied":2}\n\n`;
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sseBody,
    });
  });

  // Cover scraping (streaming SSE)
  await page.route("**/api/library/systems/*/scrape-covers", (route: Route) => {
    const sseBody = [
      'data: {"game":"Metroid Fusion","status":"ok","current":1,"total":3,"downloaded":1,"skipped":0,"not_found":0,"errors":0}',
      'data: {"game":"Pokemon Fire Red","status":"skip","current":2,"total":3,"downloaded":1,"skipped":1,"not_found":0,"errors":0}',
      'data: {"game":"Zelda Minish Cap","status":"404","current":3,"total":3,"downloaded":1,"skipped":1,"not_found":1,"errors":0}',
      'data: {"status":"done","current":3,"total":3,"downloaded":1,"skipped":1,"not_found":1,"errors":0}',
    ].join("\n\n") + "\n\n";
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sseBody,
    });
  });
}
