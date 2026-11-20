// EVENTOS URBANOS — o canal comum entre os sistemas da cidade (trânsito, acidentes, emergência, guinchos, polícia,
// crimes e moradores). Em vez de cada sistema varrer os outros, eles publicam e assinam eventos:
//   'acidente'   { x, y, cars, grave }        → trânsito evita, emergência e guinchos são chamados
//   'bloqueio'   { lane }  / 'liberado' { lane } → rotas e escolhas nos cruzamentos evitam a faixa
//   'ocorrencia' { tipo, x, y }               → polícia
//   'roubo'      { car, x, y, suspeito, ladrao } → denúncia, procurado, perseguição
//   'procurado'  { nivel, motivo }            → HUD e IA policial
//   'prisao'     { quem, motivo }             → fim da perseguição
// Também guarda o registro de faixas bloqueadas (carro batido, viatura atendendo, obra, bloqueio policial), refeito
// a cada quadro pelo trânsito: quem bloqueia publica; quando sai, a faixa volta a ser liberada (evento 'liberado').
export function createCityEvents() {
  const subs = new Map(); const log = [];
  let cur = new Map(); let prev = new Map(); const manual = new Map();
  const E = {
    on(type, fn) { if (!subs.has(type)) subs.set(type, new Set()); subs.get(type).add(fn); return () => subs.get(type).delete(fn); },
    emit(type, data = {}) { log.push({ type, at: Date.now(), ...data }); if (log.length > 200) log.shift(); for (const fn of subs.get(type) || []) { try { fn(data); } catch (e) { console.error(e); } } },
    log,
    // ---- faixas bloqueadas
    beginFrame() { prev = cur; cur = new Map(); },
    block(lane, by) { if (!lane) return; let s = cur.get(lane); if (!s) cur.set(lane, (s = new Set())); s.add(by); },
    endFrame() {
      for (const [lane] of cur) if (!prev.has(lane) && !manual.has(lane)) E.emit('bloqueio', { lane });
      for (const [lane] of prev) if (!cur.has(lane) && !manual.has(lane)) E.emit('liberado', { lane });
    },
    // bloqueio manual (obra, bloqueio policial): fica até ser liberado
    close(lane, why = 'obra') { manual.set(lane, why); E.emit('bloqueio', { lane, why }); },
    open(lane) { if (manual.delete(lane)) E.emit('liberado', { lane }); },
    blocked(lane) { return Boolean(lane && (cur.has(lane) || manual.has(lane))); },
    blockedEdge(edge) { for (const l of cur.keys()) if (l.edge === edge) return true; for (const l of manual.keys()) if (l.edge === edge) return true; return false; },
    reset() { cur = new Map(); prev = new Map(); manual.clear(); subs.clear(); log.length = 0; },
  };
  return E;
}
// instância única da cidade (os módulos do mapa compartilham)
export const CITY = createCityEvents();
