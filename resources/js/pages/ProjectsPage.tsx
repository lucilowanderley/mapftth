import { FolderOpen, Link2, LogOut, MapPin, Plus, Search, Trash2, Upload } from 'lucide-react';
import DuplicatesModal from '../components/DuplicatesModal';
import { useEffect, useMemo, useRef, useState } from 'react';
import { STREETS_LAYER } from '../lib/basemaps';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { ROLE_LABELS } from '../components/TeamModal';
import { api, errorMessage, type ImportResult } from '../lib/api';
import { AutoResize, TILE_OPTIONS } from '../lib/mapview';
import { searchPlaces, type Place } from '../lib/geocode';
import type { Project } from '../lib/types';
import { currentUser, logout } from '../lib/user';
import { Field, Logo, Modal, formatLength } from '../components/ui';

const pin = L.divIcon({
  className: 'node-marker',
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#10b981;border:3px solid white;box-shadow:0 0 0 2px #10b981"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [dedupe, setDedupe] = useState(false);
  const [importing, setImporting] = useState<ImportResult[] | 'loading' | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  async function importProjects(files: File[]) {
    if (!files.length) return;
    setImporting('loading');
    try {
      setImporting(await api.importProjects(files));
    } catch (e) {
      setImporting([{ file: files.map((f) => f.name).join(', '), error: errorMessage(e) }]);
    }
    api.projects().then(setProjects);
  }

  useEffect(() => {
    api.projects().then(setProjects);
  }, []);

  const filtered = useMemo(() => (projects ?? []).filter((p) => p.name.toLowerCase().includes(query.toLowerCase())), [projects, query]);

  async function remove(p: Project) {
    if (!confirm(`Excluir o projeto "${p.name}" e toda a sua rede? Isso não pode ser desfeito.`)) return;
    await api.deleteProject(p.id);
    setProjects((list) => list?.filter((x) => x.id !== p.id) ?? null);
  }

  return (
    <div className="min-h-full flex">
      <aside className="w-60 shrink-0 border-r border-slate-800 bg-slate-900 p-4 hidden md:flex flex-col">
        <Logo />
        <nav className="mt-8 space-y-1 text-sm">
          <span className="flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 font-medium">
            <FolderOpen size={16} /> Meus projetos
          </span>
        </nav>
        <div className="mt-auto text-sm">
          <div className="font-medium truncate">{currentUser.name}</div>
          <div className="text-slate-500 truncate text-xs">{currentUser.email}</div>
          <button onClick={logout} className="mt-3 flex items-center gap-2 text-slate-400 hover:text-white cursor-pointer">
            <LogOut size={14} /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-8 min-w-0">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Meus projetos</h1>
            <p className="text-sm text-slate-400">Gerencie e organize suas redes FTTH.</p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-500" />
              <input className="input pl-9 w-56" placeholder="Buscar..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <button
              className="btn-ghost"
              onClick={() => importRef.current?.click()}
              title="Envie um .zip ou vários .kmz/.kml: cada arquivo vira um projeto (aceita a exportação do ISM)"
            >
              <Upload size={16} /> Importar projetos
            </button>
            <button
              className="btn-ghost"
              onClick={() => setDedupe(true)}
              title="Junta o mesmo poste/POP/caixa repetido em vários projetos num objeto só, compartilhado entre eles"
            >
              <Link2 size={16} /> Unificar duplicados
            </button>
            <input
              ref={importRef}
              type="file"
              multiple
              accept=".zip,.kmz,.kml"
              className="hidden"
              onChange={(e) => {
                importProjects(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> Novo projeto
            </button>
          </div>
        </div>

        {projects === null ? (
          <p className="mt-10 text-slate-500">Carregando...</p>
        ) : projects.length === 0 ? (
          <div className="mt-10 border border-dashed border-slate-700 rounded-xl p-12 text-center">
            <FolderOpen className="mx-auto text-slate-500" size={36} />
            <h2 className="mt-3 font-semibold">Você ainda não tem projetos</h2>
            <p className="text-sm text-slate-400 mt-1">Crie seu primeiro projeto FTTH para começar a mapear a rede.</p>
            <button className="btn-primary mt-5" onClick={() => setCreating(true)}>
              <Plus size={16} /> Criar primeiro projeto
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => {
              const pct = p.total_nodes ? Math.round(((p.deployed_count ?? 0) / p.total_nodes) * 100) : 0;
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="group cursor-pointer rounded-xl border border-slate-800 bg-slate-900 p-5 hover:border-emerald-600 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{p.name}</h3>
                      {p.city && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                          <MapPin size={12} /> {p.city}
                        </p>
                      )}
                      {p.role && p.role !== 'owner' && (
                        <p className="text-xs text-sky-400 mt-0.5 truncate">
                          Compartilhado por {p.user?.name ?? '—'} · {ROLE_LABELS[p.role].label}
                        </p>
                      )}
                    </div>
                    {(!p.role || p.role === 'owner') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(p);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 cursor-pointer"
                        aria-label="Excluir projeto"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                    {[
                      ['CTOs', p.cto_count],
                      ['CEOs', p.ceo_count],
                      ['Clientes', p.client_count],
                      ['Cabos', formatLength(p.cable_length_m)],
                    ].map(([label, value]) => (
                      <div key={label as string} className="rounded-md bg-slate-950 py-2">
                        <div className="font-semibold text-sm">{value ?? 0}</div>
                        <div className="text-slate-500">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Implantado</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {importing && (
        <ImportResultsModal
          results={importing}
          onClose={() => importing !== 'loading' && setImporting(null)}
          onOpen={(id) => navigate(`/projects/${id}`)}
        />
      )}
      {dedupe && <DuplicatesModal onClose={() => setDedupe(false)} onDone={() => api.projects().then(setProjects)} />}
      {creating && <CreateProjectModal onClose={() => setCreating(false)} onCreated={(p) => navigate(`/projects/${p.id}`)} />}
    </div>
  );
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, Math.max(map.getZoom(), 13));
  }, [center, map]);
  return null;
}

function ClickToSet({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [center, setCenter] = useState<[number, number]>([-15.7939, -47.8828]);
  const [results, setResults] = useState<Place[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(
      () =>
        searchPlaces(city)
          .then(setResults)
          .catch(() => setResults([])),
      400,
    );
    return () => clearTimeout(t);
  }, [city]);

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition((pos) => setCenter([pos.coords.latitude, pos.coords.longitude]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const p = await api.createProject({ name, city: city || null, center_lat: center[0], center_lng: center[1], zoom: 16 });
      onCreated(p);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal title="Criar novo projeto" onClose={onClose} width="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome *">
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Expansão Centro" autoFocus />
        </Field>
        <div>
          <div className="flex justify-between items-end">
            <span className="label">Localização inicial</span>
            <button type="button" onClick={useMyLocation} className="text-xs text-emerald-400 hover:underline mb-1 cursor-pointer">
              Usar minha localização
            </button>
          </div>
          <div className="relative">
            <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Pesquise cidade ou endereço..." />
            {results.length > 0 && (
              <ul className="absolute z-[1000] mt-1 w-full rounded-md border border-slate-700 bg-slate-900 text-sm shadow-xl">
                {results.map((r) => (
                  <li key={r.label}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-slate-800 truncate cursor-pointer"
                      onClick={() => {
                        setCenter([r.lat, r.lng]);
                        setCity(r.label.split(',').slice(0, 2).join(','));
                        setResults([]);
                      }}
                    >
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-2 h-52 rounded-md overflow-hidden border border-slate-700">
            <MapContainer center={center} zoom={4} className="h-full w-full">
              <AutoResize />
              <TileLayer url={STREETS_LAYER.url} attribution={STREETS_LAYER.attribution} {...TILE_OPTIONS} />
              <Marker position={center} icon={pin} />
              <Recenter center={center} />
              <ClickToSet onPick={(lat, lng) => setCenter([lat, lng])} />
            </MapContainer>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Clique no mapa para ajustar o centro do projeto · {center[0].toFixed(5)}, {center[1].toFixed(5)}
          </p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={saving}>
            Criar projeto
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportResultsModal({ results, onClose, onOpen }: { results: ImportResult[] | 'loading'; onClose: () => void; onOpen: (id: number) => void }) {
  const ok = results === 'loading' ? [] : results.filter((r) => !r.error);
  return (
    <Modal title="Importar projetos" onClose={onClose} width="max-w-2xl">
      <div className="p-5 overflow-auto">
        {results === 'loading' ? (
          <p className="text-sm text-slate-400">Importando arquivos... isso pode levar alguns segundos por arquivo.</p>
        ) : (
          <>
            <p className="text-sm text-slate-400 mb-3">
              {ok.length} de {results.length} arquivo(s) virou(aram) projeto. Cada arquivo foi importado como um projeto separado.
            </p>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 text-left">
                <tr>
                  <th className="py-1 pr-2 font-medium">Arquivo</th>
                  <th className="py-1 px-2 font-medium text-right">Pontos</th>
                  <th className="py-1 px-2 font-medium text-right">Cabos</th>
                  <th className="py-1 px-2 font-medium text-right">Áreas</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="py-1.5 pr-2 min-w-0">
                      <div className="truncate max-w-[22rem]" title={r.file}>{r.name ?? r.file}</div>
                      {r.error && <div className="text-xs text-red-400">{r.error}</div>}
                      {!!r.skipped && <div className="text-xs text-slate-500">{r.skipped} repetido(s) ignorado(s)</div>}
                    </td>
                    <td className="px-2 text-right tabular-nums">{r.nodes ?? '—'}</td>
                    <td className="px-2 text-right tabular-nums">{r.cables ?? '—'}</td>
                    <td className="px-2 text-right tabular-nums">{r.areas ?? '—'}</td>
                    <td className="pl-2 text-right">
                      {r.project_id && (
                        <button className="text-emerald-400 hover:underline cursor-pointer" onClick={() => onOpen(r.project_id!)}>
                          Abrir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Modal>
  );
}
