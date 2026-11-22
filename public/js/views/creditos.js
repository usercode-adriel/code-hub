// CRÉDITOS: autores e licenças das peças de arte de terceiros usadas no jogo (personagens do LPC).
// Lê public/assets/personagens/CREDITS.txt e mostra uma lista legível, com as licenças em destaque.
import { esc } from '../ui.js';

export default async function render(el) {
  let texto = '';
  try { texto = await (await fetch('/assets/personagens/CREDITS.txt')).text(); } catch { /* sem arquivo */ }
  const blocos = texto.split(/\n\n+/).slice(1).map((b) => b.trim()).filter(Boolean);
  const itens = blocos.map((b) => {
    const [arq, ...resto] = b.split('\n');
    const campos = Object.fromEntries(resto.map((l) => l.trim().split(/:\s(.+)/).slice(0, 2)).filter((x) => x.length === 2));
    return { arq: arq.trim(), autores: campos.autores || '', licencas: campos['licenças'] || '', fonte: campos.fonte || '' };
  });
  el.innerHTML = `<section class="card"><h3 class="title">Créditos</h3>
    <p class="muted">Os personagens usam peças do <b>Universal LPC Spritesheet Character Generator</b> (Liberated Pixel Cup). Cada peça tem autor e licença próprios. As licenças são GPL-3.0, CC-BY-SA, CC-BY e OGA-BY; as derivadas seguem as mesmas condições.</p>
    <p class="muted" style="font-size:12px">${itens.length} arquivo(s) de arte listados.</p>
    <div style="display:grid;gap:8px">
      ${itens.map((i) => `<div class="card" style="padding:10px"><code style="font-size:11px">${esc(i.arq)}</code>
        <div style="font-size:12px">Autores: ${esc(i.autores)}</div><div style="font-size:12px">Licenças: <b>${esc(i.licencas)}</b></div>
        ${i.fonte ? `<div style="font-size:11px;word-break:break-all" class="muted">${esc(i.fonte)}</div>` : ''}</div>`).join('') || '<p>Nenhum crédito encontrado.</p>'}
    </div></section>`;
}
