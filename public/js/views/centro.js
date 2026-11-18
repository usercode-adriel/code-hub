// 01 · COMMAND CENTER — painel principal do System 2.0 (Codeniac Society).
import { on, store } from '../store.js';
import { shell, nascendo, face, nx, num, pct, spark, evRow, mapSvg, skyline, bindEntities, CAT_ICON, CAT_COLOR, api, esc, timeAgo, icon, modal } from '../world/wui.js';

const APPS = [
  ['#/rede', 'users', 'Rede', '#ec4899'], ['#/assistente', 'chat', 'Mensagens', '#8b5cf6'], ['#/economia/banco', 'wallet', 'Banco', '#22c55e'], ['#/economia/bolsa', 'trending', 'Bolsa', '#10b981'],
  ['#/economia/carreira', 'briefcase', 'Carreira', '#0ea5e9'], ['#/internet', 'globe', 'Internet', '#3b82f6'], ['#/midia', 'news', 'Notícias', '#ef4444'], ['#/midia/tv', 'play', 'TV e rádio', '#f97316'],
  ['#/governo', 'scale', 'Governo', '#f59e0b'], ['#/social/eventos', 'calendar', 'Eventos', '#a855f7'], ['#/social/comunidades', 'layers', 'Comunidades', '#06b6d4'], ['#/economia/imoveis', 'pin', 'Imóveis', '#eab308'],
  ['#/internet/site/vitrine.nx', 'bag', 'Loja', '#f472b6'], ['#/mapa', 'pin', 'Mapa', '#14b8a6'], ['#/arquivo', 'book', 'Arquivo', '#d4a373'], ['#/diversao', 'trophy', 'Quiz', '#84cc16'],
];

