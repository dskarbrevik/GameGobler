import { test, expect } from "@playwright/test";
import { mockApi } from "../mock-api";
import * as fixtures from "../fixtures";

test.describe("Device Workflows", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");
  });

  test("discover modal shows volume candidates", async ({ page }) => {
    await page.locator("[title='Add volume device']").click();

    const discover = page.locator(".discover-panel");
    await expect(discover).toBeVisible();
    await expect(discover.locator("text=Add Volume Device")).toBeVisible();
    await expect(discover.locator(".discover-item")).toHaveCount(2);
    await expect(discover.locator(".discover-label", { hasText: "EMUROMS" })).toBeVisible();
    await expect(discover.locator(".discover-label", { hasText: "SANDISK" })).toBeVisible();
  });

  test("register volume from discover panel", async ({ page }) => {
    await page.locator("[title='Add volume device']").click();
    await expect(page.locator(".discover-panel")).toBeVisible();

    // Click "Add" on the first candidate
    const firstCandidate = page.locator(".discover-item").first();
    await firstCandidate.locator("button", { hasText: "Add" }).click();

    // Candidate should be removed from the list after registration
    await expect(page.locator(".discover-item")).toHaveCount(1);
  });

  test("close discover modal", async ({ page }) => {
    await page.locator("[title='Add volume device']").click();
    await expect(page.locator(".discover-panel")).toBeVisible();

    // Click close button
    await page.locator(".discover-header .btn-icon").click();
    await expect(page.locator(".discover-panel")).not.toBeVisible();
  });

  test("discover shows no results when empty", async ({ page }) => {
    // Override discover to return empty
    await page.route("**/api/devices/volumes/discover", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );

    await page.locator("[title='Add volume device']").click();
    await expect(page.locator(".discover-panel")).toBeVisible();
    await expect(page.locator("text=No new volumes found")).toBeVisible();
  });

  test("format volume prompts label and confirms", async ({ page }) => {
    // Select the device
    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Format exFAT" }).click();

    // Step 1: in-app label prompt dialog
    const labelDialog = page.locator(".confirm-dialog");
    await expect(labelDialog).toBeVisible({ timeout: 2000 });
    await expect(labelDialog.locator("input[type='text']")).toBeVisible();
    // Accept the default label
    await labelDialog.locator("button", { hasText: "OK" }).click();

    // Step 2: danger confirmation dialog
    const confirmDialog = page.locator(".confirm-dialog");
    await expect(confirmDialog).toBeVisible({ timeout: 2000 });
    await expect(confirmDialog).toContainText("FORMAT will ERASE ALL DATA");
    await expect(confirmDialog.locator("button", { hasText: "Format" })).toBeVisible();

    // Confirm the format
    await confirmDialog.locator("button", { hasText: "Format" }).click();

    // Success toast should appear
    await expect(page.locator(".toast-success")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".toast-success")).toContainText("formatted");
  });

  test("initialize ES-DE with confirm and success", async ({ page }) => {
    // Select the device
    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Initialize ES-DE" }).click();

    // Confirm dialog
    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Initialize");
    await expect(dialog).toContainText("ES-DE folders and BIOS files");

    // Confirm
    await dialog.locator("button", { hasText: "Initialize" }).click();

    // Success toast
    await expect(page.locator(".toast-success")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".toast-success")).toContainText("initialized");
  });

  test("discover panel visual snapshot", async ({ page }) => {
    await page.locator("[title='Add volume device']").click();
    await expect(page.locator(".discover-panel")).toBeVisible();
    await expect(page).toHaveScreenshot("discover-panel.png");
  });
});
