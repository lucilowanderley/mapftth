import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Caixas flutuantes do mapa que podem ser travadas (cadeado fechado, posição fixa)
 * ou destravadas (arrasta-se a caixa para outro lugar). A posição e o estado do
 * cadeado ficam no navegador (localStorage mapftth.panel.<id>), valem para todos os
 * projetos e são mantidos dentro da área do mapa.
 */
export interface PanelState {
  locked: boolean;
  /** Canto superior esquerdo da caixa em px, relativo à área do mapa; null = posição padrão. */
  pos: { x: number; y: number } | null;
}

const MARGIN = 8;
/** Distância mínima (px) para um clique virar arraste. */
const DRAG_THRESHOLD = 4;

const storageKey = (id: string) => `mapftth.panel.${id}`;

export function loadPanel(id: string): PanelState {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(id)) ?? 'null');
    if (raw && typeof raw === 'object') {
      const pos = raw.pos && Number.isFinite(raw.pos.x) && Number.isFinite(raw.pos.y) ? { x: raw.pos.x, y: raw.pos.y } : null;
      return { locked: raw.locked !== false, pos };
    }
  } catch {
    /* sem localStorage ou valor inválido: usa o padrão */
  }
  return { locked: true, pos: null };
}

export function savePanel(id: string, s: PanelState) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(s));
  } catch {
    /* ignora */
  }
}

/** Mantém a caixa (w×h) dentro da área (cw×ch), com uma pequena margem. */
export function clampPos(x: number, y: number, w: number, h: number, cw: number, ch: number) {
  return {
    x: Math.round(Math.max(MARGIN, Math.min(x, cw - w - MARGIN))),
    y: Math.round(Math.max(MARGIN, Math.min(y, ch - h - MARGIN))),
  };
}

/** Elementos dentro da caixa em que o arraste nunca começa (campos de texto etc.). */
const NO_DRAG = 'input, select, textarea, [data-no-drag]';

/**
 * Liga o arraste a uma caixa. `boxRef` é o elemento visível (medido para limitar à tela);
 * `style` vai no elemento posicionado (absolute) que o contém. O arraste pode começar em
 * qualquer ponto da caixa, inclusive sobre um botão: só vira arraste depois de alguns
 * pixels, e aí o clique do botão é cancelado.
 */
export function useFloatPanel(id: string) {
  const [state, setState] = useState<PanelState>(() => loadPanel(id));
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const update = useCallback(
    (s: PanelState) => {
      setState(s);
      savePanel(id, s);
    },
    [id],
  );

  /** Área do mapa: o elemento marcado com data-float-area, em relação ao qual a caixa é posicionada. */
  const area = () => {
    const box = boxRef.current;
    const parent = box?.closest('[data-float-area]') as HTMLElement | null;
    return box && parent ? { box, parent } : null;
  };

  // Ao redimensionar a janela/área do mapa, puxa a caixa de volta para dentro.
  useEffect(() => {
    const a = area();
    if (!a) return;
    const fit = () => {
      const s = stateRef.current;
      if (!s.pos || !boxRef.current) return;
      const b = boxRef.current.getBoundingClientRect();
      const p = a.parent.getBoundingClientRect();
      const c = clampPos(s.pos.x, s.pos.y, b.width, b.height, p.width, p.height);
      if (c.x !== s.pos.x || c.y !== s.pos.y) update({ ...s, pos: c });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(a.parent);
    ro.observe(a.box);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (state.locked || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(NO_DRAG)) return;
    const a = area();
    if (!a) return;
    const p = a.parent.getBoundingClientRect();
    const b = a.box.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const offX = b.left - p.left;
    const offY = b.top - p.top;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!moved) {
        moved = true;
        setDragging(true);
      }
      const pr = a.parent.getBoundingClientRect();
      const br = a.box.getBoundingClientRect();
      const pos = clampPos(offX + dx, offY + dy, br.width, br.height, pr.width, pr.height);
      setState((s) => ({ ...s, pos }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!moved) return;
      setDragging(false);
      savePanel(id, stateRef.current);
      // Cancela o clique que o navegador dispara ao soltar sobre um botão.
      const swallow = (ce: MouseEvent) => {
        ce.stopPropagation();
        ce.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const style: CSSProperties | undefined = state.pos ? { left: state.pos.x, top: state.pos.y, right: 'auto', bottom: 'auto', transform: 'none', translate: 'none' } : undefined;

  return {
    locked: state.locked,
    /** true quando a caixa saiu da posição padrão. */
    moved: !!state.pos,
    dragging,
    boxRef,
    style,
    onPointerDown,
    toggleLock: () => update({ ...state, locked: !state.locked }),
    /** Volta à posição padrão; só com o cadeado aberto. */
    reset: () => {
      if (!state.locked) update({ ...state, pos: null });
    },
  };
}

export type FloatPanel = ReturnType<typeof useFloatPanel>;
