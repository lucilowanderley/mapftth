export const currentUser = JSON.parse(document.getElementById('root')?.dataset.user ?? '{}') as {
  id: number;
  name: string;
  email: string;
};

export function logout() {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/logout';
  const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
  form.innerHTML = `<input type="hidden" name="_token" value="${token}">`;
  document.body.appendChild(form);
  form.submit();
}

/** Configuração do servidor repassada à página (ex.: chave opcional do Google Maps). */
export const appConfig = JSON.parse(document.getElementById('root')?.dataset.config ?? '{}') as {
  googleMapsKey?: string | null;
};
