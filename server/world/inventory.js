// INVENTORY ENGINE — cada compra vira um item persistente com dados, histórico e ações com efeito real:
// software instalável (Central de Comando, Mapa Inteligente), memória dos agentes, smartphone (ligar para amigos),
// câmera (posts com foto e mais fama), Clube VIP (eventos exclusivos e networking), kit do empreendedor,
// campanha publicitária, sessão de estúdio (música na rádio), presentes, revenda e descarte.
import { onDaily, record, services } from './core.js';
import { people, personById, bumpUser, userName, dm, planEvent } from './agents.js';
import { account, credit, BankError, addXp } from './bank.js';
import { companies, companyById } from './economy.js';
import { PRODUCTS, places } from './commerce.js';
import { genderize, userPost } from '../social.js';
import { media } from './media.js';
import { pick, chance, clamp, uid, nowIso, DAY, round2, cap, str } from './util.js';

export const tplOf = (key) => PRODUCTS[key];
export const inv = (w) => account(w).inventory;
const ICON = { tecnologia: 'cpu', social: 'star', geral: 'bag' };

export function makeItem(ctx, { key, price, place, seller }) {
  const w = ctx.w;
  const tpl = tplOf(key);
  const item = {
    id: uid(), key, name: tpl.name, desc: tpl.desc, category: tpl.cat, type: tpl.type, price: round2(price || 0), acquiredAt: ctx.at.toISOString(), placeId: place?.id || null, placeName: place?.name || null,
    sellerId: seller?.id || null, sellerName: seller?.name || null, state: 'novo',
    history: [{ at: ctx.at.toISOString(), text: `Comprado na ${place?.name || '—'} por ${round2(price || 0).toLocaleString('pt-BR')} NXC${seller ? ` (vendedor: ${seller.name})` : ''}` }],
  };
  inv(w).push(item); cap(inv(w), 300);
  return publicItem(item);
}
services.makeItem = makeItem;

export function publicItem(it) {
  const tpl = tplOf(it.key) || {};
  let actions = (tpl.actions || []).slice();
  if (['instalado', 'ativo'].includes(it.state)) actions = actions.filter((a) => !['instalar', 'ativar', 'usar'].includes(a));
  return { ...it, actions, icon: ICON[tpl.cat] || 'bag', compatibility: tpl.target === 'campanha' ? 'Sua empresa ou seu perfil' : 'Uso pessoal' };
}

