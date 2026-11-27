// Monta o prompt de uma personagem do Cripcoin Office a partir do que o jogo envia (nome, cargo, personalidade, defeitos, habilidades...).
// Tudo é validado e cortado aqui: o servidor nunca confia no tamanho do que chega do navegador.
/** O trabalho da equipe: afiliadas da Temu e da Shopee. Comentários profissionais giram em torno disso, com espaço para brincadeiras. */
export const TRABALHO = 'O trabalho da equipe: vocês são afiliadas da Temu e da Shopee — garimpam achadinhos, montam vídeos e posts, divulgam links de afiliado, acompanham cliques, vendas, comissões e cupons. Fale de trabalho com naturalidade, mas também faça piadas e descontraia.';
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
    TRABALHO,
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

/** Prompt para um diálogo curto ENTRE as personagens (sem o jogador): devolve linhas "Nome: fala". */
export function montarPromptEquipe(corpo) {
  const pessoas = (Array.isArray(corpo.pessoas) ? corpo.pessoas.slice(0, 4) : []).map((p) => ({ nome: cut(p.nome, 30), cargo: cut(p.cargo, 40), personalidade: lista(p.personalidade, 6, 30), defeitos: lista(p.defeitos, 4, 30) })).filter((p) => p.nome);
  if (pessoas.length < 2) throw Object.assign(new Error('É preciso ao menos duas pessoas acordadas para conversarem.'), { status: 400 });
  const ctx = corpo.contexto || {}; const recentes = lista(corpo.recentes, 6, 160);
  const system = [
    `Você escreve diálogos curtos e naturais entre colegas de um pequeno escritório chamado "${cut(ctx.escritorio, 40)}" (empresa "${cut(ctx.empresa, 40)}").`, TRABALHO,
    'Pessoas:', ...pessoas.map((p) => `- ${p.nome} (${p.cargo || 'afiliada'}): personalidade ${p.personalidade.join(', ') || 'neutra'}${p.defeitos.length ? `; defeitos ${p.defeitos.join(', ')}` : ''}.`),
    `Agora são ${cut(ctx.hora, 10)}.`,
    'Regras: escreva de 2 a 4 falas, uma por linha, no formato "Nome: fala". Cada fala com no máximo 120 caracteres, português do Brasil coloquial, sem markdown, sem aspas, sem narração. Alterne entre assunto de trabalho (Temu/Shopee, links, vendas, cupons, vídeos) e brincadeira leve. Não repita os assuntos recentes.',
  ].join('\n');
  const prompt = `${recentes.length ? `Assuntos recentes (não repetir):\n${recentes.join('\n')}\n\n` : ''}Escreva o próximo diálogo entre ${pessoas.map((p) => p.nome).join(' e ')}:`;
  return { system, prompt, nomes: pessoas.map((p) => p.nome) };
}
/** Lê as linhas "Nome: fala" (só nomes conhecidos), limpa e limita. */
export function lerDialogo(texto, nomes) {
  const out = [];
  for (const linha of String(texto || '').split(/\r?\n/)) {
    const m = linha.replace(/^[-*\d.\s]+/, '').match(/^\**([^:*]{1,40})\**\s*:\s*(.+)$/); if (!m) continue;
    const quem = nomes.find((n) => n.toLowerCase() === m[1].trim().toLowerCase()); const fala = limparResposta(m[2], quem || '').slice(0, 160);
    if (quem && fala) out.push({ quem, texto: fala });
    if (out.length >= 4) break;
  }
  return out;
}
