import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("App", () => {
  it("renders the sidebar brand", () => {
    renderWithProviders(<App />);
    expect(screen.getByText("GameGobler")).toBeInTheDocument();
  });

  it("renders navigation buttons", () => {
    renderWithProviders(<App />);
    const navButtons = screen.getAllByRole("button");
    const navLabels = navButtons.map((btn) => btn.textContent);
    expect(navLabels).toContain("Devices");
    expect(navLabels).toContain("Library");
    expect(navLabels).toContain("Transfer");
    expect(navLabels).toContain("Settings");
  });

  it("shows devices tab by default", () => {
    renderWithProviders(<App />);
    expect(screen.getByText("Scanning for devices...")).toBeInTheDocument();
  });
});
