// 08 · AI CONTROL — ritmo da simulação, orçamento de IA, autonomia de cada pessoa, origem dos dados e reinício.
import { shell, face, bindEntities, api, esc, timeAgo, icon, toast, modal } from '../world/wui.js';

export default async function render(el) {
  const body = shell(el, 'controle', { title: 'AI Control', sub: 'Como a simulação roda: ritmo, uso de IA e autonomia das pessoas.' });
  bindEntities(body);
  const load = async () => {
    const d = await api.get('/mundo/controle');
    const s = d.stats;
    let q = '';
    body.innerHTML = `<div class="ct-grid">
      <section class="w-panel"><h3>Motor do mundo</h3>
        <form class="form" id="ctCfg"><label class="switch-row"><span><b>Mundo ativo</b><small>Desligado, a cidade congela (nada acontece, nem enquanto você está fora).</small></span><span class="switch"><input type="checkbox" name="enabled" ${d.cfg.enabled !== false ? 'checked' : ''}><span></span></span></label>
          <div class="field"><label>Ritmo</label><select name="pace">${d.paces.map((p) => `<option value="${p}" ${d.cfg.pace === p ? 'selected' : ''}>${{ calma: 'Calma', normal: 'Normal', agitada: 'Agitada' }[p]}</option>`).join('')}</select><small class="hint">Quanto as pessoas agem por hora e quanta IA podem usar.</small></div>
          <div class="field"><label>Chamadas de IA por hora (vazio = padrão do ritmo)</label><input type="number" name="ai" min="0" max="200" value="${d.cfg.aiPerHour ?? ''}" placeholder="${d.ai.perHour}"></div>
          <div class="form-actions"><button class="btn primary">Salvar</button></div></form>
        <p class="muted">IA: ${d.ai.ready ? `ativa · restam ${d.ai.left} chamadas nesta hora` : 'sem IA na nuvem configurada — textos gerados por regras locais'} · <a href="#/settings/assistente">configurar IA</a></p></section>
      <section class="w-panel"><h3>Estado do universo</h3><div class="ct-stats">${[['Pessoas', s.people], ['Moradores', s.residents], ['Acontecimentos', s.events], ['Empresas', s.companies], ['Notícias', s.articles], ['Comunidades', s.communities], ['Boatos', s.rumors], ['Agendados', s.queue]].map(([l, v]) => `<div><b>${v}</b><small>${l}</small></div>`).join('')}</div>
        <h4>Origem dos registros</h4><p class="muted">Para separar o que é inicial do que aconteceu de verdade:</p>
        <div class="w-kv"><span>Gênese (estado inicial da cidade)</span><b>${s.origin.genese}</b></div><div class="w-kv"><span>Ao vivo</span><b>${s.origin.vivo}</b></div><div class="w-kv"><span>Recuperados (enquanto o hub estava desligado)</span><b>${s.origin.recuperado}</b></div>
        <p class="muted">${d.genesisAt ? `Mundo registrado desde ${new Date(d.genesisAt).toLocaleString('pt-BR')}.` : 'O mundo ainda não nasceu.'}</p>
        <button class="btn sm danger" id="ctReset">${icon('refresh', 12)} Reiniciar a história da cidade</button></section>
      <section class="w-panel ct-agents"><div class="w-ph"><h3>Agentes (${d.agents.length})</h3><input id="ctQ" placeholder="Buscar pessoa"></div><div id="ctList"></div></section></div>`;
    const paint = () => {
      body.querySelector('#ctList').innerHTML = d.agents.filter((a) => !q || a.name.toLowerCase().includes(q)).slice(0, 120).map((a) => `<div class="ct-ag"><span data-person="${esc(a.id)}">${face(a, 32)}</span><div class="grow"><b>${esc(a.name)}</b><small class="muted">${esc(a.job || '')} · ${a.resident ? 'moradora(o)' : 'rede global'} · ${esc(a.status)} · ${esc(a.relation.label)}</small></div>
        <select data-auto="${esc(a.id)}" aria-label="Autonomia">${['baixa', 'normal', 'alta'].map((x) => `<option value="${x}" ${a.autonomy === x ? 'selected' : ''}>autonomia ${x}</option>`).join('')}</select></div>`).join('');
      body.querySelectorAll('[data-auto]').forEach((s2) => { s2.onchange = async () => { await api.put(`/mundo/agentes/${s2.dataset.auto}`, { autonomy: s2.value }); toast('Autonomia ajustada', '', 'success'); }; });
    };
    paint();
    body.querySelector('#ctQ').oninput = (e) => { q = e.target.value.toLowerCase(); paint(); };
    body.querySelector('#ctCfg').onsubmit = async (e) => { e.preventDefault(); const f = e.target; await api.put('/mundo/controle', { enabled: f.enabled.checked, pace: f.pace.value, aiPerHour: f.ai.value === '' ? null : Number(f.ai.value) }); toast('Salvo', '', 'success'); load(); };
    body.querySelector('#ctReset').onclick = () => modal({
      title: 'Reiniciar a história',
      body: `<form class="form"><p>As pessoas e os posts da Rede continuam. Empresas, economia, política, notícias e todo o arquivo da cidade recomeçam do zero (nova gênese). Isso não pode ser desfeito.</p><div class="field"><label>Digite REINICIAR</label><input name="c" autocomplete="off"></div><div class="form-actions"><button type="button" class="btn outline" data-close>Cancelar</button><button class="btn danger">Reiniciar</button></div></form>`,
      onMount: (m, close) => { m.querySelector('form').onsubmit = async (e) => { e.preventDefault(); try { await api.post('/mundo/controle/reiniciar', { confirmar: e.target.c.value }); close(); toast('Cidade reiniciada', 'Uma nova gênese acontece em instantes.', 'success'); load(); } catch (err) { toast('Não deu', err.message, 'error'); } }; },
    });
  };
  await load();
}
