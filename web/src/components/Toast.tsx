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

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
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

  const handleConfirm = (result: boolean) => {
    dialog?.resolve(result);
    setDialog(null);
  };

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle size={16} />,
    error: <XCircle size={16} />,
    warning: <AlertTriangle size={16} />,
    info: <Info size={16} />,
  };

  return (
    <ToastContext.Provider value={{ toast: addToast, confirm: confirmFn }}>
      {children}

      {/* Toast stack */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {icons[t.type]}
            <span className="toast-message">{t.message}</span>
            <button className="toast-close" onClick={() => removeToast(t.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {dialog && (
        <div className="confirm-overlay" onClick={() => handleConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
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
    </ToastContext.Provider>
  );
}
