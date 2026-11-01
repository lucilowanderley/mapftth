/**
 * Mapas base usados no app. Todos funcionam sem chave de API.
 * (O CARTO passou a exigir chave e foi removido.)
 */
export interface BaseLayer {
  label: string;
  url: string;
  attribution: string;
  /** Maior zoom em que o servidor tem imagens; acima disso o Leaflet amplia. */
  maxNativeZoom: number;
}

export const BASE_LAYERS = {
  satellite: {
    label: 'Satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagens &copy; Esri',
    maxNativeZoom: 19,
  },
  streets: {
    label: 'Ruas',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    maxNativeZoom: 19,
  },
  dark: {
    label: 'Escuro',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Mapa &copy; Esri',
    maxNativeZoom: 16,
  },
} satisfies Record<string, BaseLayer>;

export type BaseLayerId = keyof typeof BASE_LAYERS;
