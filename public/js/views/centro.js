// Início — o mapa da cidade é o protagonista (layout da referência): mapa em pixel no centro com pontos
// clicáveis, LIVE da Cidade à direita e, embaixo, ações rápidas, notícias, eventos em destaque, entretenimento,
// atividades recentes, economia e redes sociais. Tudo vem do estado real do mundo.
import { on, store } from '../store.js';
import { nascendo, face, nx, pct, spark, evRow, bindEntities, CAT_COLOR, api, esc, timeAgo, icon, modal } from '../world/wui.js';
import { cityMap } from '../world/citymap.js';
import { livePanel } from '../world/live.js';
import { cityNow, setCityClock } from '../chrome.js';

const QUICK = [
  ['#/empregos', 'briefcase', 'Trabalhar', '#fb923c'], ['#/mercado', 'cart', 'Comprar', '#a78bfa'], ['#/mapa', 'car', 'Dirigir', '#60a5fa'],
  ['#/empresas/bolsa', 'trending', 'Investir', '#4ade80'], ['#/banco/pendencias', 'file', 'Pagar contas', '#38bdf8'], ['#/empresas/empresa', 'bag', 'Abrir loja', '#f472b6'],
];
const NEWS_ART = { politica: 'scene-cidade', economia: 'scene-comercio', tecnologia: 'scene-aeroporto', entretenimento: 'scene-estadio', esportes: 'scene-estadio', seguranca: 'scene-bairro', ciencia: 'scene-aeroporto', celebridades: 'scene-praia', sociedade: 'scene-parque', local: 'scene-bairro', pessoal: 'scene-parque' };
const art = (cat) => `/assets/pixel/${NEWS_ART[cat] || 'scene-cidade'}.png`;
// filtros do mapa (pontos clicáveis por tipo de lugar)
const MAP_FILTERS = [
  ['tudo', 'Tudo', null],
  ['comercio', 'Comércio', ['loja-tec', 'loja-social', 'shopping', 'mercado', 'cafe', 'padaria', 'restaurante', 'bar', 'farmacia', 'posto', 'clube']],
  ['servicos', 'Serviços', ['banco', 'delegacia', 'tribunal', 'hospital', 'clinica', 'escola', 'empregos', 'imobiliaria', 'prefeitura', 'oficina', 'publicidade']],
  ['lazer', 'Lazer', ['turismo', 'cinema', 'academia', 'hotel', 'bar', 'clube', 'parque']],
];

