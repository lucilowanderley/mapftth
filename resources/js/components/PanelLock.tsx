import { Lock, LockOpen, RotateCcw } from 'lucide-react';
import type { FloatPanel } from '../lib/floatpanel';

/** Cadeado (travar/destravar a caixa) e, se ela foi movida, voltar à posição padrão. */
export default function PanelLock({ panel, vertical = false }: { panel: FloatPanel; vertical?: boolean }) {
  const btn = 'rounded p-0.5 cursor-pointer text-slate-400 hover:text-slate-100 hover:bg-slate-800';
  return (
    <div data-no-drag className={`flex ${vertical ? 'flex-col' : ''} items-center gap-0.5`}>
      <button
        type="button"
        onClick={panel.toggleLock}
        className={`${btn} ${panel.locked ? '' : '!text-amber-400'}`}
        title={panel.locked ? 'Caixa travada. Clique para destravar e poder arrastá-la.' : 'Caixa destravada: arraste para mudar de lugar. Clique para travar.'}
        aria-label={panel.locked ? 'Destravar caixa' : 'Travar caixa'}
      >
        {panel.locked ? <Lock size={13} /> : <LockOpen size={13} />}
      </button>
      {panel.moved && (
        <button type="button" onClick={panel.reset} className={btn} title="Voltar a caixa para a posição padrão" aria-label="Posição padrão">
          <RotateCcw size={12} />
        </button>
      )}
    </div>
  );
}
