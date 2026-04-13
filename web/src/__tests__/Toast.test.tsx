import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "../components/Toast";

function TestConsumer() {
  const { toast, confirm } = useToast();
  return (
    <div>
      <button onClick={() => toast("Hello", "success")}>Show Toast</button>
      <button onClick={() => toast("Oops", "error")}>Show Error</button>
      <button
        onClick={async () => {
          const result = await confirm({ message: "Sure?", confirmLabel: "Yes", danger: true });
          // Put result in the DOM so we can assert it
          document.getElementById("confirm-result")!.textContent = String(result);
        }}
      >
        Confirm
      </button>
      <span id="confirm-result" />
    </div>
  );
}

describe("Toast", () => {
  it("renders children", () => {
    render(
      <ToastProvider>
        <span>child</span>
      </ToastProvider>
    );
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("useToast throws outside provider", () => {
    function Bad() {
      useToast();
      return null;
    }
    expect(() => render(<Bad />)).toThrow("useToast must be inside ToastProvider");
  });

  it("shows and auto-dismisses a toast", async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    await act(async () => {
      screen.getByText("Show Toast").click();
    });
    expect(screen.getByText("Hello")).toBeInTheDocument();

    // Advance past the 4s auto-dismiss
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows error toast with error styling", async () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    await act(async () => {
      screen.getByText("Show Error").click();
    });
    expect(screen.getByText("Oops")).toBeInTheDocument();
    const toastEl = screen.getByText("Oops").closest(".toast");
    expect(toastEl?.classList.contains("toast-error")).toBe(true);
  });

  it("confirm dialog resolves true on confirm", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    await user.click(screen.getByText("Confirm"));
    expect(screen.getByText("Sure?")).toBeInTheDocument();
    // Should show danger button with label "Yes"
    const yesBtn = screen.getByText("Yes");
    expect(yesBtn.classList.contains("btn-danger")).toBe(true);
    await user.click(yesBtn);
    expect(screen.getByText("true")).toBeInTheDocument();
  });

  it("confirm dialog resolves false on cancel", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    await user.click(screen.getByText("Confirm"));
    await user.click(screen.getByText("Cancel"));
    expect(screen.getByText("false")).toBeInTheDocument();
  });
});
