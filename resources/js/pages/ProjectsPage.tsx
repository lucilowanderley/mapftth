import { FolderOpen, LogOut, MapPin, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { api, errorMessage } from '../lib/api';
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
  const navigate = useNavigate();

  useEffect(() => {
    api.projects().then(setProjects);
  }, []);

  const filtered = useMemo(
    () => (projects ?? []).filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [projects, query],
  );

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
                    </div>
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
    const t = setTimeout(() => searchPlaces(city).then(setResults).catch(() => setResults([])), 400);
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
              <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution="&copy; OpenStreetMap &copy; CARTO" />
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
