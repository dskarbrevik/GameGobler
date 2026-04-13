import { useEffect, useState } from "react";

const HEALTH_URL =
  typeof window !== "undefined" && window.__TAURI_INTERNALS__
    ? "http://127.0.0.1:8000/api/health"
    : "/api/health";

const MAX_ATTEMPTS = 30; // ~15 seconds at 500ms intervals

/**
 * Polls the backend health endpoint until it responds OK.
 * Shows a splash screen while waiting, then renders children.
 */
export function BackendGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;

    async function check() {
      while (!cancelled && attempt < MAX_ATTEMPTS) {
        try {
          const res = await fetch(HEALTH_URL);
          if (res.ok) {
            if (!cancelled) setReady(true);
            return;
          }
        } catch {
          // Backend not ready yet
        }
        attempt++;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!cancelled) setError(true);
    }

    void check();
    return () => { cancelled = true; };
  }, []);

  if (ready) return <>{children}</>;

  return (
    <div className="splash">
      <div className="splash-content">
        <div className="splash-icon">🎮</div>
        <h1 className="splash-title">GameGobler</h1>
        {error ? (
          <p className="splash-status splash-error">
            Could not connect to backend. Please restart the app.
          </p>
        ) : (
          <>
            <div className="splash-spinner" />
            <p className="splash-status">Starting up…</p>
          </>
        )}
      </div>
    </div>
  );
}
