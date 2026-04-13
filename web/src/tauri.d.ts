/** Tauri injects `__TAURI_INTERNALS__` on the window object at runtime. */
interface Window {
  __TAURI_INTERNALS__?: Record<string, unknown>;
}
