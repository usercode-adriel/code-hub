// Ficha de caso policial/judicial: provas com força, linha do tempo e ações do usuário (depor, acordo, pagar).
import { esc, icon, nx } from './wui.js';

const CLS = { arquivado: 'ok', absolvido: 'ok', acordo: 'ok', multa: 'warn', condenado: 'warn', preso: 'warn', intimado: 'warn', processo: 'warn', citado: 'warn' };
const dt = (s) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function caseCard(c, { actions = true } = {}) {
  const mineSuspect = c.suspect?.id === 'me';
  return `<article class="w-panel cs ${esc(c.status)}"><header class="cs-h"><div><small>Caso nº ${c.n} · ${esc(c.kind === 'civil' ? 'Ação civil' : 'Inquérito')}</small><b>${esc(c.typeLabel || c.type)}</b></div><span class="w-chip ${CLS[c.status] || ''}">${esc(c.statusLabel)}</span></header>
    <p>${esc(c.desc || '')}</p>
    <div class="cs-who"><span>Suspeito(a): ${c.suspect?.id && c.suspect.id !== 'me' ? `<a data-person="${esc(c.suspect.id)}">${esc(c.suspect.name)}</a>` : `<b>${esc(c.suspect?.name || '—')}</b>`}</span>
      ${c.plaintiff ? `<span>Autor(a): <b>${esc(c.plaintiff.name)}</b></span>` : ''}${c.investigator ? `<span>Investigador(a): <a data-person="${esc(c.investigator.id)}">${esc(c.investigator.name)}</a></span>` : ''}
      ${c.amount ? `<span>Valor: <b>${nx(c.amount, 0)}</b></span>` : ''}${c.fine ? `<span>Multa: <b>${nx(c.fine, 0)}</b></span>` : ''}</div>
    <div class="cs-ev"><small>Força das provas</small><i class="w-bar"><i style="width:${c.strength}%;background:${c.strength >= 55 ? '#ef4444' : c.strength >= 40 ? '#f59e0b' : '#22c55e'}"></i></i><b>${c.strength}%</b></div>
    ${c.evidence.length ? `<ul class="cs-list">${c.evidence.map((e) => `<li>${icon('file', 11)} ${esc(e.desc)} <small class="muted">(${e.strength}%)</small></li>`).join('')}</ul>` : '<p class="muted">Sem provas registradas. Ninguém é punido sem provas.</p>'}
    ${c.deadline && c.status === 'intimado' ? `<p class="cs-dl">${icon('clock', 12)} Prazo para depor: <b>${dt(c.deadline)}</b>. Sem depoimento, o caso segue só com as provas.</p>` : ''}
    ${c.hearingAt && ['citado', 'processo'].includes(c.status) ? `<p class="cs-dl">${icon('scale', 12)} Audiência: <b>${dt(c.hearingAt)}</b></p>` : ''}
    ${c.sentence ? `<p class="cs-sent">${icon('scale', 12)} ${esc(c.sentence)}</p>` : ''}
    <details><summary>Linha do tempo</summary><ul class="gm-hist">${(c.timeline || []).map((t) => `<li><small class="muted">${dt(t.at)}</small> ${esc(t.text)}</li>`).join('')}</ul></details>
    ${actions && mineSuspect && c.status === 'intimado' ? `<div class="cs-acts"><button class="btn sm outline" data-dep="${esc(c.id)}" data-v="negar">Depor: negar</button><button class="btn sm outline" data-dep="${esc(c.id)}" data-v="confessar">Depor: confessar</button><button class="btn sm ghost" data-dep="${esc(c.id)}" data-v="silencio">Ficar em silêncio</button></div>` : ''}
    ${actions && mineSuspect && ['citado', 'processo'].includes(c.status) && c.kind === 'civil' ? `<div class="cs-acts"><button class="btn sm primary" data-deal="${esc(c.id)}">Propor acordo (pagar ${nx(c.amount, 0)})</button></div>` : ''}
  </article>`;
}
