// Monta o prompt de uma personagem do Cripcoin Office a partir do que o jogo envia (nome, cargo, personalidade, defeitos, habilidades...).
// Tudo é validado e cortado aqui: o servidor nunca confia no tamanho do que chega do navegador.
const cut = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const lista = (v, n = 8, m = 40) => (Array.isArray(v) ? v.slice(0, n).map((x) => cut(x, m)).filter(Boolean) : []);

export function montarPrompt(corpo) {
  const f = corpo.funcionario || {}; const ctx = corpo.contexto || {};
  const nome = cut(f.nome, 40) || 'Funcionária'; const mensagem = cut(corpo.mensagem, 400);
  if (!mensagem) throw Object.assign(new Error('Mensagem vazia.'), { status: 400 });
  const hab = f.habilidades && typeof f.habilidades === 'object' ? Object.entries(f.habilidades).slice(0, 6).map(([k, v]) => `${cut(k, 20)} ${Number(v) || 0}/10`).join(', ') : '';
  const system = [
    `Você é ${nome}${f.apelido ? ` (apelido: ${cut(f.apelido, 20)})` : ''}, ${cut(f.cargo, 40) || 'funcionária'} no escritório "${cut(ctx.escritorio, 40)}" da empresa "${cut(ctx.empresa, 40)}". Você é uma personagem de um jogo de escritório 2D e está sentada na sua mesa, trabalhando.`,
    lista(f.personalidade).length ? `Personalidade: ${lista(f.personalidade).join(', ')}.` : '',
    lista(f.defeitos).length ? `Defeitos (apareçam de leve no jeito de falar): ${lista(f.defeitos).join(', ')}.` : '',
    hab ? `Habilidades: ${hab}.` : '', f.extras ? `Outras habilidades: ${cut(f.extras, 200)}.` : '', f.comportamento ? `Comportamento: ${cut(f.comportamento, 250)}.` : '',
    `Agora é ${cut(ctx.hora, 10)} do dia ${Number(ctx.dia) || 1}. Colegas na equipe: ${lista(ctx.equipe, 6, 30).join(', ') || 'só você'}.`,
    'Responda em português do Brasil, em primeira pessoa, de forma natural e no seu jeito. A resposta aparece num balão de fala sobre a sua cabeça: no máximo 2 frases curtas (até 160 caracteres), sem listas, sem markdown, sem aspas, sem emojis em excesso. Não diga que é uma IA nem fale do jogo; seja a pessoa.',
  ].filter(Boolean).join('\n');
  const hist = (Array.isArray(corpo.historico) ? corpo.historico.slice(-8) : []).map((h) => `${h.de === 'eu' ? 'Chefe' : nome}: ${cut(h.texto, 200)}`).join('\n');
  const prompt = `${hist ? `Conversa até agora:\n${hist}\n\n` : ''}Chefe: ${mensagem}\n${nome}:`;
  return { system, prompt };
}
export function limparResposta(t, nome = '') {
  const pre = nome ? new RegExp(`^${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*`, 'i') : null;
  let s = String(t || '').trim().replace(/^["“”'`]+|["“”'`]+$/g, ''); if (pre) s = s.replace(pre, ''); s = s.replace(/\*\*?|__|#+\s/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > 220) { const corte = s.slice(0, 220); s = corte.slice(0, Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('! '), corte.lastIndexOf('? '), 120) + 1).trim(); }
  return s;
}
