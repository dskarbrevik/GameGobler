import { test, expect } from "@playwright/test";
import { mockApi } from "../mock-api";
import * as fixtures from "../fixtures";

test.describe("Game Transfer Workflows", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // Select device and switch to games view
    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");
    await page.locator(".toggle-btn", { hasText: "Games" }).click();
    await page.waitForLoadState("networkidle");
    // Select gba system
    await page.locator(".system-item", { hasText: "gba" }).click();
    await page.waitForLoadState("networkidle");
  });

  test("copy game shows progress bar then completes", async ({ page }) => {
    // Override game copy with a delayed response so the progress bar is visible
    await page.route("**/api/devices/games/copy", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      const sseBody =
        'data: {"bytes":4194304,"total":8388608}\n\ndata: {"bytes":8388608,"total":8388608}\n\ndata: {"done":true}\n\n';
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseBody,
      });
    });

    // Click add on a game that's not on device
    const addBtn = page.locator(".btn-add").first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Progress indicator should appear while copy is in-flight
    await expect(page.locator(".copy-progress-wrap").first()).toBeVisible({ timeout: 2000 });

    // After the delayed response completes, the game should be marked as on-device
    await expect(page.locator(".copy-progress-wrap")).not.toBeVisible({ timeout: 5000 });
  });

  test("copy game progress visual snapshot", async ({ page }) => {
    // Override game copy with a long delay to capture the progress bar
    await page.route("**/api/devices/games/copy", async (route) => {
      await new Promise((r) => setTimeout(r, 10000)); // Long delay — we take screenshot before it resolves
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'data: {"done":true}\n\n',
      });
    });

    await page.locator(".btn-add").first().click();
    await expect(page.locator(".copy-progress-wrap").first()).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot("game-copy-progress.png");
  });

  test("remove game from device", async ({ page }) => {
    // Verify there's at least one remove button (for games on device — Metroid Fusion)
    const removeBtn = page.locator(".btn-small.btn-danger").first();
    await expect(removeBtn).toBeVisible({ timeout: 5000 });

    // Click remove — should show confirmation dialog
    await removeBtn.click();
    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toBeVisible({ timeout: 2000 });
    await expect(dialog).toContainText("Remove");

    // Confirm the removal
    await dialog.locator("button.btn-danger").click();

    // Wait briefly for the removal to process (mock returns instantly)
    await page.waitForTimeout(500);
  });

  test("game stats show device count", async ({ page }) => {
    // Game stats should show installed vs total count
    const stats = page.locator(".game-stats");
    await expect(stats).toBeVisible();
    await expect(stats).toContainText(/\d+ \/ \d+ on device/);
  });
});

test.describe("File Delete Workflow", () => {
  test("confirms and executes file delete", async ({ page }) => {
    await mockApi(page);

    // Override the file route to handle both GET and DELETE properly
    await page.route("**/api/devices/files?*", (route) => {
      if (route.request().method() === "DELETE") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"status":"ok","path":"/readme.txt"}',
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixtures.DEVICE_FILES),
      });
    });

    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // Select device to show file browser
    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");

    // Click delete on readme.txt
    const fileRow = page.locator(".file-row", { hasText: "readme.txt" });
    await fileRow.locator("[title='Delete from device']").click();

    // Confirm the dialog
    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Delete "readme.txt"');
    await dialog.locator("button", { hasText: "Delete" }).click();

    // Dialog should close after confirming
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });
});