export function itemAction(ctx, itemId, action, body = {}) {
  const w = ctx.w; const u = account(w);
  const it = inv(w).find((x) => x.id === itemId);
  if (!it) throw new BankError('Item não encontrado no seu inventário');
  if (!publicItem(it).actions.includes(action)) throw new BankError('Essa ação não está disponível para este item');
  const log = (text) => { it.history.push({ at: ctx.at.toISOString(), text }); cap(it.history, 30); };
  const drop = () => { const i = inv(w).indexOf(it); if (i >= 0) inv(w).splice(i, 1); };
  u.installed ??= {};
  if (action === 'instalar') {
    if (it.key === 'central-comando') u.installed.central = true;
    if (it.key === 'mapa-inteligente') u.installed.mapa = true;
    if (it.key === 'memoria') {
      if ((u.memCap || 40) >= 160) throw new BankError('Seus amigos já estão com a memória máxima (160 lembranças)');
      u.memCap = Math.min(160, (u.memCap || 40) + 40);
      for (const p of people(w).filter((x) => x.friend)) p.memCap = u.memCap;
    }
    it.state = 'instalado'; log('Instalado no seu perfil.'); addXp(w, 10);
    return { ok: true, text: { 'central-comando': 'Central de Comando instalada: ela aparece no seu Command Center com seus projetos e tarefas.', 'mapa-inteligente': 'Mapa Inteligente ativo: agora o mapa mostra onde as pessoas estão e os imóveis.', memoria: `Seus amigos agora guardam até ${u.memCap} lembranças e recuperam memórias antigas.` }[it.key] };
  }
  if (action === 'ativar') {
    if (it.key === 'smartphone') u.installed.phone = true;
    if (it.key === 'camera') u.installed.camera = true;
    if (it.key === 'kit-empreendedor') u.installed.kit = true;
    if (it.key === 'clube-vip') { u.vipUntil = new Date(Math.max(Date.now(), new Date(u.vipUntil || 0).getTime()) + 30 * DAY).toISOString(); drop(); }
    it.state = 'ativo'; log('Ativado.'); addXp(w, 5);
    return { ok: true, text: { smartphone: 'Agora você pode ligar para os seus amigos (botão "Ligar" nos relacionamentos).', camera: 'Seus posts na Rede podem ter fotos geradas e rendem mais fama.', 'kit-empreendedor': 'Abrir empresa ficou 40% mais barato e sua empresa ganhou contratação direta.', 'clube-vip': `Você é VIP do Clube Aurora até ${new Date(u.vipUntil).toLocaleDateString('pt-BR')}.` }[it.key] };
  }
  if (action === 'usar') {
    if (it.key === 'cafe') { drop(); addXp(w, 2); return { ok: true, text: 'Café tomado. Energia para mais um dia em Nexus City ☕' }; }
    if (it.key === 'campanha') {
      if (body.alvo === 'empresa') {
        const c = companies(w).find((x) => x.founderId === 'me' && x.status !== 'falida');
        if (!c) throw new BankError('Você não tem empresa ativa. Use a campanha no seu perfil.');
        c.adBoostUntil = new Date(ctx.at.getTime() + 3 * DAY).toISOString(); c.reputation = clamp(c.reputation + 5, 0, 100);
        w.ads ??= []; w.ads.push({ id: uid(), companyId: c.id, hostId: null, text: `${c.name}: ${str(body.texto, 80) || c.slogan || 'venha conhecer!'}`, until: c.adBoostUntil }); cap(w.ads, 60);
        userPost(ctx.uid, `[Patrocinado] ${c.name}: ${str(body.texto, 200) || 'venha conhecer!'}`, { sponsored: true });
      } else {
        u.fameBoostUntil = new Date(ctx.at.getTime() + 3 * DAY).toISOString(); u.fame += 20;
        userPost(ctx.uid, `[Patrocinado] ${str(body.texto, 200) || 'Me segue aqui na Rede!'}`, { sponsored: true });
      }
      drop();
      record(ctx, { type: 'campanha', cat: 'economia', title: `Você lançou uma campanha publicitária (${body.alvo === 'empresa' ? 'empresa' : 'perfil'})`, actors: ['me'], importance: 1 });
      return { ok: true, text: 'Campanha no ar por 3 dias: anúncios nos sites e post patrocinado na Rede.' };
    }
    if (it.key === 'estudio') {
      const title = str(body.titulo, 60) || 'Sem título';
      const M = media(w);
      M.songs.push({ id: uid(), title, artistId: 'me', artistName: ctx.user.name, at: ctx.at.toISOString(), plays: 0, genre: body.tipo === 'podcast' ? 'podcast' : pick(['pop', 'trap', 'MPB', 'eletrônica']) }); cap(M.songs, 80);
      u.fame += 25; addXp(w, 15); drop();
      record(ctx, { type: 'musica', cat: 'entretenimento', title: `${userName(ctx)} lança "${title}"`, text: body.tipo === 'podcast' ? 'Novo podcast.' : 'Nova música na Neon FM.', actors: ['me'], importance: 2 });
      userPost(ctx.uid, `${body.tipo === 'podcast' ? 'Episódio novo do meu podcast' : 'Minha música nova'}: "${title}" 🎧 já tá tocando na Neon FM!`);
      return { ok: true, text: `"${title}" foi gravada e entrou na programação da Neon FM.` };
    }
    throw new BankError('Esse item não tem uso direto');
  }
  if (action === 'transferir') {
    const p = personById(w, body.personaId);
    if (!p?.agent) throw new BankError('Escolha a pessoa');
    const value = it.price || tplOf(it.key).base || 50;
    drop();
    bumpUser(ctx, p, clamp(Math.round(3 + value / 120), 3, 20), { trust: 4, contact: true, note: `${userName(ctx)} me deu ${it.name} de presente.` });
    p.mood = { emotion: 'grata', intensity: 0.7, reason: `ganhou ${it.name}` };
    if (p.friend && p.botId) dm(ctx, p, genderize(p, pick([`Aaah, ${it.name}?! Você não existe 😭 obrigada(o)!`, 'Que presente lindo! Obrigada(o) de verdade.'])), 'presente');
    record(ctx, { type: 'presente', cat: 'pessoal', title: `Você deu ${it.name} para ${p.name}`, actors: ['me', p.id], importance: 1 });
    return { ok: true, text: `${p.name} recebeu o presente.` };
  }
  if (action === 'vender') {
    const base = it.price || tplOf(it.key).base || 50;
    const value = round2(base * (it.state === 'novo' ? 0.5 : 0.35));
    drop();
    if (it.key === 'smartphone' && !inv(w).some((x) => x.key === 'smartphone')) u.installed.phone = false;
    if (it.key === 'camera' && !inv(w).some((x) => x.key === 'camera')) u.installed.camera = false;
    credit(w, value, `Venda de ${it.name}`, ctx.at, 'venda');
    return { ok: true, text: `Vendido por ${value.toLocaleString('pt-BR')} NXC.` };
  }
  if (action === 'descartar') { drop(); return { ok: true, text: 'Item descartado.' }; }
  throw new BankError('Ação inválida');
}

// Clube VIP: networking com gente influente e festas exclusivas enquanto a assinatura vale
onDaily((ctx) => {
  const w = ctx.w; const u = account(w);
  if (!u.vipUntil || u.vipUntil < ctx.at.toISOString()) return;
  u.fame += 3;
  const famous = people(w).filter((p) => p.agent && (p.followers || 0) > 8000 && p.agent.status === 'ativo');
  const contact = pick(famous);
  if (contact) bumpUser(ctx, contact, 4, { note: `Conheci ${userName(ctx)} no Clube Aurora VIP.` });
  if (chance(0.25)) {
    const club = places(w).find((p) => p.name === 'Clube Aurora VIP');
    const host = personById(w, companyById(w, club?.companyId)?.ceoId) || contact;
    if (host) planEvent(ctx, host, 'festa', { title: 'Noite VIP no Clube Aurora', place: club, inviteUser: true, extra: { vip: true } });
  }
});
// fama impulsionada pela campanha de perfil
onDaily((ctx) => { const u = account(ctx.w); if (u.fameBoostUntil > ctx.at.toISOString()) u.fame += 15; });
