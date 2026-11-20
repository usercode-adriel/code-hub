// Conversas no mapa: dois moradores que se encontram na rua param, ficam de frente um para o outro e trocam falas em
// turnos (um balão por vez, acima de quem fala). O conteúdo vem do servidor (/mundo/dialogo/gerar), que também decide
// o desfecho e as relações. Aqui só há o agendamento e a reprodução. Sem DOM: dá para testar em Node.
const MAX_TALKS = 3; // conversas simultâneas na tela (desempenho)
const SCAN_EVERY = 1.2; // segundos entre buscas de pares
const RANGE = 44; // distância máxima (unidades do mapa) para dois moradores conversarem
const PAIR_COOL_MS = 45000; // tempo real antes de um mesmo par voltar a conversar

// quebra o texto em linhas de no máximo `max` caracteres (balão com quebra automática de linha)
export function wrapText(text, max = 26) {
  const words = String(text || '').split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}
// duração de um balão: proporcional ao tamanho da fala, dentro de limites confortáveis
export const balloonSecs = (text) => Math.min(6.5, Math.max(2.2, 1.6 + String(text || '').length * 0.06));
// ícone do humor no balão
export const EMO_ICON = { feliz: '🙂', irritado: '😠', triste: '😢', surpresa: '❗', neutro: '' };

export function createTalks({ P, request, now = () => performance.now(), rand = Math.random }) {
  const S = { active: [], pending: 0, cool: new Map(), scanT: 0 };
  const canTalk = (p) => p.real && !p.talk && (p.state === 'walk' || p.state === 'olhando') && !(p.pause > 0); // pause fica levemente negativo depois de uma parada
  const keyOf = (a, b) => [a.id, b.id].sort().join('|');
  const face = (p, q) => { p.a = Math.atan2(q.y - p.y, q.x - p.x); p.face = q.x < p.x ? -1 : 1; };

  function start(a, b, data) {
    const talk = { a, b, lines: data.lines, i: 0, t: 0, done: false, hold: 0 };
    for (const [me, other] of [[a, b], [b, a]]) { me.state = 'conversa'; me.talk = { with: other, talk }; face(me, other); }
    S.active.push(talk); return talk;
  }
  function end(talk) {
    if (talk.done) return; talk.done = true;
    for (const p of [talk.a, talk.b]) { if (p.talk?.talk === talk) { p.talk = null; if (p.state === 'conversa') p.state = 'walk'; } }
    S.cool.set(keyOf(talk.a, talk.b), now());
  }

  // procura pares de moradores parados ou andando perto um do outro, dentro da área visível
  S.scan = (dt, view) => {
    S.scanT -= dt; if (S.scanT > 0) return; S.scanT = SCAN_EVERY;
    if (S.active.length >= MAX_TALKS || S.pending >= 1) return;
    const list = P.peds.filter((p) => canTalk(p) && Math.hypot(p.x - view.x, p.y - view.y) < view.r + 120); // inclui a borda da tela: a conversa entra na cena
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i]; const b = list[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) > RANGE) continue;
      const cool = S.cool.get(keyOf(a, b)); if (cool != null && now() - cool < PAIR_COOL_MS) continue;
      if (rand() > 0.55) continue; // nem todo encontro vira conversa
      S.pending++;
      Promise.resolve(request(a.id, b.id)).then((data) => {
        S.pending--;
        if (!data || data.skipped || !data.lines?.length) return;
        if (!canTalk(a) || !canTalk(b) || S.active.length >= MAX_TALKS) return;
        start(a, b, data);
      }).catch(() => { S.pending--; });
      return; // um pedido por busca
    }
  };

  // avança as falas: um balão por vez; quem não fala fica virado para quem fala
  S.tick = (dt) => {
    for (const talk of S.active) {
      if (talk.done) continue;
      // se alguém saiu da conversa (foi atropelado, correu, entrou em cena), a conversa acaba
      if (talk.a.state !== 'conversa' || talk.b.state !== 'conversa' || talk.a.talk?.talk !== talk || talk.b.talk?.talk !== talk) { end(talk); continue; }
      if (talk.hold > 0) { talk.hold -= dt; if (talk.hold <= 0) end(talk); continue; }
      talk.t -= dt;
      if (talk.t > 0) continue;
      if (talk.i >= talk.lines.length) { talk.hold = 1.2; continue; }
      const line = talk.lines[talk.i++];
      const speaker = line.who === 'a' ? talk.a : talk.b; const other = speaker === talk.a ? talk.b : talk.a;
      face(speaker, other); face(other, speaker);
      const secs = balloonSecs(line.text);
      speaker.say = { text: line.text, emo: line.emo, until: now() + secs * 1000 };
      talk.t = secs + 0.45;
    }
    S.active = S.active.filter((t) => !t.done);
  };
  return S;
}
