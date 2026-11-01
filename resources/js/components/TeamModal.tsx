import { Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import type { Member, Role } from '../lib/types';
import { currentUser } from '../lib/user';
import { Modal } from './ui';

export const ROLE_LABELS: Record<Role, { label: string; help: string }> = {
  owner: { label: 'Dono', help: 'Controle total, inclusive excluir o projeto' },
  admin: { label: 'Administrador', help: 'Edita a rede e gerencia a equipe' },
  editor: { label: 'Projetista', help: 'Edita mapa, caixas, cabos e fusões' },
  viewer: { label: 'Técnico (leitura)', help: 'Consulta mapa, diagramas e relatórios' },
};

export default function TeamModal({ projectId, role, onClose }: { projectId: number; role: Role; onClose: () => void }) {
  const [data, setData] = useState<{ owner: { id: number; name: string; email: string }; members: Member[] } | null>(null);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<Member['role']>('editor');
  const [error, setError] = useState('');
  const canManage = role === 'owner' || role === 'admin';

  useEffect(() => {
    api.members(projectId).then(setData);
  }, [projectId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const m = await api.addMember(projectId, email, newRole);
      setData((d) => d && { ...d, members: [...d.members, m] });
      setEmail('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function change(m: Member, r: Member['role']) {
    const updated = await api.updateMember(projectId, m.id, r);
    setData((d) => d && { ...d, members: d.members.map((x) => (x.id === m.id ? updated : x)) });
  }

  async function remove(m: Member) {
    const self = m.user_id === currentUser.id;
    if (!confirm(self ? 'Sair deste projeto?' : `Remover ${m.user.name} do projeto?`)) return;
    await api.removeMember(projectId, m.id);
    if (self) window.location.href = '/app';
    setData((d) => d && { ...d, members: d.members.filter((x) => x.id !== m.id) });
  }

  return (
    <Modal title="Equipe e permissões" onClose={onClose} width="max-w-xl">
      {!data ? (
        <p className="text-slate-400 text-sm">Carregando...</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-800">
            <li className="flex items-center justify-between py-2">
              <div>
                <div className="font-medium">{data.owner.name}</div>
                <div className="text-xs text-slate-500">{data.owner.email}</div>
              </div>
              <span className="text-sm text-emerald-400">Dono</span>
            </li>
            {data.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2 gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.user.name}</div>
                  <div className="text-xs text-slate-500 truncate">{m.user.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  {canManage ? (
                    <select className="input !w-44 !py-1" value={m.role} onChange={(e) => change(m, e.target.value as Member['role'])}>
                      {(['admin', 'editor', 'viewer'] as const).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r].label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm text-slate-300">{ROLE_LABELS[m.role].label}</span>
                  )}
                  {(canManage || m.user_id === currentUser.id) && (
                    <button onClick={() => remove(m)} className="text-slate-500 hover:text-red-400 cursor-pointer" aria-label="Remover">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {canManage && (
            <form onSubmit={add} className="mt-5 rounded-lg bg-slate-950 p-3 space-y-2">
              <div className="label">Adicionar pessoa</div>
              <div className="flex gap-2">
                <input className="input" type="email" required placeholder="e-mail da conta MapFTTH" value={email} onChange={(e) => setEmail(e.target.value)} />
                <select className="input !w-48" value={newRole} onChange={(e) => setNewRole(e.target.value as Member['role'])}>
                  {(['admin', 'editor', 'viewer'] as const).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r].label}
                    </option>
                  ))}
                </select>
                <button className="btn-primary shrink-0">
                  <UserPlus size={16} />
                </button>
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <p className="text-xs text-slate-500">A pessoa precisa ter criado uma conta no MapFTTH com esse e-mail.</p>
            </form>
          )}

          <div className="mt-5 grid sm:grid-cols-2 gap-2 text-xs">
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <div key={r} className="rounded-md border border-slate-800 p-2">
                <div className="font-semibold text-slate-200">{ROLE_LABELS[r].label}</div>
                <div className="text-slate-500">{ROLE_LABELS[r].help}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
