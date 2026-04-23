import { createContext, useContext, useState, useCallback, useRef } from "react";
import { X, CheckCircle, AlertTriangle, XCircle, Info } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  message: string;
  defaultValue?: string;
  placeholder?: string;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);
  const [inputDialog, setInputDialog] = useState<{
    opts: PromptOptions;
    resolve: (v: string | null) => void;
  } | null>(null);
  const [inputValue, setInputValue] = useState("");
  const nextId = useRef(0);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const confirmFn = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({ opts, resolve });
    });
  }, []);

  const promptFn = useCallback((opts: PromptOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      setInputValue(opts.defaultValue ?? "");
      setInputDialog({ opts, resolve });
    });
  }, []);

  const handleConfirm = (result: boolean) => {
    dialog?.resolve(result);
    setDialog(null);
  };

  const handleInputConfirm = (confirmed: boolean) => {
    inputDialog?.resolve(confirmed ? inputValue : null);
    setInputDialog(null);
  };

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle size={16} />,
    error: <XCircle size={16} />,
    warning: <AlertTriangle size={16} />,
    info: <Info size={16} />,
  };

  return (
    <ToastContext.Provider value={{ toast: addToast, confirm: confirmFn, prompt: promptFn }}>
      {children}

      {/* Toast stack — role="status" announces new toasts to screen readers */}
      <div className="toast-container" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {icons[t.type]}
            <span className="toast-message">{t.message}</span>
            <button
              className="toast-close"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {dialog && (
        <div className="confirm-overlay" onClick={() => handleConfirm(false)}>
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={dialog.opts.message}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Escape") handleConfirm(false); }}
          >
            <p className="confirm-message">{dialog.opts.message}</p>
            <div className="confirm-actions">
              <button className="btn-small" onClick={() => handleConfirm(false)}>
                Cancel
              </button>
              <button
                className={`btn-small ${dialog.opts.danger ? "btn-danger" : "btn-add"}`}
                onClick={() => handleConfirm(true)}
                autoFocus
              >
                {dialog.opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt dialog — in-app text input, replaces window.prompt() */}
      {inputDialog && (
        <div className="confirm-overlay" onClick={() => handleInputConfirm(false)}>
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={inputDialog.opts.message}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="confirm-message">{inputDialog.opts.message}</p>
            <input
              className="settings-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={inputDialog.opts.placeholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleInputConfirm(true); }
                if (e.key === "Escape") { e.stopPropagation(); handleInputConfirm(false); }
              }}
              autoFocus
              style={{ marginBottom: "16px" }}
            />
            <div className="confirm-actions">
              <button className="btn-small" onClick={() => handleInputConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn-small btn-add"
                onClick={() => handleInputConfirm(true)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

