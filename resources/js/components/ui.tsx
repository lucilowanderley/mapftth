import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="w-7 h-7 text-emerald-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
        <circle cx="16" cy="16" r="3" fill="currentColor" />
        <path d="M16 13V4M16 19v9M13 16H4M19 16h9M9 9l4.5 4.5M23 23l-4.5-4.5" />
      </svg>
      {!compact && (
        <span className="text-lg font-semibold tracking-tight">
          Map<span className="text-emerald-400">FTTH</span>
        </span>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, width = 'max-w-md' }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className={`panel w-full ${width} max-h-[90vh] flex flex-col`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/** inline: renderiza no fluxo (ex.: colado abaixo da barra de ferramentas do mapa) em vez de fixo no topo da tela. */
export function Toast({ message, kind = 'ok', onClose, inline = false }: { message: string; kind?: 'ok' | 'error'; onClose: () => void; inline?: boolean }) {
  return (
    <div
      className={`${inline ? 'pointer-events-auto max-w-full' : 'fixed top-4 left-1/2 -translate-x-1/2 z-[3000]'} rounded-lg px-4 py-2 text-sm shadow-lg flex items-center gap-3 ${
        kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
      }`}
    >
      {message}
      <button onClick={onClose} className="opacity-80 hover:opacity-100 cursor-pointer" aria-label="Fechar">
        <X size={14} />
      </button>
    </div>
  );
}

export function formatLength(m: number | null | undefined) {
  const v = Number(m ?? 0);
  return v >= 1000 ? `${(v / 1000).toFixed(2)} km` : `${Math.round(v)} m`;
}
