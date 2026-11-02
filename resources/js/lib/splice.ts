/**
 * Geometria do diagrama de fusão (CTO/CEO): rotas em ângulo reto entre portas, com uma "pista" vertical
 * para cada fibra (para as linhas não se sobreporem), e a posição do ícone de emenda sobre a linha.
 * Sem React, usado também nos testes.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface RoutePort extends Pt {
  /** Lado para onde a porta "olha": 1 = direita, -1 = esquerda. */
  dir: 1 | -1;
  /** Porta virada para cima (-1) ou para baixo (1), em objetos girados 90°/270°. Tem prioridade sobre dir. */
  vdir?: 1 | -1;
}

export interface RouteRequest {
  id: string;
  a: RoutePort;
  b: RoutePort;
  /** Pista vertical escolhida pelo usuário (arrastando a fibra); vale para rotas de 3 trechos. */
  lane?: number;
}

export interface RouteOptions {
  /** Distância mínima que a linha anda reto ao sair da porta. */
  stub?: number;
  /** Espaço entre duas pistas verticais vizinhas. */
  gap?: number;
}

interface Lane {
  x: number;
  y1: number;
  y2: number;
}

/** Uma pista vertical a ser posicionada: x ideal e intervalo permitido. */
interface LaneReq {
  ideal: number;
  lo: number;
  hi: number;
  y1: number;
  y2: number;
}

function placeLane(req: LaneReq, used: Lane[], gap: number): number {
  const free = (x: number) => !used.some((l) => Math.abs(l.x - x) < gap - 0.01 && l.y1 <= req.y2 + 2 && req.y1 <= l.y2 + 2);
  const clamp = (x: number) => Math.min(req.hi, Math.max(req.lo, x));
  const start = clamp(req.ideal);
  for (let i = 0; i < 400; i++) {
    const step = Math.ceil(i / 2) * gap * (i % 2 ? 1 : -1);
    const x = start + step;
    if (x < req.lo - 0.01 || x > req.hi + 0.01) continue;
    if (free(x)) return x;
  }
  return start;
}

/**
 * Calcula a rota ortogonal (lista de pontos) de cada conexão. Conexões alinhadas viram uma reta; as demais
 * ganham uma pista vertical própria, distribuída para não encostar nas outras.
 */
export function routeOrthogonal(reqs: RouteRequest[], opts: RouteOptions = {}): Map<string, Pt[]> {
  const stub = opts.stub ?? 14;
  const gap = opts.gap ?? 6;
  const out = new Map<string, Pt[]>();
  const used: Lane[] = [];

  type Job = { id: string; a: RoutePort; b: RoutePort; lane: LaneReq; build: (x: number) => Pt[] };
  const jobs: Job[] = [];
  const far = 100000;

  // Portas verticais (objeto girado 90°/270°): cada uma anda um trecho reto para cima/baixo até uma "faixa"
  // horizontal própria e segue dali como porta horizontal. As mais próximas do destino ficam com o trecho
  // mais curto, para as fibras vizinhas não se cruzarem.
  const stubY = new Map<string, number>();
  const hUsed: Lane[] = [];
  const vPorts = reqs.flatMap((r) =>
    (['a', 'b'] as const)
      .filter((k) => r[k].vdir)
      .map((k) => ({ key: `${r.id}:${k}`, p: r[k], other: r[k === 'a' ? 'b' : 'a'] })),
  );
  vPorts.sort((u, v) => Math.abs(u.other.x - u.p.x) - Math.abs(v.other.x - v.p.x) || u.p.x - v.p.x);
  for (const v of vPorts) {
    const ideal = v.p.y + v.p.vdir! * stub;
    const req: LaneReq = { ideal, lo: v.p.vdir! > 0 ? ideal : -far, hi: v.p.vdir! > 0 ? far : ideal, y1: Math.min(v.p.x, v.other.x), y2: Math.max(v.p.x, v.other.x) };
    const y = placeLane(req, hUsed, gap);
    hUsed.push({ x: y, y1: req.y1, y2: req.y2 });
    stubY.set(v.key, y);
  }

  for (const req of reqs) {
    const { id, lane: fixed } = req;
    const lead: Pt[] = [];
    const tail: Pt[] = [];
    let a = req.a;
    let b = req.b;
    if (a.vdir) {
      lead.push({ x: a.x, y: a.y });
      a = { x: a.x, y: stubY.get(`${id}:a`)!, dir: b.x >= a.x ? 1 : -1 };
    }
    if (b.vdir) {
      tail.push({ x: b.x, y: b.y });
      b = { x: b.x, y: stubY.get(`${id}:b`)!, dir: req.a.x >= b.x ? 1 : -1 };
    }
    const wrap = (pts: Pt[]) => [...lead, ...pts, ...tail];
    const st = lead.length || tail.length ? 0 : stub;
    const forward = (b.x - a.x) * a.dir;
    if (a.dir !== b.dir && Math.abs(a.y - b.y) < 0.5 && forward > 0 && fixed === undefined) {
      out.set(id, wrap([a, b]));
      continue;
    }
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    const three = (x: number) => wrap([a, { x, y: a.y }, { x, y: b.y }, b]);
    if (fixed !== undefined && (a.dir !== b.dir ? forward >= 0 : true)) {
      // Traçado ajustado à mão: respeita a pista escolhida.
      used.push({ x: fixed, y1, y2 });
      out.set(id, three(fixed));
      continue;
    }
    if (a.dir !== b.dir && forward >= st * 2) {
      // Portas frente a frente: uma pista entre as duas.
      const lo = Math.min(a.x, b.x) + st;
      const hi = Math.max(a.x, b.x) - st;
      jobs.push({ id, a, b, lane: { ideal: (a.x + b.x) / 2, lo, hi, y1, y2 }, build: three });
    } else if (a.dir === b.dir) {
      // Mesmo lado: a pista fica além da porta mais externa.
      const edge = a.dir > 0 ? Math.max(a.x, b.x) + stub : Math.min(a.x, b.x) - stub;
      const lane = a.dir > 0 ? { ideal: edge, lo: edge, hi: far } : { ideal: edge, lo: -far, hi: edge };
      jobs.push({ id, a, b, lane: { ...lane, y1, y2 }, build: three });
    } else {
      // Portas de costas uma para a outra: sai de cada uma, cruza por uma faixa horizontal no meio.
      const ym = (a.y + b.y) / 2 + (Math.abs(a.y - b.y) < 1 ? 30 : 0);
      const ax = a.x + a.dir * stub;
      const bx = b.x + b.dir * stub;
      const la: LaneReq = a.dir > 0 ? { ideal: ax, lo: ax, hi: far, y1: Math.min(a.y, ym), y2: Math.max(a.y, ym) } : { ideal: ax, lo: -far, hi: ax, y1: Math.min(a.y, ym), y2: Math.max(a.y, ym) };
      const xa = placeLane(la, used, gap);
      used.push({ x: xa, y1: la.y1, y2: la.y2 });
      const lb: LaneReq = b.dir > 0 ? { ideal: bx, lo: bx, hi: far, y1: Math.min(b.y, ym), y2: Math.max(b.y, ym) } : { ideal: bx, lo: -far, hi: bx, y1: Math.min(b.y, ym), y2: Math.max(b.y, ym) };
      const xb = placeLane(lb, used, gap);
      used.push({ x: xb, y1: lb.y1, y2: lb.y2 });
      out.set(id, wrap([a, { x: xa, y: a.y }, { x: xa, y: ym }, { x: xb, y: ym }, { x: xb, y: b.y }, b]));
    }
  }

  // As pistas mais longas primeiro (ficam no centro); empate pela posição ideal, para ficar estável.
  jobs.sort((p, q) => q.lane.y2 - q.lane.y1 - (p.lane.y2 - p.lane.y1) || p.lane.ideal - q.lane.ideal || (p.id < q.id ? -1 : 1));
  for (const j of jobs) {
    const x = placeLane(j.lane, used, gap);
    used.push({ x, y1: j.lane.y1, y2: j.lane.y2 });
    out.set(j.id, j.build(x));
  }
  return out;
}

