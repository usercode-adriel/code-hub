// Início — painel principal da Codeniac Digital Society (layout da imagem de referência):
// perfil à esquerda, NEXUS CITY ao centro, evento + redes sociais à direita, e a fileira de baixo
// com mapa, economia, notícias e aplicativos. Tudo vem do estado real do mundo.
import { on, store } from '../store.js';
import { shell, nascendo, face, nx, num, pct, spark, evRow, skyline, bindEntities, CAT_ICON, CAT_COLOR, api, esc, timeAgo, icon, modal } from '../world/wui.js';
import { cityMap } from '../world/citymap.js';

const APPS = [
  ['#/banco', 'wallet', 'Banco', '#22c55e'], ['#/mercado', 'bag', 'Mercado', '#f472b6'], ['#/mapa', 'pin', 'Mapa', '#14b8a6'], ['#/rede', 'users', 'Rede', '#ec4899'],
  ['#/assistente', 'chat', 'Mensagens', '#8b5cf6'], ['#/empresas/bolsa', 'trending', 'Bolsa', '#10b981'], ['#/empresas/carreira', 'briefcase', 'Carreira', '#0ea5e9'], ['#/internet', 'globe', 'Internet', '#3b82f6'],
  ['#/inventario', 'layers', 'Inventário', '#a855f7'], ['#/policia', 'shield', 'Polícia', '#ef4444'], ['#/justica', 'scale', 'Justiça', '#f59e0b'], ['#/midia/tv', 'play', 'TV e rádio', '#f97316'],
];
const SOCIAL_TABS = [['rede', 'Rede'], ['eventos', 'Eventos'], ['amigos', 'Amigos']];
const gameTime = (m) => (m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}min`);

export default async function render(el) {
  const body = shell(el, 'centro');
  let stop = null; let clock = null; let off = null; let pending = null; let tab = 'rede';
  const load = async () => {
    const d = await api.get('/mundo/resumo');
    if (!d.born) { stop = nascendo(body, load); return; }
    paint(d);
  };
  const paint = (d) => {
    const me = d.me;
    const lvlXp = me.xp - 40 * (me.level - 1) ** 2; const lvlNeed = 40 * me.level ** 2 - 40 * (me.level - 1) ** 2 || 1;
    const time = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const date = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    const ev = d.invites.next;
    const tick = d.ticker.find((t) => t.cat === 'seguranca') || d.ticker[0];
    const stat = (ic, label, val, extra = '', href = '') => `<${href ? `a href="${href}"` : 'div'} class="dx-stat"><span class="dx-sic">${icon(ic, 15)}</span><span>${label}</span><b>${val}</b>${extra}</${href ? 'a' : 'div'}>`;
    body.innerHTML = `<div class="dx">
      <aside class="dx-me w-panel">
        <div class="dx-id">${face({ name: me.name, avatar: store.user?.avatar || me.avatar, color: '#7c3aed' }, 64)}<div><b>${esc(me.name)}</b>
          <small>${me.office ? (me.office === 'prefeito' ? 'Prefeito(a)' : 'Vereador(a)') : me.job ? esc(me.job.role) : 'Cidadã(o)'} · Nível ${me.level}</small>
          <small class="dx-loc">${icon('pin', 11)} ${esc(me.location || d.city.name)}</small></div></div>
        <div class="dx-stats">
          ${stat('wallet', 'Saldo', nx(me.balance), me.wallet ? `<small>+ ${nx(me.wallet)} na carteira</small>` : '', '#/banco')}
          ${stat('star', 'Reputação', `${me.reputation}%`, `<i class="w-bar"><i style="width:${me.reputation}%"></i></i>`)}
          ${stat('heart', 'Popularidade', `${me.popularity}%`, `<i class="w-bar"><i style="width:${me.popularity}%;background:#ec4899"></i></i>`)}
          ${stat('zap', 'Influência', `${me.influence}`, `<i class="w-bar"><i style="width:${me.influence}%;background:#f59e0b"></i></i>`)}
          ${stat('trending', 'Patrimônio', nx(me.netWorth, 0))}
          ${stat('trophy', `Nível ${me.level}`, `${me.xp} XP`, `<i class="w-bar"><i style="width:${Math.max(0, Math.min(100, (lvlXp / lvlNeed) * 100))}%;background:#a855f7"></i></i>`)}
        </div>
        <h4 class="dx-h4">Acesso rápido</h4>
        <nav class="dx-quick">
          <a href="#/banco">${icon('wallet', 15)}<span>Banco</span>${me.contracts ? `<em>${me.contracts}</em>` : ''}</a>
          <a href="#/mercado">${icon('bag', 15)}<span>Mercado</span></a>
          <a href="#/inventario">${icon('layers', 15)}<span>Inventário</span>${me.items ? `<em>${me.items}</em>` : ''}</a>
          <a href="#/empresas/carreira">${icon('briefcase', 15)}<span>Carreira</span>${me.job && !me.job.workedToday ? '<em>!</em>' : ''}</a>
          <a href="#/social/relacoes">${icon('users', 15)}<span>Amigos</span><em class="soft">${me.friends}</em></a>
          <a href="#/social/eventos">${icon('calendar', 15)}<span>Convites</span>${d.invites.pending ? `<em>${d.invites.pending}</em>` : ''}</a>
          <a href="#/social/pedidos">${icon('inbox', 15)}<span>Pedidos</span>${d.requests ? `<em>${d.requests}</em>` : ''}</a>
          <a href="#/controle">${icon('cpu', 15)}<span>Controle</span></a>
        </nav>
        ${me.installed?.central ? `<div class="dx-central"><b>${icon('cpu', 13)} Central de Comando</b><small>Score ${me.score} · ${me.contracts} contrato(s) · ${me.items} item(ns)${me.vipUntil && me.vipUntil > new Date().toISOString() ? ' · VIP ativo' : ''}</small></div>` : ''}
      </aside>

      <section class="dx-hero">
        <div class="dx-hero-img" id="dxHeroImg">${d.heroImage ? `<img src="${esc(d.heroImage)}" alt="">` : skyline()}</div>
        <div class="dx-hero-ov">
          <div class="dx-hero-top"><span class="dx-wx">${d.weather ? `${d.weather.icon} <b>${d.weather.temp}°C</b> <small>${esc(d.weather.cond)}</small>` : ''}</span>
            <span class="dx-clock"><b id="dxTime">${time()}</b><small>${esc(date)}</small></span></div>
          <div class="dx-title"><small>Bem-vindo(a) a</small><h1>${esc((d.city.name || 'Nexus City').toUpperCase())}</h1><p>${d.city.residents} moradores · ${d.city.districts} bairros · ${num(d.city.people)} perfis na Rede</p>
            <div class="dx-hero-acts"><a class="btn sm primary" href="#/mapa">${icon('pin', 13)} Explorar o mapa</a><a class="btn sm outline glass" href="#/mercado">${icon('bag', 13)} Ir às compras</a></div></div>
        </div>
      </section>

      <aside class="dx-right">
        <div class="dx-event w-panel">${ev ? `<small class="dx-tag">${ev.user === 'pendente' ? 'NOVO EVENTO' : 'VOCÊ VAI'}</small><b>${esc(ev.title)}</b>
            <span class="muted">${icon('pin', 12)} ${esc(ev.place)}</span><span class="muted">${icon('clock', 12)} ${new Date(ev.at).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            <a class="btn sm primary" href="#/social/eventos">${ev.user === 'pendente' ? 'Responder convite' : 'Ver detalhes'}</a>`
          : d.election ? `<small class="dx-tag">ELEIÇÃO ${d.election.n}</small><b>${esc({ mandato: 'Próxima eleição', inscricoes: 'Inscrições abertas', campanha: 'Campanha eleitoral', apuracao: 'Apuração hoje' }[d.election.phase])}</b>
            <span class="muted">Até ${new Date(d.election.ends).toLocaleDateString('pt-BR')}</span><a class="btn sm primary" href="#/governo">Ver candidatos</a>`
          : `<small class="dx-tag">AGENDA</small><b>Nenhum evento marcado</b><span class="muted">Os convites das pessoas aparecem aqui.</span><a class="btn sm outline" href="#/social/eventos">Ver eventos</a>`}</div>
        <div class="dx-social w-panel"><div class="w-ph"><h3>Redes sociais</h3><a href="#/rede">Abrir ${icon('chevRight', 12)}</a></div>
          <div class="dx-tabs" role="tablist">${SOCIAL_TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <div class="dx-feed" id="dxFeed"></div></div>
      </aside>

      <section class="dx-map w-panel"><div class="w-ph"><h3>Mapa interativo</h3><a href="#/mapa">Abrir ${icon('chevRight', 12)}</a></div><div class="dx-map-host" id="dxMap"><div class="skeleton" style="height:100%"></div></div></section>
      <section class="dx-eco w-panel"><div class="w-ph"><h3>Economia</h3><a href="#/empresas">Ver mais ${icon('chevRight', 12)}</a></div>
        <div class="dx-idx"><div><small>Bolsa Nexus</small><b>${Math.round(d.economy.index).toLocaleString('pt-BR')} pts</b><em class="${d.economy.change >= 0 ? 'up' : 'down'}">${pct(d.economy.change)}</em></div>${spark(d.economy.history, { w: 160, h: 44, color: d.economy.change >= 0 ? '#22c55e' : '#ef4444' })}</div>
        <small class="muted">Inflação do mês ${d.economy.inflation.toLocaleString('pt-BR')}%</small>
        <h5>Suas empresas</h5>${d.economy.mine.length ? d.economy.mine.slice(0, 3).map((c) => `<button class="dx-co" data-company="${esc(c.id)}"><span class="cc-tk" style="--c:${esc(c.color)}">${esc(c.ticker)}</span><span>${esc(c.name)}</span><em class="${c.change >= 0 ? 'up' : 'down'}">${pct(c.change)}</em></button>`).join('')
          : `<p class="muted dx-small">Você ainda não tem empresa. <a href="#/empresas/empresa">Abrir uma</a></p>`}
        <h5>Em alta</h5>${d.economy.movers.slice(0, 3).map((c) => `<button class="dx-co" data-company="${esc(c.id)}"><span class="cc-tk" style="--c:${esc(c.color)}">${esc(c.ticker)}</span><span>${esc(c.name)}</span><em class="${c.change >= 0 ? 'up' : 'down'}">${pct(c.change)}</em></button>`).join('')}</section>
      <section class="dx-news w-panel"><div class="w-ph"><h3>Notícias do mundo</h3><a href="#/midia">Todas ${icon('chevRight', 12)}</a></div>
        ${d.news.slice(0, 5).map((n) => `<a class="cc-nw" href="#/internet/artigo/${esc(n.id)}"><span class="cc-nw-ic" style="--c:${CAT_COLOR[n.cat] || '#64748b'}">${icon(CAT_ICON[n.cat] || 'news', 15)}</span><div><b>${esc(n.title)}</b><small>${esc(n.site?.name || n.catLabel || '')} · ${esc(timeAgo(n.at))}</small></div></a>`).join('') || '<p class="muted">Sem notícias ainda.</p>'}</section>
      <section class="dx-apps w-panel"><div class="w-ph"><h3>Aplicativos do hub</h3></div><div class="dx-app-grid">${APPS.map(([h, ic, l, c]) => `<a href="${h}" style="--c:${c}"><span>${icon(ic, 19)}</span>${l}</a>`).join('')}</div></section>

      <footer class="dx-ticker">${tick ? `<span class="cc-alert">${icon('shield', 13)} ${tick.cat === 'seguranca' ? 'ALERTA DA POLÍCIA' : 'URGENTE'}</span><div class="cc-marquee"><span>${d.ticker.map((t) => esc(t.title)).join('  ·  ')}</span></div>` : '<div class="cc-marquee"><span>Tudo tranquilo em Nexus City.</span></div>'}
        <span class="cc-online"><i></i> Conectado aos servidores${d.ai.ready ? ' · IA ativa' : ''}</span><span class="dx-gt">${icon('clock', 12)} Tempo no jogo: <b>${gameTime(d.gameMinutes || 0)}</b></span></footer>
    </div>`;
    const feed = body.querySelector('#dxFeed');
    const paintFeed = () => {
      body.querySelectorAll('.dx-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      if (tab === 'rede') feed.innerHTML = d.social.map((p) => `<a class="cc-post" href="#/rede">${p.me ? face({ me: true }, 30) : `<span data-person="${esc(p.author?.id)}">${face(p.author, 30)}</span>`}<div><b>${esc(p.me ? 'Você' : p.author?.name || '')}</b><small>${esc(timeAgo(p.at))}</small><p>${esc((p.text || '').slice(0, 110))}</p></div></a>`).join('') || '<p class="muted">Sem posts ainda.</p>';
      if (tab === 'eventos') feed.innerHTML = d.events.slice(0, 6).map((e) => evRow(e, { compact: true })).join('');
      if (tab === 'amigos') {
        feed.innerHTML = '<div class="skeleton" style="height:90px"></div>';
        api.get('/mundo/relacoes').then((list) => { if (tab !== 'amigos') return; const fr = list.filter((p) => p.friend).slice(0, 8); feed.innerHTML = fr.map((p) => `<button class="dx-fr" data-person="${esc(p.id)}">${face(p, 30)}<span><b>${esc(p.name)}</b><small>${esc(p.mood?.reason || p.job || '')}</small></span></button>`).join('') || '<p class="muted">Adicione amizades na Rede.</p>'; })
          .catch(() => { feed.innerHTML = '<p class="muted"><a href="#/social">Abrir Social</a></p>'; });
      }
    };
    body.querySelectorAll('.dx-tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; paintFeed(); }; });
    paintFeed();
    clearInterval(clock);
    clock = setInterval(() => { const t = body.querySelector('#dxTime'); if (t) t.textContent = time(); }, 15000);
    miniMap();
    if (!d.heroImage) api.get('/mundo/heroi').then((r) => { if (r.image) { const h = body.querySelector('#dxHeroImg'); if (h) h.innerHTML = `<img src="${esc(r.image)}" alt="">`; } }).catch(() => {});
  };
  let geo = null;
  const miniMap = async () => {
    const host = body.querySelector('#dxMap'); if (!host) return;
    try {
      geo ??= await api.get('/mundo/mapa/geo');
      const layers = await api.get('/mundo/mapa/camadas');
      const m = cityMap(host, geo, { mini: true });
      m.setData(layers);
      host.querySelector('svg').addEventListener('click', () => { location.hash = '#/mapa'; });
    } catch { host.innerHTML = '<p class="muted">O mapa ainda está sendo desenhado…</p>'; }
  };
  bindEntities(body);
  await load();
  api.get('/mundo/relatorio').then((r) => { if (r) report(r); }).catch(() => {});
  off = on('world', (ev) => { if (ev.type === 'event' && ev.event.importance >= 3) { clearTimeout(pending); pending = setTimeout(() => load().catch(() => {}), 1500); } });
  return () => { stop?.(); clearInterval(clock); off?.(); clearTimeout(pending); };
}

function report(r) {
  modal({
    title: 'Enquanto você esteve fora', wide: true,
    body: `<div class="w-report"><p class="muted">Desde ${new Date(r.since).toLocaleString('pt-BR')} (${esc(timeAgo(r.since))}):</p>
      <div class="w-report-nums"><div><b>${r.total}</b><small>acontecimentos</small></div><div><b>${r.interactions}</b><small>pessoas interagiram</small></div><div><b>${r.news}</b><small>notícias</small></div><div><b>${r.posts}</b><small>posts na Rede</small></div></div>
      <div class="w-chips">${r.byCat.map((c) => `<span class="w-chip">${esc(c.label)}: ${c.n}</span>`).join('')}</div>
      <h5>Acontecimentos importantes</h5>${r.highlights.map((e) => evRow(e)).join('')}
      <div class="form-actions"><a class="btn outline" href="#/arquivo" data-close>Ver tudo no arquivo</a><button class="btn primary" data-close>Entrar na cidade</button></div></div>`,
  });
}
