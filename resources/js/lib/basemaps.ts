/**
 * Mapas base. O usuário escolhe:
 *  - o ESTILO no próprio mapa: Satélite, Ruas ou Relevo;
 *  - o MOTOR (provedor) em Configurações: OpenStreetMap (padrão), Esri ou Google.
 * As duas escolhas ficam salvas neste navegador.
 *
 * OpenStreetMap e Esri não exigem chave. O Google usa a Map Tiles API oficial e precisa de
 * uma chave: a do dono do projeto (cadastrada em Configurações, guardada criptografada no
 * servidor) ou GOOGLE_MAPS_KEY no .env. Usar os tiles do Google sem chave viola os termos.
 */
export interface BaseLayer {
  /** URL dos tiles (vazio nas camadas do Google, montada após criar a sessão). */
  url: string;
  attribution: string;
  /** Maior zoom em que o servidor tem imagens; acima disso o Leaflet amplia. */
  maxNativeZoom: number;
  /** Pedido de sessão da Google Map Tiles API. */
  google?: { mapType: 'satellite' | 'roadmap' | 'terrain'; layerTypes?: string[] };
  /** Aviso quando o motor não tem o estilo e outro provedor é usado no lugar. */
  note?: string;
}

export type MapStyle = 'satellite' | 'streets' | 'relief';
export type MapEngine = 'osm' | 'esri' | 'google';

export const MAP_STYLES: Record<MapStyle, string> = {
  satellite: 'Satélite',
  streets: 'Ruas',
  relief: 'Relevo',
};

export const MAP_ENGINES: Record<MapEngine, { label: string; needsKey?: boolean }> = {
  osm: { label: 'OpenStreetMap' },
  esri: { label: 'Esri (ArcGIS)' },
  google: { label: 'Google Maps', needsKey: true },
};

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

const ESRI_IMAGERY: BaseLayer = {
  url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
  attribution: 'Imagens &copy; Esri',
  maxNativeZoom: 19,
};

/** Camada usada para cada motor e estilo. */
export const LAYERS: Record<MapEngine, Record<MapStyle, BaseLayer>> = {
  osm: {
    satellite: { ...ESRI_IMAGERY, note: 'O OpenStreetMap não tem imagens de satélite; o estilo Satélite usa as imagens da Esri.' },
    streets: {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap',
      maxNativeZoom: 19,
    },
    relief: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap, SRTM | &copy; OpenTopoMap (CC-BY-SA)',
      maxNativeZoom: 17,
    },
  },
  esri: {
    satellite: ESRI_IMAGERY,
    streets: {
      url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
      attribution: 'Mapa &copy; Esri',
      maxNativeZoom: 19,
    },
    relief: {
      url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
      attribution: 'Mapa &copy; Esri',
      maxNativeZoom: 19,
    },
  },
  google: {
    satellite: { url: '', attribution: 'Imagens &copy; Google', maxNativeZoom: 21, google: { mapType: 'satellite' } },
    streets: { url: '', attribution: 'Dados do mapa &copy; Google', maxNativeZoom: 21, google: { mapType: 'roadmap' } },
    relief: { url: '', attribution: 'Dados do mapa &copy; Google', maxNativeZoom: 21, google: { mapType: 'terrain', layerTypes: ['layerRoadmap'] } },
  },
};

/** Mapa de ruas usado nas miniaturas da lista de projetos. */
export const STREETS_LAYER = LAYERS.osm.streets;

export const DEFAULT_ENGINE: MapEngine = 'osm';
export const DEFAULT_STYLE: MapStyle = 'streets';

/** De onde vem a chave do Google do projeto: conta do dono, .env do servidor ou nenhuma. */
export type GoogleKeySource = 'account' | 'env' | null;

/** Motor que dá para usar agora: o Google sem chave volta para o OpenStreetMap. */
export function usableEngine(preferred: MapEngine, hasGoogleKey: boolean): MapEngine {
  return MAP_ENGINES[preferred].needsKey && !hasGoogleKey ? DEFAULT_ENGINE : preferred;
}

/** Mostra só o começo e o fim da chave (ex.: AIza…x9Q2). */
export function maskKey(key: string): string {
  return key.length <= 10 ? '••••' : `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function load<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const saved = localStorage.getItem(key) as T | null;
    if (saved && allowed.includes(saved)) return saved;
  } catch {
    // navegação privada / armazenamento bloqueado
  }
  return fallback;
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignora
  }
}

export const loadEngine = () => load('mapftth.mapEngine', Object.keys(MAP_ENGINES) as MapEngine[], DEFAULT_ENGINE);
export const saveEngine = (e: MapEngine) => save('mapftth.mapEngine', e);
export const loadStyle = () => load('mapftth.mapStyle', Object.keys(MAP_STYLES) as MapStyle[], DEFAULT_STYLE);
export const saveStyle = (s: MapStyle) => save('mapftth.mapStyle', s);

/** Mensagem legível para a recusa do Google (chave errada, API desativada, domínio não liberado...). */
async function googleError(res: Response): Promise<string> {
  let detail = '';
  try {
    const data = (await res.json()) as { error?: { message?: string; status?: string } };
    detail = data.error?.message ?? '';
  } catch {
    // corpo vazio
  }
  const hint =
    res.status === 403
      ? 'Confira se a Map Tiles API está ativada, se o faturamento está ligado e se este endereço está liberado nas restrições da chave.'
      : res.status === 400
        ? 'Confira se a chave foi copiada inteira.'
        : 'Tente de novo em instantes.';
  return `Google Maps recusou a chave (HTTP ${res.status}${detail ? `: ${detail}` : ''}). ${hint}`;
}

/** Testa a chave criando uma sessão de satélite (não fica em cache). */
export async function testGoogleKey(key: string): Promise<void> {
  const res = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapType: 'satellite', language: 'pt-BR', region: 'BR' }),
  }).catch(() => {
    throw new Error('Não foi possível falar com o Google (sem internet ou bloqueado pela rede).');
  });
  if (!res.ok) throw new Error(await googleError(res));
}

/**
 * Atribuição exigida pelo Google para a área visível (ex.: "Dados do mapa ©2026 Google, Maxar").
 * Usa o endpoint viewport da Map Tiles API; devolve null se não responder.
 */
export async function googleViewportCopyright(
  tileUrl: string,
  zoom: number,
  b: { north: number; south: number; east: number; west: number },
): Promise<string | null> {
  const q = new URL(tileUrl.replace('{z}/{x}/{y}', '0/0/0'));
  const session = q.searchParams.get('session');
  const key = q.searchParams.get('key');
  if (!session || !key) return null;
  const params = new URLSearchParams({
    session,
    key,
    zoom: String(Math.round(zoom)),
    north: b.north.toFixed(6),
    south: b.south.toFixed(6),
    east: b.east.toFixed(6),
    west: b.west.toFixed(6),
  });
  try {
    const res = await fetch(`https://tile.googleapis.com/tile/v1/viewport?${params}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { copyright?: string };
    return data.copyright ?? null;
  } catch {
    return null;
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
    if (!res.ok) throw new Error(await googleError(res));
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