export default async function render(el) {
  el.innerHTML = '<div class="w-env cx-page" data-env="centro"><div class="w-body" id="wBody"></div></div>';
  const body = el.querySelector('#wBody');
  let stop = null; let off = null; let pending = null; let stopLive = null; let map = null; let geo = null; let layers = null;
  const load = async () => {
    const d = await api.get('/mundo/resumo');
    if (!d.born) { stop = nascendo(body, load); return; }
    setCityClock(d.clock);
    paint(d);
  };
  const paint = (d) => {
    const ev = d.invites.next;
    body.innerHTML = `<div class="hx">
      <section class="hx-map cx-card">
        <header class="cx-card-h"><span class="cx-h-ic" style="--c:#f87171">${icon('pin', 16)}</span><h3>Mapa da Cidade</h3>
          <div class="hx-filters">${MAP_FILTERS.map(([k, l], i) => `<button data-mf="${k}" class="${i ? '' : 'on'}">${l}</button>`).join('')}</div>
          <a class="cx-more-l" href="#/mapa">Ver completo ${icon('chevRight', 13)}</a></header>
        <div class="hx-map-host" id="hxMap"><div class="skeleton" style="height:100%"></div></div>
        <div class="hx-loc">${icon('pin', 13)} <b>${esc(d.me.location || 'Centro')}</b> · ${esc(d.city.name || 'Nexus City')}${d.weather ? ` <span>${d.weather.icon} ${d.weather.temp}°C</span>` : ''}</div>
      </section>
      <aside class="hx-live cx-card" id="hxLive"></aside>

      <section class="hx-quick cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#facc15">${icon('zap', 16)}</span><h3>Ações rápidas</h3></header>
        <div class="hx-qgrid">${QUICK.map(([h, ic, l, c]) => `<a href="${h}" style="--c:${c}"><span>${icon(ic, 24)}</span><b>${l}</b></a>`).join('')}</div></section>

      <section class="hx-news cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#60a5fa">${icon('news', 16)}</span><h3>Notícias da Cidade</h3><a class="cx-more-l" href="#/midia">Ver todas</a></header>
        <div class="hx-nlist">${d.news.slice(0, 3).map((n) => `<a class="hx-n" href="#/internet/artigo/${esc(n.id)}"><img src="${art(n.cat)}" alt=""><div><b>${esc(n.title)}</b><small>${esc(timeAgo(n.at))} · ${esc(n.site?.name || n.catLabel || '')}</small></div></a>`).join('') || '<p class="cx-mut">Sem notícias por enquanto.</p>'}</div></section>

      <section class="hx-event cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#c084fc">${icon('calendar', 16)}</span><h3>Eventos em destaque</h3><a class="cx-more-l" href="#/social/eventos">Ver todos</a></header>
        ${ev ? `<div class="hx-ev" style="--bg:url('/assets/pixel/scene-estadio.png')"><span class="hx-ev-date">${new Date(ev.at).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            <div class="hx-ev-tx"><b>${esc(ev.title)}</b><small>${esc(ev.place?.name || ev.place || '')} · ${ev.going} confirmados</small></div><a class="cx-btn sm" href="#/social/eventos">${ev.user === 'pendente' ? 'Participar' : 'Ver detalhes'} ${icon('chevRight', 12)}</a></div>`
        : d.election ? `<div class="hx-ev" style="--bg:url('/assets/pixel/scene-cidade.png')"><span class="hx-ev-date">Até ${new Date(d.election.ends).toLocaleDateString('pt-BR')}</span>
            <div class="hx-ev-tx"><b>${esc({ mandato: 'Próxima eleição', inscricoes: 'Inscrições abertas', campanha: 'Campanha eleitoral', apuracao: 'Apuração hoje' }[d.election.phase] || 'Eleição')}</b><small>Eleição nº ${d.election.n} da cidade</small></div><a class="cx-btn sm" href="#/governo">Ver candidatos ${icon('chevRight', 12)}</a></div>`
        : `<div class="hx-ev" style="--bg:url('/assets/pixel/scene-parque.png')"><div class="hx-ev-tx"><b>Nenhum evento marcado</b><small>Os convites das pessoas da cidade aparecem aqui.</small></div><a class="cx-btn sm ghost" href="#/social/eventos">Ver eventos</a></div>`}</section>

      <section class="hx-fun cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#f472b6">${icon('play', 16)}</span><h3>Jogos e entretenimento</h3><a class="cx-more-l" href="#/diversao">${icon('chevRight', 13)}</a></header>
        <div class="hx-fun-art"><img src="/assets/pixel/scene-estadio.png" alt=""><div><b>Quiz de Nexus City</b><small>Responda sobre a cidade e ganhe NXC e XP.</small><a class="cx-btn sm" href="#/diversao">Jogar agora ${icon('chevRight', 12)}</a></div></div>
        <div class="hx-fun-l"><a href="#/midia/tv">${icon('play', 14)} TV e rádio</a><a href="#/social/eventos">${icon('users', 14)} Festas</a><a href="#/internet">${icon('globe', 14)} Internet</a></div></section>

      <section class="hx-acts cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#2fd27a">${icon('activity', 16)}</span><h3>Atividades recentes</h3><a class="cx-more-l" href="#/acontecimentos">Ver tudo</a></header>
        <div class="hx-alist">${d.events.slice(0, 6).map((e) => evRow(e, { compact: true })).join('') || '<p class="cx-mut">Nada aconteceu ainda.</p>'}</div></section>

      <section class="hx-eco cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#4ade80">${icon('trending', 16)}</span><h3>Economia</h3><a class="cx-more-l" href="#/empresas/bolsa">Bolsa</a></header>
        <div class="hx-eco-top"><div><small>Índice NXC</small><b>${Math.round(d.economy.index).toLocaleString('pt-BR')}</b><em class="${d.economy.change >= 0 ? 'up' : 'down'}">${d.economy.change >= 0 ? '▲' : '▼'} ${pct(d.economy.change)}</em></div>${spark(d.economy.history, { w: 150, h: 50, color: d.economy.change >= 0 ? '#2fd27a' : '#ff4d5e' })}</div>
        <div class="hx-movers">${d.economy.movers.slice(0, 3).map((c) => `<button data-company="${esc(c.id)}"><span style="--c:${esc(c.color)}">${esc(c.name[0])}</span><b>${esc(c.name)}</b><em class="${c.change >= 0 ? 'up' : 'down'}">${pct(c.change)}</em></button>`).join('')}</div>
        <small class="cx-mut">Inflação do mês ${d.economy.inflation.toLocaleString('pt-BR')}% · patrimônio ${nx(d.me.netWorth, 0)}</small></section>

      <section class="hx-soc cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#38d6f5">${icon('users', 16)}</span><h3>Redes sociais</h3><a class="cx-more-l" href="#/social">Abrir</a></header>
        <div class="hx-slist">${d.social.slice(0, 4).map((p) => `<a class="hx-post" href="#/social">${p.me ? face({ me: true }, 34) : `<span data-person="${esc(p.author?.id)}">${face(p.author, 34)}</span>`}<div><b>${esc(p.me ? 'Você' : p.author?.name || '')}</b><p>${esc((p.text || '').slice(0, 110))}</p><small>${esc(timeAgo(p.at))}</small></div></a>`).join('') || '<p class="cx-mut">Ninguém postou ainda.</p>'}</div></section>
    </div>`;
    stopLive?.();
    stopLive = livePanel(body.querySelector('#hxLive'), { scope: 'cidade', title: 'Live da Cidade', art: '/assets/pixel/scene-cidade.png', n: 12 });
    body.querySelectorAll('[data-mf]').forEach((b) => {
      b.onclick = () => {
        body.querySelectorAll('[data-mf]').forEach((x) => x.classList.toggle('on', x === b));
        const f = MAP_FILTERS.find(([k]) => k === b.dataset.mf)?.[2];
        map?.setFilter(f ? new Set(f) : null);
      };
    });
    drawMap();
  };
  const drawMap = async () => {
    const host = body.querySelector('#hxMap'); if (!host) return;
    try {
      geo ??= await api.get('/mundo/mapa/geo');
      layers = await api.get('/mundo/mapa/camadas');
      map?.destroy?.();
      map = cityMap(host, geo, {
        onPick: (p) => {
          if (p.type === 'place') location.hash = `#/mapa/${p.id}`;
          else if (p.type === 'house') location.hash = `#/mapa?casa=${p.id}`;
          else if (p.type === 'district') location.hash = `#/mapa?bairro=${p.id}`;
        },
      });
      map.setData(layers);
      const nightTick = () => map?.setNight?.(cityNow().night); nightTick(); clearInterval(drawMap.t); drawMap.t = setInterval(nightTick, 5000);
    } catch { host.innerHTML = '<p class="cx-mut" style="padding:20px">O mapa ainda está sendo desenhado…</p>'; }
  };
  bindEntities(body);
  await load();
  api.get('/mundo/relatorio').then((r) => { if (r) report(r); }).catch(() => {});
  off = on('world', (ev) => { if (ev.type === 'event' && ev.event.importance >= 3) { clearTimeout(pending); pending = setTimeout(() => load().catch(() => {}), 1500); } });
  return () => { stop?.(); off?.(); clearTimeout(pending); stopLive?.(); clearInterval(drawMap.t); map?.destroy?.(); };
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
export { CAT_COLOR, store };