/** Curva suave (estilo antigo do diagrama), mantida como opção. */
export function curvePath(a: RoutePort, b: RoutePort): string {
  const d = Math.max(40, Math.abs(b.x - a.x) / 2, a.vdir || b.vdir ? Math.abs(b.y - a.y) / 2 : 0);
  const ctl = (p: RoutePort) => (p.vdir ? `${p.x},${p.y + p.vdir * d}` : `${p.x + p.dir * d},${p.y}`);
  return `M${a.x},${a.y} C${ctl(a)} ${ctl(b)} ${b.x},${b.y}`;
}

/**
 * Trecho vertical "arrastável" de uma rota (a pista da fibra): índice do primeiro ponto e x atual.
 * Só existe nas rotas de 3 trechos (saída horizontal, pista vertical, chegada horizontal).
 */
export function laneSegment(pts: Pt[]): { index: number; x: number; y1: number; y2: number } | null {
  for (let i = 1; i < pts.length - 2; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    if (Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) > 0.5 && Math.abs(pts[i - 1].y - p.y) < 0.5 && Math.abs(pts[i + 2].y - q.y) < 0.5) {
      return { index: i, x: p.x, y1: Math.min(p.y, q.y), y2: Math.max(p.y, q.y) };
    }
  }
  return null;
}

export function polylinePath(pts: Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${round(p.x)},${round(p.y)}`).join(' ');
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Onde desenhar o ícone da emenda: no primeiro trecho a partir da ponta indicada (normalmente a fibra do cabo),
 * a uma distância fixa da porta, para as emendas de fibras vizinhas ficarem alinhadas em coluna.
 * Se esse trecho for curto demais, usa o meio do trecho mais longo.
 */
export function spliceAnchor(pts: Pt[], fromEnd: 'a' | 'b' = 'a', offset = 34): Pt & { vertical: boolean } {
  const seq = fromEnd === 'a' ? pts : [...pts].reverse();
  const [p0, p1] = seq;
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (len >= 22) {
    const d = Math.min(offset, len / 2);
    return { x: p0.x + ((p1.x - p0.x) / len) * d, y: p0.y + ((p1.y - p0.y) / len) * d, vertical: Math.abs(p1.x - p0.x) < 0.5 };
  }
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < seq.length - 1; i++) {
    const l = Math.hypot(seq[i + 1].x - seq[i].x, seq[i + 1].y - seq[i].y);
    if (l > bestLen) {
      bestLen = l;
      best = i;
    }
  }
  const s = seq[best];
  const e = seq[best + 1];
  return { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2, vertical: Math.abs(e.x - s.x) < 0.5 };
}

/** Cor do texto (preto/branco) legível sobre a cor da fibra. */
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#0f172a';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0f172a' : '#ffffff';
}

/** Letra do cabo no diagrama: A, B, C... (Z, AA, AB...). */
export function cableLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
