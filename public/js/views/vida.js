// Minha Vida — seu personagem na cidade: rosto em pixel (escolha entre os retratos), nível, saúde, reputação,
// trabalho, casa, carro, celular, diplomas, amigos e sua linha do tempo. O hub pessoal fica no perfil.
import { shell, bindEntities, face, nx, evRow, api, esc, icon, toast, modal } from '../world/wui.js';
import { myAvatar } from '../chrome.js';
import { store, setUser } from '../store.js';

const bar = (v, c) => `<i class="vd-bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${c}"></i></i>`;

export default async function render(el) {
  const body = shell(el, 'vida');
  bindEntities(body);
  const load = async () => {
    const [r, h, v, dev, rel, evs] = await Promise.all([
      api.get('/mundo/resumo'), api.get('/mundo/hospital').catch(() => ({ health: 100 })), api.get('/mundo/veiculos').catch(() => ({})),
      api.get('/mundo/dispositivos').catch(() => ({})), api.get('/mundo/relacoes').catch(() => []), api.get('/mundo/eventos?ator=me&limite=12').catch(() => []),
    ]);
    if (!r.born) { body.innerHTML = '<p class="cx-mut">A cidade ainda está nascendo…</p>'; return; }
    const me = r.me; const lo = 40 * (me.level - 1) ** 2; const hi = 40 * me.level ** 2;
    const events = (Array.isArray(evs) ? evs : evs.events || []).slice(0, 10);
    body.innerHTML = `<div class="vd">
      <section class="vd-card cx-card">
        <button class="vd-av" id="vdAv" title="Trocar rosto"><img src="${esc(myAvatar())}" alt=""><span>${icon('edit', 13)}</span></button>
        <h1>${esc(store.user?.name || me.name)}</h1>
        <small>${me.office ? 'Autoridade pública' : me.job ? esc(me.job.role) : 'Cidadã(o)'} · ${esc(me.location || r.city.name)}</small>
        <div class="vd-lvl"><b class="cx-lvl">Nv ${me.level}</b>${bar(((me.xp - lo) / (hi - lo || 1)) * 100, 'linear-gradient(90deg,#38d6f5,#6c4cf5)')}<small>${me.xp} / ${hi} XP</small></div>
        <div class="vd-stats">
          <div><span>${icon('heart', 14)} Saúde</span><b>${h.health}%</b>${bar(h.health, '#2fd27a')}</div>
          <div><span>${icon('star', 14)} Reputação</span><b>${me.reputation}%</b>${bar(me.reputation, '#38d6f5')}</div>
          <div><span>${icon('users', 14)} Popularidade</span><b>${me.popularity}%</b>${bar(me.popularity, '#f472b6')}</div>
          <div><span>${icon('zap', 14)} Influência</span><b>${me.influence}</b>${bar(me.influence, '#f7c948')}</div>
        </div>
        <div class="vd-money"><div><small>Na conta</small><b>${nx(me.balance, 0)}</b></div><div><small>Em mãos</small><b>${nx(me.wallet, 0)}</b></div><div><small>Patrimônio</small><b>${nx(me.netWorth, 0)}</b></div></div>
        <a class="cx-btn" href="#/profile">${icon('dashboard', 14)} Abrir meu hub pessoal</a>
      </section>
      <section class="vd-grid">
        <a class="vd-tile cx-card" href="#/empregos"><span class="cx-h-ic" style="--c:#facc15">${icon('briefcase', 16)}</span><div><small>Trabalho</small><b>${me.job ? esc(me.job.role) : 'Sem emprego'}</b><em>${me.job ? `${esc(me.job.company || '')}${me.job.workedToday ? ' · trabalhou hoje' : ' · ainda não trabalhou hoje'}` : 'Ver vagas'}</em></div></a>
        <a class="vd-tile cx-card" href="#/propriedades"><span class="cx-h-ic" style="--c:#34d399">${icon('home', 16)}</span><div><small>Moradia e imóveis</small><b>${(me.properties ?? null) != null ? `${me.properties} imóvel(is)` : 'Imóveis'}</b><em>Comprar, vender, alugar</em></div></a>
        <a class="vd-tile cx-card" href="#/veiculos"><span class="cx-h-ic" style="--c:#60a5fa">${icon('car', 16)}</span><div><small>Carro</small><b>${v.main ? esc(v.main.name) : 'Sem carro'}</b><em>${v.garage?.length ? `${v.garage.length} na garagem` : 'Ver concessionária'}</em></div></a>
        <button class="vd-tile cx-card" data-dev="phone"><span class="cx-h-ic" style="--c:#a78bfa">${icon('phone', 16)}</span><div><small>Celular</small><b>${dev.phone ? esc(dev.phone.name) : 'Sem celular'}</b><em>${dev.phone ? `${esc(dev.phone.tierLabel)} · ${dev.phone.apps.length} apps` : 'Compre na TechVision'}</em></div></button>
        <button class="vd-tile cx-card" data-dev="wallet"><span class="cx-h-ic" style="--c:#f7c948">${icon('idcard', 16)}</span><div><small>Carteira</small><b>${(dev.wallet?.licenses || []).length} licença(s)</b><em>${(dev.wallet?.access || []).length} cartão(ões) de acesso</em></div></button>
        <a class="vd-tile cx-card" href="#/hospital"><span class="cx-h-ic" style="--c:#f87171">${icon('hospital', 16)}</span><div><small>Saúde</small><b>${h.health}%</b><em>${h.lastCheckup ? 'check-up feito' : 'faça um check-up'}</em></div></a>
        <a class="vd-tile cx-card" href="#/empresas/carreira"><span class="cx-h-ic" style="--c:#fb923c">${icon('school', 16)}</span><div><small>Estudos</small><b>${me.studying ? esc(me.studying.name || 'Estudando') : 'Sem curso'}</b><em>Diplomas e profissões</em></div></a>
        <a class="vd-tile cx-card" href="#/inventario"><span class="cx-h-ic" style="--c:#c084fc">${icon('layers', 16)}</span><div><small>Inventário</small><b>${me.items} item(ns)</b><em>Equipar, usar, vender</em></div></a>
      </section>
      <section class="vd-friends cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#f472b6">${icon('users', 15)}</span><h3>Pessoas próximas</h3><a class="cx-more-l" href="#/social/relacoes">Todas</a></header>
        <div class="vd-people">${rel.slice(0, 10).map((p) => `<button data-person="${esc(p.id)}">${face(p, 52)}<b>${esc(p.name.split(' ')[0])}</b><small>${esc(p.relation?.label || p.relation?.type || '')}</small></button>`).join('') || '<p class="cx-mut">Você ainda não conhece ninguém. Saia pela cidade!</p>'}</div></section>
      <section class="vd-time cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#38d6f5">${icon('activity', 15)}</span><h3>Minha linha do tempo</h3><a class="cx-more-l" href="#/arquivo">Arquivo</a></header>
        ${events.map((e) => evRow(e, { compact: true })).join('') || '<p class="cx-mut">Sua história na cidade começa agora.</p>'}</section>
    </div>`;
    body.querySelector('#vdAv').onclick = pickFace;
  };
  const pickFace = async () => {
    const tiles = Array.from({ length: 123 }, (_, i) => `p${String(i).padStart(3, '0')}`);
    modal({ title: 'Escolha seu rosto', wide: true, body: `<p class="cx-mut">Mesmo estilo pixel art dos personagens da cidade.</p><div class="vd-faces">${tiles.map((t) => `<button data-t="${t}"><img src="/assets/px/${t}.png" alt="" loading="lazy"></button>`).join('')}</div>`,
      onMount: (m, close) => m.querySelectorAll('[data-t]').forEach((b) => { b.onclick = async () => {
        try { const r = await api.put('/profile/avatar-pixel', { tile: b.dataset.t }); setUser(r.user); close(); toast('Rosto atualizado', '', 'success'); await load(); } catch (err) { toast('Não deu', err.message, 'error'); }
      }; }) });
  };
  try { await load(); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; }
}
