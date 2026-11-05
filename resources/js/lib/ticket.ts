/**
 * Ticket de atendimento do cliente: um comprovante estreito (cabe em impressora térmica de 80 mm ou numa folha A4)
 * com os dados do cliente, a potência estimada × medida, o percurso da fibra e as causas prováveis do diagnóstico.
 */
import { CLIENT_SEGMENTS, clientDataOf } from './client';
import { otdrTrace, OTDR_END_LABEL, type OtdrTrace } from './otdr';
import { CAUSE_LABEL, otdrDiagnosis } from './otdrdiag';
import { HEALTH_LABEL, describeStep } from './signal';
import type { NetNode, Network } from './types';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const m = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(3)} km` : `${Math.round(v)} m`);

/** Disparo do cliente pelo cabo drop, no sentido da OLT (o mesmo do botão OTDR do cliente). */
export function clientTrace(net: Network, client: NetNode): OtdrTrace | null {
  const drop = net.cables.find((c) => c.from_node_id === client.id || c.to_node_id === client.id);
  if (!drop) return null;
  const fiber = (client.attributes?.fiber as number | undefined) ?? 1;
  const t = otdrTrace(net, { nodeId: client.id, cableId: drop.id, fiber: Math.min(fiber, drop.fiber_count) });
  return 'error' in t ? null : t;
}

/** HTML do ticket (página completa, já com o comando de imprimir). */
export function ticketHtml(net: Network, client: NetNode, projectName: string, now = new Date()): string {
  const data = clientDataOf(client.attributes);
  const trace = clientTrace(net, client);
  const diag = trace ? otdrDiagnosis(net, trace) : null;
  const sig = diag?.signal ?? null;
  const row = (k: string, v: string | null | undefined) => (v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : '');
  const when = data.rx_at ? new Date(data.rx_at) : null;
  const no = `${client.id}-${now.toISOString().slice(0, 16).replace(/\D/g, '')}`;

  const signal = sig
    ? `<table>${row('Estimada', sig.estimated !== null ? `${sig.estimated.toFixed(2)} dBm` : '—')}${row('Medida', sig.measured !== null ? `${sig.measured.toFixed(2)} dBm` : 'sem medição')}${row(
        'Medido em',
        when && !Number.isNaN(when.getTime()) ? when.toLocaleString('pt-BR') : null,
      )}${row('Saúde', HEALTH_LABEL[sig.health])}</table><p>${esc(sig.summary)}</p>`
    : '<p>Sem percurso até a OLT para estimar a potência.</p>';

  const zone = diag?.zone ? `<p><b>Trecho suspeito:</b> de ${esc(m(diag.zone.from))} a ${esc(m(diag.zone.to))} a partir do cliente.</p>` : '';
  const fault = sig?.fault ? `<p>${esc(sig.fault.text)}</p>` : '';
  const checks = diag?.checks.length && sig?.fault
    ? `<h2>Pontos a verificar</h2><ol>${diag.checks
        .slice(0, 10)
        .map((c) => `<li>${esc(describeStep(c.step))}${c.at !== null ? ` <span class="mut">· ${esc(m(c.at))}</span>` : ''}</li>`)
        .join('')}</ol>`
    : '';
  const causes = diag?.causes.length
    ? `<h2>Possíveis causas</h2><ol>${diag.causes
        .slice(0, 6)
        .map((c) => `<li><b>[${esc(CAUSE_LABEL[c.level])}] ${esc(c.title)}</b><br>${esc(c.detail)}${c.where ? `<br><span class="mut">Onde: ${esc(c.where)}</span>` : ''}</li>`)
        .join('')}</ol>`
    : '';
  const route = trace
    ? `<h2>Percurso (cliente → ${esc(OTDR_END_LABEL[trace.end.kind].replace('Chega na ', '').replace('Chega no ', ''))})</h2><table>${trace.spans
        .map((s) => `<tr><td>${esc(s.name)} · FO ${s.fiber}</td><td class="r">${esc(m(s.end - s.start))}</td></tr>`)
        .join('')}<tr><th>Total</th><th class="r">${esc(m(trace.total))} · ${trace.totalLoss.toFixed(2)} dB</th></tr></table><p class="mut">${esc(trace.end.reason)}</p>`
    : '';

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ticket ${esc(client.name)}</title>
<style>
@page{size:80mm auto;margin:4mm}
body{font-family:Arial,sans-serif;color:#000;width:72mm;margin:0 auto;font-size:11px;line-height:1.35}
h1{font-size:14px;margin:0;text-align:center}h2{font-size:11px;margin:10px 0 3px;border-top:1px dashed #000;padding-top:6px;text-transform:uppercase}
.c{text-align:center}.mut{color:#444}table{width:100%;border-collapse:collapse}th{text-align:left;font-weight:bold;padding:1px 4px 1px 0;white-space:nowrap;vertical-align:top}td{padding:1px 0}.r{text-align:right}
ol{margin:0;padding-left:16px}li{margin-bottom:3px}p{margin:3px 0}.sign{margin-top:18px;border-top:1px solid #000;text-align:center;padding-top:2px}
</style></head><body>
<h1>MapFTTH · Ticket de atendimento</h1>
<div class="c mut">${esc(projectName)}<br>Nº ${esc(no)} · ${esc(now.toLocaleString('pt-BR'))}</div>
<h2>Cliente</h2><table>${row('Nome', client.name)}${row('ID', data.client_code)}${row('Tipo', data.segment ? CLIENT_SEGMENTS[data.segment] : null)}${row('ONU/ONT', data.onu_serial)}${row(
    'Coordenadas',
    `${client.lat.toFixed(6)}, ${client.lng.toFixed(6)}`,
  )}${row('Obs.', client.notes)}</table>
<h2>Potência na ONU</h2>${signal}${fault}${zone}
${checks}${causes}${route}
<h2>Atendimento</h2><p>Causa encontrada: ____________________</p><p>Serviço realizado: __________________</p><p>Potência após o reparo: ______ dBm</p>
<div class="sign">Técnico</div><div class="sign">Cliente</div>
<script>window.onload=()=>window.print()</script></body></html>`;
}

export function printTicket(net: Network, client: NetNode, projectName: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(ticketHtml(net, client, projectName));
  w.document.close();
  return true;
}
