// GAMECODE: sistema de edição do jogo. Reúne as ferramentas de criação e os mapas salvos em um só lugar.
// Seções: Assets e tilesets (gerador de assets e editor de mapa), Editor de sprite (pixel e 3D, separados) e Mapas salvos
// (editar, jogar e excluir). O mapa do jogo continua existindo: é aberto pelo botão "Jogar" de um mapa salvo.
import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, toast } from '../ui.js';

const CARD = 'display:block;padding:14px;text-decoration:none;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)';

const FERRAMENTAS = {
  assets: [
    { href: '#/studio', icone: 'layers', titulo: 'Gerador de assets e estruturas', texto: 'Structure Studio: componentes, prédios, vias e prefabs, com geração por IA de imagem.' },
    { href: '#/criar-mapa', icone: 'map', titulo: 'Editor de tilesets e mapa', texto: 'Criar mapa: terreno, peças e estruturas posicionadas no mundo.' },
  ],
  sprite: [
    { href: '#/personagens', icone: 'user', titulo: 'Sprite pixel (LPC)', texto: 'Personagens em pixel art: corpo, roupas, cabelo, chapéu e prévia animada.' },
    { href: '#/personagem3d', icone: 'palette', titulo: 'Sprite 3D', texto: 'Os mesmos movimentos do pixel, com textura de personagem 3D.' },
  ],
};

export default async function render(el) {
  el.innerHTML = `<section class="card" style="padding:16px">
    <h3 class="title">Gamecode</h3>
    <p class="muted">Edite o jogo: assets, tilesets, sprites e os mapas que você criou.</p>
    <h4 style="margin:14px 0 6px">Assets e tilesets</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">${FERRAMENTAS.assets.map(cartao).join('')}</div>
    <h4 style="margin:18px 0 6px">Editor de sprite</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">${FERRAMENTAS.sprite.map(cartao).join('')}</div>
    <h4 style="margin:18px 0 6px">Mapas salvos</h4>
    <div id="gcMapas"><p class="muted">Carregando os mapas…</p></div>
  </section>`;
  await mapas(el);
}

const cartao = (f) => `<a href="${f.href}" style="${CARD}"><div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">${icon(f.icone, 18)}<b>${esc(f.titulo)}</b></div><div class="muted" style="font-size:13px">${esc(f.texto)}</div></a>`;

async function mapas(el) {
  const box = el.querySelector('#gcMapas');
  let dados;
  try { dados = await api.get('/mapas'); } catch (err) { box.innerHTML = `<p class="muted">Não consegui carregar os mapas: ${esc(err.message)}</p>`; return; }
  const { mapas: lista, vida } = dados;
  if (!lista.length) { box.innerHTML = '<p class="muted">Nenhum mapa salvo ainda. Crie um em <a href="#/criar-mapa">Editor de tilesets e mapa</a>.</p>'; return; }
  box.innerHTML = `<div style="display:grid;gap:8px">${lista.map((m) => `<div class="card" style="padding:10px;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">
      <div style="min-width:0"><b>${esc(m.nome)}</b> ${m.id === vida ? '<span class="chip">Jogo usa este</span>' : ''}
        <div class="muted" style="font-size:12px">${m.largura}×${m.altura} células · ${m.itens} peças${m.atualizado ? ` · salvo ${esc(new Date(m.atualizado).toLocaleDateString('pt-BR'))}` : ''}</div></div>
      <div class="row" style="gap:6px">
        <a class="btn sm" href="#/criar-mapa?id=${esc(m.id)}">${icon('edit', 13)} Editar</a>
        <button class="btn sm primary" data-jogar="${esc(m.id)}">${icon('play', 13)} Jogar</button>
        <button class="btn sm" data-excluir="${esc(m.id)}" style="color:#f87171">${icon('trash', 13)} Excluir</button>
      </div></div>`).join('')}</div>`;
  box.querySelectorAll('[data-jogar]').forEach((b) => { b.onclick = async () => {
    try { await api.post(`/mapas/${b.dataset.jogar}/vida`, {}); location.hash = '#/mapa'; }
    catch (err) { toast('Mapas', err.message, 'warning'); }
  }; });
  box.querySelectorAll('[data-excluir]').forEach((b) => { b.onclick = async () => {
    const m = lista.find((x) => x.id === b.dataset.excluir);
    if (!confirm(`Excluir o mapa "${m?.nome || ''}"? Essa ação não tem volta.`)) return;
    try { await api.del(`/mapas/${b.dataset.excluir}`); toast('Mapas', 'Mapa excluído.', 'success'); mapas(el); }
    catch (err) { toast('Mapas', err.message, 'warning'); }
  }; });
}
