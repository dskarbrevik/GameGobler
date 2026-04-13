import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../components/Toast";
import App from "../App";

// Mock the fetch calls so the App gets past the settings gate
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/api/settings")) {
      return Promise.resolve(
        new Response(JSON.stringify({ library_path: "/tmp/roms", schema_version: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/version")) {
      return Promise.resolve(
        new Response(JSON.stringify({ version: "0.1.0", latest: null, update_available: false, release_url: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/devices")) {
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/library/systems")) {
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response("Not Found", { status: 404 }));
  });
});

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("App", () => {
  it("renders the sidebar brand", async () => {
    renderWithProviders(<App />);
    expect(await screen.findByText("GameGobler")).toBeInTheDocument();
  });

  it("renders navigation links", async () => {
    renderWithProviders(<App />);
    await waitFor(() => {
      const navLinks = screen.getAllByRole("link");
      const navLabels = navLinks.map((el) => el.textContent);
      expect(navLabels).toContain("Devices");
      expect(navLabels).toContain("Library");
      expect(navLabels).toContain("Settings");
    });
  });

  it("shows devices tab by default", async () => {
    renderWithProviders(<App />);
    // After settings load, devices page renders with empty device list
    expect(await screen.findByText("Devices")).toBeInTheDocument();
  });

  it("shows setup wizard when library_path is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/settings")) {
        return Promise.resolve(
          new Response(JSON.stringify({ library_path: "", schema_version: 1 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    });

    renderWithProviders(<App />);
    expect(await screen.findByText("Welcome to GameGobler")).toBeInTheDocument();
  });
});
