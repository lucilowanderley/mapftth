/**
 * Mapas base usados no app.
 * - Esri e OpenStreetMap/OpenTopoMap funcionam sem chave de API.
 * - Google usa a Map Tiles API oficial e só aparece quando GOOGLE_MAPS_KEY está no .env.
 * (O CARTO passou a exigir chave e foi removido.)
 */
export interface BaseLayer {
  label: string;
  group: 'Esri' | 'OpenStreetMap' | 'Google';
  /** URL dos tiles (vazio nas camadas do Google, montada após criar a sessão). */
  url: string;
  attribution: string;
  /** Maior zoom em que o servidor tem imagens; acima disso o Leaflet amplia. */
  maxNativeZoom: number;
  /** Camadas transparentes por cima (ex.: nomes de ruas no modo híbrido). */
  overlays?: string[];
  /** Pedido de sessão da Google Map Tiles API. */
  google?: { mapType: 'satellite' | 'roadmap' | 'terrain'; layerTypes?: string[] };
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

export const BASE_LAYERS = {
  satellite: {
    label: 'Satélite',
    group: 'Esri',
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Imagens &copy; Esri',
    maxNativeZoom: 19,
  },
  hybrid: {
    label: 'Híbrido (satélite + ruas)',
    group: 'Esri',
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Imagens &copy; Esri',
    maxNativeZoom: 19,
    overlays: [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`],
  },
  esriStreets: {
    label: 'Ruas',
    group: 'Esri',
    url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Mapa &copy; Esri',
    maxNativeZoom: 19,
  },
  topo: {
    label: 'Topográfico',
    group: 'Esri',
    url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Mapa &copy; Esri',
    maxNativeZoom: 19,
  },
  dark: {
    label: 'Escuro',
    group: 'Esri',
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Mapa &copy; Esri',
    maxNativeZoom: 16,
  },
  streets: {
    label: 'Ruas (OSM)',
    group: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    maxNativeZoom: 19,
  },
  openTopo: {
    label: 'Relevo (OpenTopoMap)',
    group: 'OpenStreetMap',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap, SRTM | &copy; OpenTopoMap (CC-BY-SA)',
    maxNativeZoom: 17,
  },
  googleSatellite: {
    label: 'Google Satélite',
    group: 'Google',
    url: '',
    attribution: 'Imagens &copy; Google',
    maxNativeZoom: 21,
    google: { mapType: 'satellite' },
  },
  googleHybrid: {
    label: 'Google Híbrido',
    group: 'Google',
    url: '',
    attribution: 'Mapa e imagens &copy; Google',
    maxNativeZoom: 21,
    google: { mapType: 'satellite', layerTypes: ['layerRoadmap'] },
  },
  googleRoadmap: {
    label: 'Google Mapa',
    group: 'Google',
    url: '',
    attribution: 'Dados do mapa &copy; Google',
    maxNativeZoom: 21,
    google: { mapType: 'roadmap' },
  },
} satisfies Record<string, BaseLayer>;

export type BaseLayerId = keyof typeof BASE_LAYERS;

export const DEFAULT_BASE: BaseLayerId = 'satellite';

/** Camadas disponíveis: as do Google só com chave configurada. */
export function availableLayers(hasGoogleKey: boolean): BaseLayerId[] {
  return (Object.keys(BASE_LAYERS) as BaseLayerId[]).filter((id) => hasGoogleKey || !(BASE_LAYERS[id] as BaseLayer).google);
}

const STORAGE_KEY = 'mapftth.baseLayer';

/** Último mapa base escolhido neste navegador (volta ao padrão se não estiver mais disponível). */
export function loadBase(available: BaseLayerId[]): BaseLayerId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as BaseLayerId | null;
    if (saved && available.includes(saved)) return saved;
  } catch {
    // navegação privada / armazenamento bloqueado
  }
  return DEFAULT_BASE;
}

export function saveBase(id: BaseLayerId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignora
  }
}

/** Cria (ou reaproveita) a sessão da Google Map Tiles API e devolve a URL dos tiles. */
export async function googleTileUrl(layer: BaseLayer, key: string): Promise<string> {
  const body = { language: 'pt-BR', region: 'BR', ...layer.google };
  const cacheKey = `mapftth.gsession.${JSON.stringify(body)}`;
  let session: string | null = null;
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) ?? 'null') as { session: string; expiry: number; key: string } | null;
    // reaproveita enquanto faltar mais de 1 hora para expirar
    if (cached && cached.key === key && cached.expiry * 1000 > Date.now() + 3600_000) session = cached.session;
  } catch {
    // ignora
  }
  if (!session) {
    const res = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google Maps recusou a chave (HTTP ${res.status}). Verifique se a Map Tiles API está ativada.`);
    const data = (await res.json()) as { session: string; expiry: string };
    session = data.session;
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ session, expiry: Number(data.expiry), key }));
    } catch {
      // ignora
    }
  }
  return `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`;
}
