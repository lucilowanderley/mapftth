import { useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import type L from 'leaflet';

/**
 * Último enquadramento (centro + zoom) de cada projeto, salvo neste navegador,
 * para o mapa reabrir onde o usuário parou.
 */
export interface SavedView {
  lat: number;
  lng: number;
  zoom: number;
}

const viewKey = (projectId: number) => `mapftth.view.${projectId}`;

export function loadView(projectId: number): SavedView | null {
  try {
    const v = JSON.parse(localStorage.getItem(viewKey(projectId)) ?? 'null') as SavedView | null;
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.zoom) && Math.abs(v.lat) <= 90 && Math.abs(v.lng) <= 180) {
      return v;
    }
  } catch {
    // navegação privada / valor inválido
  }
  return null;
}

export function saveView(projectId: number, v: SavedView) {
  try {
    localStorage.setItem(viewKey(projectId), JSON.stringify(v));
  } catch {
    // ignora
  }
}

/** Salva o enquadramento sempre que o usuário termina de mover ou dar zoom. */
export function RememberView({ projectId }: { projectId: number }) {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      saveView(projectId, { lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    },
  });
  return null;
}

/**
 * Recalcula o tamanho do mapa quando o contêiner muda de tamanho (barra lateral,
 * modal abrindo, janela redimensionada). Sem isso o Leaflet só baixa os tiles da
 * área que tinha no início e o resto fica vazio.
 */
export function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let frame = 0;
    const fix = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    };
    fix();
    const ro = new ResizeObserver(fix);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

const MAX_RETRIES = 3;

/**
 * Tenta de novo os tiles que falharam (servidor lento, limite de requisições,
 * conexão instável). Sem isso o Leaflet deixa o buraco no mapa até o próximo zoom.
 */
export const tileRetryHandlers: L.LeafletEventHandlerFnMap = {
  tileerror: (e) => {
    const ev = e as L.TileErrorEvent;
    const img = ev.tile as HTMLImageElement & { _retries?: number };
    const n = img._retries ?? 0;
    if (n >= MAX_RETRIES) return;
    img._retries = n + 1;
    const layer = ev.target as L.TileLayer;
    setTimeout(() => {
      // o tile pode ter saído da tela enquanto esperava
      if (!img.isConnected) return;
      const url = layer.getTileUrl(ev.coords);
      img.src = `${url}${url.includes('?') ? '&' : '?'}retry=${n + 1}`;
    }, 600 * 2 ** n);
  },
};

/** Opções comuns das camadas de tiles: menos buracos ao arrastar e ao dar zoom. */
export const TILE_OPTIONS = {
  keepBuffer: 4,
  updateWhenZooming: false,
  eventHandlers: tileRetryHandlers,
} as const;
