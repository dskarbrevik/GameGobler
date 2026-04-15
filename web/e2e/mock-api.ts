import { type Page, type Route } from "@playwright/test";
import * as fixtures from "./fixtures";

type MockOverrides = {
  settings?: typeof fixtures.SETTINGS | typeof fixtures.SETTINGS_EMPTY;
  version?: typeof fixtures.VERSION;
  systems?: typeof fixtures.SYSTEMS;
  devices?: typeof fixtures.DEVICES;
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

  await page.route("**/api/health", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );

  await page.route("**/api/settings", async (route: Route) => {
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
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(devices) }),
  );

  await page.route("**/api/devices/volumes/discover", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.DISCOVER_VOLUMES) }),
  );

  await page.route("**/api/devices/volumes/status*", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.VOLUME_STATUS) }),
  );

  await page.route("**/api/devices/files?*", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.DEVICE_FILES) }),
  );

  await page.route("**/api/devices/games?*", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.DEVICE_GAMES_GBA) }),
  );

  await page.route("**/api/devices/games/installed*", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.INSTALLED_GAMES) }),
  );
}