export default async function render(el) {
  const body = shell(el, 'centro');
  let stop = null; let clock = null; let off = null;
  const load = async () => {
    const d = await api.get('/mundo/resumo');
    if (!d.born) { stop = nascendo(body, load); return; }
    paint(d);
  };
  const paint = (d) => {
    const me = d.me; const lvlXp = me.xp - 40 * (me.level - 1) ** 2; const lvlNeed = 40 * me.level ** 2 - 40 * (me.level - 1) ** 2;
    const time = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const date = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    const nextInv = d.invites.next;
    const tick = d.ticker[0];
    body.innerHTML = `<div class="cc">
      <aside class="cc-me w-panel">
        <div class="cc-id">${face({ ...store.user, me: false, name: me.name, avatar: store.user?.avatar, color: '#7c3aed' }, 62)}<div><b>${esc(me.name)}</b><small>Cidadã(o) de ${esc(d.city.name)}</small>
          <span class="w-chip ${me.office ? 'gold' : ''}">${me.office ? (me.office === 'prefeito' ? 'Prefeito(a)' : 'Vereador(a)') : me.job ? esc(me.job.role) : 'Sem emprego'}</span></div></div>
        <div class="cc-stats">
          <a href="#/economia/banco" class="cc-stat"><span>${icon('wallet', 14)} Saldo</span><b>${nx(me.balance)}</b></a>
          <div class="cc-stat"><span>${icon('star', 14)} Reputação</span><b>${me.reputation}%</b><i class="w-bar"><i style="width:${me.reputation}%"></i></i></div>
          <div class="cc-stat"><span>${icon('users', 14)} Fama</span><b>${num(me.fame)}</b></div>
          <div class="cc-stat"><span>${icon('trending', 14)} Patrimônio</span><b>${nx(me.netWorth, 0)}</b></div>
          <div class="cc-stat"><span>${icon('trophy', 14)} Nível ${me.level}</span><b>${me.xp} XP</b><i class="w-bar"><i style="width:${Math.min(100, (lvlXp / lvlNeed) * 100)}%"></i></i></div>
        </div>
        <h4>Acesso rápido</h4>
        <nav class="cc-quick">
          <a href="#/economia/carreira">${icon('briefcase', 14)} Minha carreira ${me.job && !me.job.workedToday ? '<em>expediente</em>' : ''}</a>
          <a href="#/social/relacoes">${icon('heart', 14)} Relacionamentos</a>
          <a href="#/social/eventos">${icon('calendar', 14)} Convites ${d.invites.pending ? `<em>${d.invites.pending}</em>` : ''}</a>
          <a href="#/social/pedidos">${icon('inbox', 14)} Pedidos de ajuda ${d.requests ? `<em>${d.requests}</em>` : ''}</a>
          <a href="#/social/comunidades">${icon('layers', 14)} Comunidades</a>
          <a href="#/economia/empresa">${icon('rocket', 14)} Minha empresa</a>
          <a href="#/controle">${icon('cpu', 14)} Controle da simulação</a>
        </nav>
      </aside>
      <section class="cc-hero w-panel">${skyline()}
        <div class="cc-hero-top"><div class="cc-city"><span class="cc-logo">${icon('globe', 22)}</span><div><b>${esc(d.city.name.toUpperCase())}</b><small>${d.city.residents} moradores · ${d.city.districts} bairros · ${d.city.people} perfis na Rede</small></div></div>
          <div class="cc-clock">${d.weather ? `<span class="cc-wx">${d.weather.icon} <b>${d.weather.temp}°C</b><small>${esc(d.weather.cond)}</small></span>` : ''}<span class="cc-time"><b id="ccTime">${time()}</b><small>${esc(date)}</small></span></div></div>
        ${nextInv ? `<a class="cc-next" href="#/social/eventos"><small>${nextInv.user === 'pendente' ? '📩 Convite para você' : '✅ Você vai'}</small><b>${esc(nextInv.title)}</b><span>${esc(nextInv.place)} · ${new Date(nextInv.at).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span></a>`
          : d.election ? `<a class="cc-next" href="#/governo"><small>🗳️ ${esc({ mandato: 'Próxima eleição', inscricoes: 'Inscrições abertas', campanha: 'Campanha eleitoral', apuracao: 'Apuração hoje' }[d.election.phase])}</small><b>${d.election.n}ª eleição de Codeniac Society</b><span>${d.election.phase === 'mandato' ? 'Começa' : 'Até'} ${new Date(d.election.ends).toLocaleDateString('pt-BR')}</span></a>` : ''}
      </section>
      <aside class="cc-social w-panel"><div class="w-ph"><h3>Redes sociais</h3><a href="#/rede">Ver tudo ${icon('chevRight', 12)}</a></div>
        <div class="cc-feed">${d.social.map((p) => `<a class="cc-post" href="#/rede">${p.me ? face({ me: true }, 32) : `<span data-person="${esc(p.author?.id)}">${face(p.author, 32)}</span>`}<div><b>${esc(p.me ? 'Você' : p.author?.name || '')}</b><small>${esc(timeAgo(p.at))}${p.mood?.emoji ? ` · ${p.mood.emoji}` : ''}</small><p>${esc(p.text).slice(0, 120)}</p><small class="muted">♥ ${num(p.likes)} · 💬 ${p.commentCount}</small></div>${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : ''}</a>`).join('') || '<p class="muted">A Rede está acordando...</p>'}</div>
      </aside>
      <section class="cc-apps w-panel"><div class="w-ph"><h3>Aplicativos do hub</h3></div><div class="cc-app-grid">${APPS.map(([h, ic, l, c]) => `<a href="${h}" style="--c:${c}"><span>${icon(ic, 18)}</span>${l}</a>`).join('')}</div></section>
      <section class="cc-map w-panel"><div class="w-ph"><h3>Mapa interativo</h3><a href="#/mapa">Ver mapa completo ${icon('chevRight', 12)}</a></div><a href="#/mapa" class="cc-map-svg">${mapSvg(d.map, { mini: true })}</a>
        <div class="cc-legend"><span><i class="lg co"></i>Empresas</span><span><i class="lg al"></i>Alertas</span><span><i class="lg lk"></i>Em expansão</span></div></section>
      <section class="cc-eco w-panel"><div class="w-ph"><h3>Economia</h3><a href="#/economia">Ver gráficos ${icon('chevRight', 12)}</a></div>
        <div class="cc-idx"><div><small>Bolsa Nexus</small><b>${Math.round(d.economy.index).toLocaleString('pt-BR')} pts</b><em class="${d.economy.change >= 0 ? 'up' : 'down'}">${pct(d.economy.change)}</em></div>${spark(d.economy.history, { w: 180, h: 48, color: d.economy.change >= 0 ? '#22c55e' : '#ef4444' })}</div>
        <small class="muted">Inflação do mês: ${d.economy.inflation.toLocaleString('pt-BR')}%</small>
        <div class="cc-eco-acts"><a class="btn sm outline" href="#/economia/banco">Transferir</a><a class="btn sm outline" href="#/economia/bolsa">Investir</a><a class="btn sm outline" href="#/economia/banco">Empréstimo</a></div>
        <h5>Maiores variações</h5>${d.economy.movers.map((c) => `<button class="cc-mover" data-company="${esc(c.id)}"><span class="cc-tk" style="--c:${esc(c.color)}">${esc(c.ticker)}</span><span>${esc(c.name)}</span><b>${nx(c.price)}</b><em class="${c.change >= 0 ? 'up' : 'down'}">${pct(c.change)}</em></button>`).join('')}
        ${d.economy.mine.length ? `<h5>Suas empresas</h5>${d.economy.mine.map((c) => `<button class="cc-mover" data-company="${esc(c.id)}"><span class="cc-tk" style="--c:${esc(c.color)}">${esc(c.ticker)}</span><span>${esc(c.name)}</span><em>${esc(c.status)}</em></button>`).join('')}` : ''}</section>
      <section class="cc-news w-panel"><div class="w-ph"><h3>Notícias do mundo</h3><a href="#/midia">Ver todas ${icon('chevRight', 12)}</a></div>
        ${d.news.map((n) => `<a class="cc-nw" href="#/internet/artigo/${esc(n.id)}"><span class="cc-nw-ic" style="--c:${CAT_COLOR[n.cat] || '#64748b'}">${icon(CAT_ICON[n.cat] || 'news', 16)}</span><div><b>${esc(n.title)}</b><small>${esc(n.site?.name || '')} · ${esc(n.catLabel || '')} · ${esc(timeAgo(n.at))}</small></div></a>`).join('') || '<p class="muted">Nenhuma notícia ainda: os jornais publicam quando algo importante acontece.</p>'}</section>
      <section class="cc-events w-panel"><div class="w-ph"><h3>Acontecendo na cidade</h3><a href="#/arquivo">Arquivo ${icon('chevRight', 12)}</a></div>${d.events.map((e) => evRow(e, { compact: true })).join('')}</section>
      <footer class="cc-ticker">${tick ? `<span class="cc-alert">${icon('shield', 13)} ${tick.cat === 'seguranca' ? 'ALERTA DA POLÍCIA' : 'URGENTE'}</span><div class="cc-marquee"><span>${d.ticker.map((t) => esc(t.title)).join('  ·  ')}</span></div>` : '<div class="cc-marquee"><span>Nenhum alerta no momento.</span></div>'}
        <span class="cc-online"><i></i> Conectado ao servidor do System 2.0${d.ai.ready ? ` · IA ativa (${d.ai.left} chamadas nesta hora)` : ' · sem IA (gerador local)'}</span></footer>
    </div>`;
    clearInterval(clock);
    clock = setInterval(() => { const t = body.querySelector('#ccTime'); if (t) t.textContent = time(); }, 15000);
  };
  bindEntities(body);
  await load();
  // relatório de ausência
  api.get('/mundo/relatorio').then((r) => { if (r) report(r); }).catch(() => {});
  // atualiza quando algo importante acontece
  let pending = null;
  off = on('world', (ev) => { if (ev.type === 'event' && ev.event.importance >= 3) { clearTimeout(pending); pending = setTimeout(() => load().catch(() => {}), 1500); } });
  return () => { stop?.(); clearInterval(clock); off?.(); clearTimeout(pending); };
}

function report(r) {
  modal({
    title: 'Relatório de atividades do mundo', wide: true,
    body: `<div class="w-report"><p class="muted">Desde ${new Date(r.since).toLocaleString('pt-BR')} (${esc(timeAgo(r.since))}):</p>
      <div class="w-report-nums"><div><b>${r.total}</b><small>acontecimentos</small></div><div><b>${r.interactions}</b><small>pessoas interagiram</small></div><div><b>${r.news}</b><small>notícias</small></div><div><b>${r.posts}</b><small>posts na Rede</small></div><div><b>${r.messages}</b><small>mensagens para você</small></div><div><b>${r.companies}</b><small>fatos de empresas</small></div></div>
      <div class="w-chips">${r.byCat.map((c) => `<span class="w-chip">${esc(c.label)}: ${c.n}</span>`).join('')}</div>
      <h5>Acontecimentos importantes</h5>${r.highlights.map((e) => evRow(e)).join('')}
      <div class="form-actions"><a class="btn outline" href="#/arquivo" data-close>Ver tudo no arquivo</a><button class="btn primary" data-close>Entrar na cidade</button></div></div>`,
  });
}
