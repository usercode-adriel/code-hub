// Locadora Nexus Rent — aluguel diário do Rosso GT. Mostra preço por dia (dia da cidade), termos de vistoria
// (danos cobrados na devolução; sem saldo, a locadora processa) e, com o carro alugado, prazo, estado e devolução.
import { shell, nx, api, esc, icon, toast } from '../world/wui.js';

const fmtLeft = (ms) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
export default async function render(el) {
  const body = shell(el, 'locadora');
  let d = null; let days = 3; let timer = 0;
  const draw = () => {
    const a = d.active; const car = d.car;
    body.innerHTML = `<div class="rt">
      <header class="cx-card rt-head"><span class="cx-h-ic" style="--c:#ef4444">${icon('car', 18)}</span><div><h1>${esc(d.shop)}</h1><p class="cx-mut">Aluguel diário de carro esportivo. Retirada e devolução no Estacionamento Central.</p></div><div class="ob-bal"><small>Saldo</small><b>${nx(d.balance, 0)}</b></div></header>
      <section class="cx-card rt-car"><div class="rt-art"><img src="${esc(car.art)}" alt=""></div>
        <div class="rt-info"><h2>${esc(car.name)}</h2><p class="cx-mut">${car.seats} lugares · ${esc(car.tier)} · velocidade ${Math.round(car.speed * 100)}%</p>
          <div class="rt-price"><b>${nx(d.perDay, 0)}</b><span>por dia</span></div><small class="cx-mut">1 dia de aluguel = 1 dia da cidade (${d.dayMin} min).</small>
          ${a ? `<div class="rt-active"><h3>${icon('check', 14)} Alugado</h3>
              <p>Devolver em <b id="rtLeft">${fmtLeft(a.leftMs)}</b> · pago ${nx(a.paid, 0)} por ${a.days} dia(s)</p>
              <p>Estado da lataria: <b style="color:${a.health > 70 ? '#2fd27a' : a.health > 30 ? '#fbbf24' : '#ff4d5e'}">${Math.round(a.health)}%</b>${a.inRepair ? ' · na oficina' : ''}</p>
              ${a.preview.fee ? `<p class="rt-warn">Vistoria hoje: ${nx(a.preview.fee, 0)} — ${esc(a.preview.items.join('; '))}</p>` : '<p class="up">Sem danos: devolução sem custo extra.</p>'}
              <div class="rt-acts"><a class="cx-btn" href="#/mapa">${icon('map', 14)} Ir ao carro</a><button class="cx-btn ghost" id="rtBack">Devolver agora</button></div></div>`
            : `<div class="rt-days">${[1, 2, 3, 5, 7, 14].map((n) => `<button data-d="${n}" class="${days === n ? 'on' : ''}">${n} dia${n > 1 ? 's' : ''}</button>`).join('')}</div>
              <button class="cx-btn rt-go" id="rtGo">${icon('cart', 14)} Alugar por ${days} dia${days > 1 ? 's' : ''} · ${nx(d.perDay * days, 0)}</button>`}
        </div></section>
      <section class="cx-card rt-terms"><h3>${icon('scale', 15)} Regras da vistoria</h3><ul>
        <li>Carro devolvido inteiro: nenhuma cobrança além da diária.</li>
        <li>Lataria danificada: 180 NXC + 110 NXC por ponto percentual de dano (bater sai bem mais caro que o aluguel).</li>
        <li>Batida que precisou de guincho: taxa de sinistro de 900 NXC. Perda total: mais 4.000 NXC.</li>
        <li>Sem saldo para pagar a vistoria, a locadora entra na Justiça contra você (processo de cobrança no Fórum).</li>
        <li>Quando o prazo acaba, a locadora recolhe o carro sozinha e faz a vistoria.</li></ul></section>
      ${d.history.length ? `<section class="cx-card"><h3>Aluguéis anteriores</h3><ul class="rt-hist">${d.history.map((h) => `<li><small class="cx-mut">${new Date(h.at).toLocaleString('pt-BR')}</small> ${h.days} dia(s) · ${nx(h.paid, 0)}${h.fee ? ` · vistoria ${nx(h.fee, 0)} (${esc(h.result)})` : ' · sem danos'}</li>`).join('')}</ul></section>` : ''}
    </div>`;
    body.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { days = Number(b.dataset.d); draw(); }; });
    body.querySelector('#rtGo')?.addEventListener('click', async () => { try { await api.post('/mundo/locadora/alugar', { dias: days }); toast('Carro alugado', 'O Rosso GT está no Estacionamento Central. Boa viagem!', 'success'); await load(); } catch (err) { toast('Não deu', err.message, 'error'); } });
    body.querySelector('#rtBack')?.addEventListener('click', async () => {
      try { const r = await api.post('/mundo/locadora/devolver', {}); toast('Carro devolvido', r.fee ? `Vistoria: ${nx(r.fee, 0)} (${r.paid})${r.caseN ? ` · processo nº ${r.caseN}` : ''}` : 'Sem danos. Obrigado!', r.fee ? (r.caseN ? 'error' : 'warning') : 'success'); await load(); } catch (err) { toast('Não deu', err.message, 'error'); }
    });
  };
  const load = async () => { d = await api.get('/mundo/locadora'); draw(); };
  try { await load(); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; }
  timer = setInterval(() => { const e = body.querySelector('#rtLeft'); if (e && d?.active) { d.active.leftMs -= 1000; e.textContent = fmtLeft(Math.max(0, d.active.leftMs)); } }, 1000);
  return () => clearInterval(timer);
}
