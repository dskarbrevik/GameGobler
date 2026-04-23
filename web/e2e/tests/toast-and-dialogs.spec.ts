import { test, expect } from "@playwright/test";
import { mockApi } from "../mock-api";
import * as fixtures from "../fixtures";

test.describe("Toast Notifications", () => {
  test("settings save shows success toast", async ({ page }) => {
    await mockApi(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Save Settings" }).click();
    // The success message appears inline (not a toast — it's .success-msg)
    await expect(page.locator(".success-msg")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".success-msg")).toContainText("Saved");
  });

  test("eject device shows success toast", async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // Click eject button on the device
    await page.locator("[title='Eject device']").click();

    // Confirm the dialog
    await expect(page.locator(".confirm-dialog")).toBeVisible();
    await page.locator(".confirm-dialog button", { hasText: "Eject" }).click();

    await expect(page.locator(".toast-success")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".toast-success")).toContainText("ejected");
  });

  test("toast auto-dismisses after timeout", async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // Trigger a toast via eject
    await page.locator("[title='Eject device']").click();
    await expect(page.locator(".confirm-dialog")).toBeVisible();
    await page.locator(".confirm-dialog button", { hasText: "Eject" }).click();

    await expect(page.locator(".toast-success")).toBeVisible({ timeout: 5000 });
    // Toast auto-dismisses after 4s
    await expect(page.locator(".toast-success")).not.toBeVisible({ timeout: 6000 });
  });

  test("toast close button dismisses immediately", async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator("[title='Eject device']").click();
    await expect(page.locator(".confirm-dialog")).toBeVisible();
    await page.locator(".confirm-dialog button", { hasText: "Eject" }).click();

    const toast = page.locator(".toast-success");
    await expect(toast).toBeVisible({ timeout: 5000 });

    // Click the close button
    await toast.locator(".toast-close").click();
    await expect(toast).not.toBeVisible({ timeout: 1000 });
  });

  test("toast visual snapshot", async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    await page.locator("[title='Eject device']").click();
    await expect(page.locator(".confirm-dialog")).toBeVisible();
    await page.locator(".confirm-dialog button", { hasText: "Eject" }).click();

    await expect(page.locator(".toast-success")).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot("toast-success.png");
  });
});

test.describe("Confirmation Dialogs", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");
  });

  test("eject shows confirm dialog", async ({ page }) => {
    await page.locator("[title='Eject device']").click();

    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Safely eject this device?");
    await expect(dialog.locator("button", { hasText: "Cancel" })).toBeVisible();
    await expect(dialog.locator("button", { hasText: "Eject" })).toBeVisible();
  });

  test("cancel dismisses confirm dialog without action", async ({ page }) => {
    await page.locator("[title='Eject device']").click();

    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toBeVisible();

    await dialog.locator("button", { hasText: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();
    // Device should still be shown
    await expect(page.locator(".device-card", { hasText: "EMUROMS" })).toBeVisible();
  });

  test("clicking overlay dismisses confirm dialog", async ({ page }) => {
    await page.locator("[title='Eject device']").click();

    await expect(page.locator(".confirm-dialog")).toBeVisible();
    // Click the overlay (outside the dialog)
    await page.locator(".confirm-overlay").click({ position: { x: 10, y: 10 } });
    await expect(page.locator(".confirm-dialog")).not.toBeVisible();
  });

  test("remove device shows confirm dialog", async ({ page }) => {
    await page.locator("[title='Remove device']").click();

    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Remove this device?");
  });

  test("confirm dialog visual snapshot", async ({ page }) => {
    await page.locator("[title='Eject device']").click();
    await expect(page.locator(".confirm-dialog")).toBeVisible();
    await expect(page).toHaveScreenshot("confirm-dialog-eject.png");
  });

  test("file delete shows danger confirm dialog", async ({ page }) => {
    // Select device and browse files
    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");

    // Click delete on a file (readme.txt)
    const deleteBtn = page.locator(".file-row", { hasText: "readme.txt" }).locator("[title='Delete from device']");
    await deleteBtn.click();

    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Delete "readme.txt" from device?');
    await expect(dialog.locator("button", { hasText: "Delete" })).toBeVisible();
  });

  test("danger confirm dialog visual snapshot", async ({ page }) => {
    await page.locator(".device-card", { hasText: "EMUROMS" }).click();
    await page.waitForLoadState("networkidle");

    const deleteBtn = page.locator(".file-row", { hasText: "readme.txt" }).locator("[title='Delete from device']");
    await deleteBtn.click();

    await expect(page.locator(".confirm-dialog")).toBeVisible();
    await expect(page).toHaveScreenshot("confirm-dialog-delete.png");
  });
});
