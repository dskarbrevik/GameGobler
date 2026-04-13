import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../components/Toast";
import { SettingsPanel } from "../components/SettingsPanel";

// Mock useApi hooks
vi.mock("../hooks/useApi", () => ({
  useSettings: vi.fn(),
  useUpdateSettings: vi.fn(),
}));

import { useSettings, useUpdateSettings } from "../hooks/useApi";

const mockUseSettings = vi.mocked(useSettings);
const mockUseUpdateSettings = vi.mocked(useUpdateSettings);

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <SettingsPanel />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("SettingsPanel", () => {
  it("shows loading state", () => {
    mockUseSettings.mockReturnValue({ data: undefined, isLoading: true } as ReturnType<typeof useSettings>);
    mockUseUpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false, isSuccess: false } as unknown as ReturnType<typeof useUpdateSettings>);
    renderPanel();
    expect(screen.getByText("Loading settings...")).toBeInTheDocument();
  });

  it("renders form with loaded settings", () => {
    mockUseSettings.mockReturnValue({
      data: { library_path: "/roms", unzip_on_transfer: true },
      isLoading: false,
    } as ReturnType<typeof useSettings>);
    mockUseUpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false, isSuccess: false } as unknown as ReturnType<typeof useUpdateSettings>);
    renderPanel();
    const input = screen.getByPlaceholderText("/path/to/roms") as HTMLInputElement;
    expect(input.value).toBe("/roms");
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("calls mutate on save", async () => {
    const mutateFn = vi.fn();
    mockUseSettings.mockReturnValue({
      data: { library_path: "", unzip_on_transfer: false },
      isLoading: false,
    } as ReturnType<typeof useSettings>);
    mockUseUpdateSettings.mockReturnValue({ mutate: mutateFn, isPending: false, isSuccess: false } as unknown as ReturnType<typeof useUpdateSettings>);

    const user = userEvent.setup();
    renderPanel();

    const input = screen.getByPlaceholderText("/path/to/roms");
    await user.clear(input);
    await user.type(input, "/my/roms");

    await user.click(screen.getByText("Save Settings"));
    expect(mutateFn).toHaveBeenCalledWith({
      library_path: "/my/roms",
      unzip_on_transfer: false,
    });
  });

  it("shows success message after save", () => {
    mockUseSettings.mockReturnValue({
      data: { library_path: "/roms" },
      isLoading: false,
    } as ReturnType<typeof useSettings>);
    mockUseUpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false, isSuccess: true } as unknown as ReturnType<typeof useUpdateSettings>);
    renderPanel();
    expect(screen.getByText(/Saved to/)).toBeInTheDocument();
  });

  it("disables save button while pending", () => {
    mockUseSettings.mockReturnValue({
      data: { library_path: "/roms" },
      isLoading: false,
    } as ReturnType<typeof useSettings>);
    mockUseUpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: true, isSuccess: false } as unknown as ReturnType<typeof useUpdateSettings>);
    renderPanel();
    const btn = screen.getByText("Save Settings").closest("button");
    expect(btn).toBeDisabled();
  });
});
