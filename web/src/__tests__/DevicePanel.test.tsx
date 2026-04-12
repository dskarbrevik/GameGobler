import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DevicePanel } from "../components/DevicePanel";
import type { DeviceInfo } from "../types";

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
  );
}

const noop = () => {};

describe("DevicePanel", () => {
  it("shows loading state", () => {
    renderWithProviders(
      <DevicePanel devices={[]} selected={null} onSelect={noop} isLoading />
    );
    expect(screen.getByText("Scanning for devices...")).toBeInTheDocument();
  });

  it("shows empty state when no devices", () => {
    renderWithProviders(
      <DevicePanel
        devices={[]}
        selected={null}
        onSelect={noop}
        isLoading={false}
      />
    );
    expect(screen.getByText("No devices connected")).toBeInTheDocument();
  });

  it("renders device cards", () => {
    const devices: DeviceInfo[] = [
      {
        device_id: "abc123",
        storage: {
          internal: { path: "/data", free: 1073741824, total: 8589934592 },
        },
      },
    ];
    renderWithProviders(
      <DevicePanel
        devices={devices}
        selected={null}
        onSelect={noop}
        isLoading={false}
      />
    );
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByText("internal")).toBeInTheDocument();
  });
});
