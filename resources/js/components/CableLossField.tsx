/** Campo "Atenuação (dB/km)" do cabo: vazio usa a padrão do projeto. Mostra a perda total da fibra. */
export default function CableLossField({
  value,
  onChange,
  projectRate,
  meters,
  disabled,
}: {
  /** Texto digitado ('' = padrão do projeto). */
  value: string;
  onChange: (v: string) => void;
  projectRate: number;
  /** Comprimento óptico (geométrico + reservas). */
  meters: number;
  disabled?: boolean;
}) {
  const parsed = parseLossRate(value);
  const bad = value.trim() !== '' && parsed === null;
  const rate = parsed ?? projectRate;
  const fmt = (n: number, d = 2) => n.toFixed(d).replace('.', ',');
  return (
    <label className="block">
      <span className="label">Atenuação (dB/km)</span>
      <input
        className="input"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        placeholder={`padrão do projeto: ${fmt(projectRate)}`}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Atenuação do cabo em dB/km"
      />
      <span className={`text-xs ${bad ? 'text-red-400' : 'text-slate-500'}`}>
        {bad
          ? 'Informe um valor entre 0 e 10 dB/km.'
          : `Perda da fibra: ${fmt((meters / 1000) * rate)} dB (${Math.round(meters)} m × ${fmt(rate, 3)} dB/km${parsed === null ? ', padrão do projeto' : ''}). Típico: 0,35 em 1310 nm, 0,22 em 1550 nm.`}
      </span>
    </label>
  );
}

/** '' → null (padrão do projeto); número entre 0 e 10 → valor; inválido → null. */
export function parseLossRate(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 10 ? Math.round(n * 1000) / 1000 : null;
}

export const lossRateText = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));
