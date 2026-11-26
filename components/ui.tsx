'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { IconType } from 'react-icons';
import { IoChevronForward, IoCloseCircle, IoEyeOffOutline, IoEyeOutline } from 'react-icons/io5';

// ─── Bottom sheet (equivalente aos Modals "slide" do app) ─────────────────────

export function Sheet({
  open, onClose, title, subtitle, children, footer, variant, className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  variant?: 'expense';
  className?: string;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="backdrop" onClick={onClose} />
      <div className={`sheet ${variant === 'expense' ? 'sheet-expense' : ''} ${className ?? ''}`}>
        <div className="sheet-handle" />
        {title !== undefined && (
          <div className="sheet-header">
            <div>
              <h2 className="sheet-title">{title}</h2>
              {subtitle ? <div className="sheet-subtitle">{subtitle}</div> : null}
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Fechar">
              <IoCloseCircle size={24} />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer}
      </div>
    </div>
  );
}

export type ActionItem = {
  icon?: IconType;
  label: string;
  onClick: () => void;
  tone?: 'danger' | 'accent';
};

export function ActionSheet({
  open, onClose, title, actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  actions: ActionItem[];
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="backdrop" onClick={onClose} />
      <div className="sheet action-sheet">
        <div className="sheet-handle" />
        <div className="action-title">{title}</div>
        {actions.map(a => (
          <button key={a.label} className={`action-option ${a.tone ?? ''}`} onClick={a.onClick}>
            {a.icon ? <a.icon size={20} /> : null}
            <span>{a.label}</span>
          </button>
        ))}
        <button className="action-option muted action-cancel" onClick={onClose}>
          <span>Cancelar</span>
        </button>
      </div>
    </div>
  );
}

export function OptionRow({
  icon: Icon, label, onClick, detail, count,
}: { icon: IconType; label: string; onClick: () => void; detail?: string; count?: number }) {
  return (
    <button className="option-row" onClick={onClick}>
      <span className="option-icon"><Icon size={20} /></span>
      <span className="option-label">{label}</span>
      {detail ? <span className="option-detail">{detail}</span> : null}
      {count ? <span className="option-count">{count > 99 ? '99+' : count}</span> : null}
      <IoChevronForward size={18} className="muted" />
    </button>
  );
}

export function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

export function PasswordInput({
  value, onChange, autoComplete = 'off', required, minLength, placeholder, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-wrap">
      <input
        className="input"
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={e => { e.preventDefault(); setVisible(v => !v); }}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visible}
        title={visible ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {visible ? <IoEyeOffOutline size={20} /> : <IoEyeOutline size={20} />}
      </button>
    </span>
  );
}

export function Field({
  label, value, onChange, placeholder, inputMode, type = 'text', maxLength, autoFocus, autoComplete,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  type?: string;
  maxLength?: number;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="field">
      {label ? <span className="field-label">{label}</span> : null}
      {type === 'password' ? (
        <PasswordInput value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} autoComplete={autoComplete} />
      ) : (
        <input
          className="input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          type={type}
          maxLength={maxLength}
          autoFocus={autoFocus}
          autoComplete={autoComplete ?? 'off'}
        />
      )}
    </label>
  );
}

export function PageHeader({
  sub, title, right,
}: { sub: string; title: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <div className="header-sub">{sub}</div>
        <h1 className="header-title">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function EmptyState({ icon: Icon, title, sub }: { icon: IconType; title: string; sub: string }) {
  return (
    <div className="empty-state">
      <Icon size={52} />
      <div className="empty-title">{title}</div>
      <div className="empty-sub">{sub}</div>
    </div>
  );
}

function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClose]);
}

// ─── Toque longo (equivalente ao onLongPress) ────────────────────────────────

export function useLongPress(onLongPress: () => void, ms = 350) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(15);
        onLongPress();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clear();
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    // Botão direito no computador também entra no modo seleção
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clear();
      onLongPress();
    },
    /** true se o último toque disparou o long press (para ignorar o click seguinte) */
    consumed: () => {
      const f = fired.current;
      fired.current = false;
      return f;
    },
  };
}

// ─── Diálogos (confirmação / aviso) ──────────────────────────────────────────

type DialogReq = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  danger?: boolean;
  resolve: (ok: boolean) => void;
};

const DialogContext = createContext<{
  confirm: (o: Omit<DialogReq, 'resolve'>) => Promise<boolean>;
  alert: (title: string, message?: string) => Promise<void>;
} | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<DialogReq | null>(null);

  const confirm = useCallback(
    (o: Omit<DialogReq, 'resolve'>) => new Promise<boolean>(resolve => setReq({ ...o, resolve })),
    [],
  );
  const alert = useCallback(
    (title: string, message?: string) =>
      new Promise<void>(resolve =>
        setReq({ title, message, confirmLabel: 'OK', cancelLabel: null, resolve: () => resolve() })),
    [],
  );

  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { req.resolve(false); setReq(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {req && (
        <div className="dialog-overlay" role="alertdialog" aria-modal="true">
          <div className="dialog">
            <div className="dialog-title">{req.title}</div>
            {req.message ? <div className="dialog-message">{req.message}</div> : null}
            <div className="dialog-actions">
              {req.cancelLabel !== null && (
                <button className="dialog-btn" onClick={() => close(false)}>
                  {req.cancelLabel ?? 'Cancelar'}
                </button>
              )}
              <button
                className={`dialog-btn ${req.danger ? 'danger' : 'primary'}`}
                onClick={() => close(true)}
                autoFocus
              >
                {req.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog fora do DialogProvider');
  return ctx;
}
