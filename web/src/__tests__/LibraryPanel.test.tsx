import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../components/Toast";
import { LibraryPanel } from "../components/LibraryPanel";
import type { SystemInfo } from "../types";

function renderPanel(props: { systems: SystemInfo[]; isLoading: boolean }, route = "/library") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <LibraryPanel {...props} />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const SYSTEMS: SystemInfo[] = [
  { name: "nes", path: "/roms/nes", game_count: 42, total_size: 5242880 },
  { name: "snes", path: "/roms/snes", game_count: 10, total_size: 2097152 },
  { name: "n64", path: "/roms/n64", game_count: 0, total_size: 0 },
];

describe("LibraryPanel", () => {
  it("shows loading state", () => {
    renderPanel({ systems: [], isLoading: true });
    expect(screen.getByText("Loading library...")).toBeInTheDocument();
  });

  it("shows empty state when no systems", () => {
    renderPanel({ systems: [], isLoading: false });
    expect(screen.getByText("No ROM systems found")).toBeInTheDocument();
  });

  it("renders system tiles for populated systems", () => {
    renderPanel({ systems: SYSTEMS, isLoading: false });
    expect(screen.getByText("NES")).toBeInTheDocument();
    expect(screen.getByText("SNES")).toBeInTheDocument();
    expect(screen.getByText("42 games")).toBeInTheDocument();
    expect(screen.getByText("10 games")).toBeInTheDocument();
  });

  it("hides empty systems by default", () => {
    renderPanel({ systems: SYSTEMS, isLoading: false });
    expect(screen.queryByText("N64")).not.toBeInTheDocument();
    expect(screen.getByText(/Show 1 empty system/)).toBeInTheDocument();
  });

  it("shows empty systems when toggled", async () => {
    const user = userEvent.setup();
    renderPanel({ systems: SYSTEMS, isLoading: false });
    await user.click(screen.getByText(/Show 1 empty system/));
    expect(screen.getByText("N64")).toBeInTheDocument();
  });

  it("shows all-empty state when every system has 0 games", () => {
    const empty: SystemInfo[] = [
      { name: "nes", path: "/roms/nes", game_count: 0, total_size: 0 },
    ];
    renderPanel({ systems: empty, isLoading: false });
    expect(screen.getByText(/All 1 system folders are empty/)).toBeInTheDocument();
  });

  it("displays formatted sizes on tiles", () => {
    renderPanel({ systems: SYSTEMS, isLoading: false });
    expect(screen.getByText("5.0 MB")).toBeInTheDocument();
    expect(screen.getByText("2.0 MB")).toBeInTheDocument();
  });
});
