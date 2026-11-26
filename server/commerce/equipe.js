// EQUIPE DO COMMERCE OFFICE 2.1 — orquestração das ORDENS DO CHEFE.
// O chefe escreve uma ordem em linguagem natural; o sistema interpreta, escolhe os responsáveis, deixa os agentes discutirem entre si
// (falas geradas pela IA real, com limite de turnos e de orçamento) e então cria e despacha as tarefas reais (ferramentas do Hub).
// Falar NÃO é executar: o que vale como resultado são tarefas, documentos, produtos e movimentos de estoque registrados.
// Nenhuma fala é inventada pelo servidor: se a IA não está configurada, a ordem é recusada com a explicação (nada é simulado).
import { area, auditar, erro, txt, hoje, id, now, save } from './store.js';
import { acharAgente, criarTarefaOrquestrada, despachar, garantirAgentes, resumoAgente } from './agentes.js';
import { acharTarefa } from './dados.js';

export const TIPOS_MSG = ['ordem', 'conversa', 'ideia', 'pergunta', 'alerta', 'discordancia', 'conclusao', 'sistema'];
const TIPOS_FALA = ['conversa', 'ideia', 'pergunta', 'alerta', 'discordancia', 'conclusao'];
export const STATUS_ORDEM = { recebida: 'Ordem recebida', planejada: 'Tarefa planejada', em_execucao: 'Em execução', aguardando_aprovacao: 'Aguardando aprovação', concluida: 'Concluída', falha: 'Falha', bloqueada: 'Bloqueio', cancelada: 'Cancelada' };
const FASES_ATIVAS = ['recebida', 'planejando', 'discutindo', 'executando'];
const MAX_RESPONSAVEIS = 5; const MAX_FALA = 240; const HARD_TURNOS = 12;
const jobs = new Map(); const cancelamentos = new Set();

export const emOrdem = (userId) => jobs.has(userId);

// ---------- configuração e orçamento ----------
export const config = (userId) => area(userId).equipeConfig;
export function atualizarConfig(userId, p) {
  const c = config(userId); const n = (v, min, max, atual) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : atual; };
  if ('maxTurnos' in p) c.maxTurnos = n(p.maxTurnos, 2, HARD_TURNOS, c.maxTurnos);
  if ('balaoSegundos' in p) c.balaoSegundos = n(p.balaoSegundos, 3, 20, c.balaoSegundos);
  if ('limiteChamadasDia' in p) c.limiteChamadasDia = n(p.limiteChamadasDia, 5, 500, c.limiteChamadasDia);
  save(); auditar(userId, 'equipe.config', { ...c, uso: undefined }); return c;
}
export function uso(userId) { const c = config(userId); if (c.uso.data !== hoje()) c.uso = { data: hoje(), chamadas: 0 }; return { data: c.uso.data, chamadas: c.uso.chamadas, limite: c.limiteChamadasDia, restantes: Math.max(0, c.limiteChamadasDia - c.uso.chamadas) }; }
function gastar(userId, n = 1) { const u = uso(userId); if (u.restantes < n) return false; config(userId).uso.chamadas += n; save(); return true; }

// ---------- mensagens (comunicação interna) ----------
export function postar(userId, o, m) {
  const a = area(userId); const seq = (a.mensagens.at(-1)?.seq ?? 0) + 1;
  const ag = (x) => (x && x !== 'chefe' && x !== 'sistema' ? a.agentes.find((y) => y.id === x) : null);
  const msg = { id: id(), seq, ordemId: o?.id ?? null, de: m.de ?? 'sistema', deNome: ag(m.de)?.nome ?? (m.de === 'chefe' ? 'Chefe' : 'Sistema'), para: m.para ?? null, paraNome: ag(m.para)?.nome ?? null,
    tipo: TIPOS_MSG.includes(m.tipo) ? m.tipo : 'conversa', texto: txt(m.texto, MAX_FALA * 2).replace(/\s+/g, ' '), origem: m.origem || 'ia', classificacao: m.classificacao || 'sugestao_ia', tarefaId: m.tarefaId || null, em: now() };
  if (!msg.texto) return null;
  a.mensagens.push(msg); if (a.mensagens.length > 3000) a.mensagens.splice(0, a.mensagens.length - 3000); save();
  return msg;
}
export function listarMensagens(userId, { depois = 0, ordemId = null, limite = 200 } = {}) {
  const l = area(userId).mensagens.filter((m) => m.seq > Number(depois || 0) && (!ordemId || m.ordemId === ordemId));
  return l.slice(-Math.min(500, Number(limite) || 200));
}

// ---------- relacionamentos (vêm do histórico real de interações) ----------
function registrarInteracao(userId, aId, bId, tipo) {
  if (!aId || !bId || aId === bId) return;
  const a = area(userId); const [x, y] = [aId, bId].map((i) => a.agentes.find((g) => g.id === i)); if (!x || !y) return;
  const marca = tipo === 'discordancia' ? 'd' : 'c';
  for (const [p, q] of [[x, y], [y, x]]) {
    p.relacionamentos ??= {}; const r = (p.relacionamentos[q.id] ??= { colaboracoes: 0, discordancias: 0, recentes: [], ultima: null });
    if (marca === 'd') r.discordancias += 1; else r.colaboracoes += 1;
    r.recentes.push(marca); if (r.recentes.length > 20) r.recentes.shift(); r.ultima = now();
  }
}
export function descreverRelacao(r) {
  const n = r?.recentes?.length ?? 0; if (n < 3) return 'ainda se conhecendo no trabalho';
  const d = r.recentes.filter((x) => x === 'd').length / n;
  return d >= 0.4 ? 'divergem com frequência, mas de forma profissional' : d <= 0.1 ? 'boa sintonia de trabalho' : 'colaboram e discordam de forma saudável';
}

// ---------- IA: gerador de falas e executor de tarefas (substituíveis em testes) ----------
const jsonDe = (t) => { const s = String(t || '').replace(/```(?:json)?/g, ''); const i = s.indexOf('{'); const j = s.lastIndexOf('}'); if (i < 0 || j <= i) return null; try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; } };
async function geradorPadrao(o) { const { gerarTexto } = await import('../assistant.js'); return gerarTexto({ system: o.system, prompt: o.prompt, json: o.json, maxTokens: o.maxTokens }); }
async function ia(opts) {
  if (opts.gerador) return { gerar: opts.gerador, executor: opts.executor, teste: Boolean(opts.teste) };
  if (process.env.CODENIAC_TESTE_IA_FALSA === '1') { const t = await import('./iaTeste.js'); return { gerar: t.gerar, executor: t.executor, teste: true }; }
  const { assistantMode, hasCloud } = await import('../assistant.js');
  if (assistantMode() === 'local') throw erro('Nenhuma IA está configurada. Em Configurações → Assistente conecte uma IA: sem ela os funcionários não conseguem conversar nem executar.', 409);
  if (!hasCloud()) throw erro('As conversas entre os funcionários exigem uma IA na nuvem (Gemini, Groq ou OpenRouter) em Configurações → Assistente.', 409);
  return { gerar: geradorPadrao, executor: undefined, teste: false };
}

function personaSystem(userId, ag, colegas) {
  const p = ag.perfil || {}; const rel = colegas.filter((c) => c.id !== ag.id).map((c) => `- ${c.nome} (${c.cargo}): ${descreverRelacao(ag.relacionamentos?.[c.id])}`).join('\n');
  return `Você é ${ag.nome}, ${ag.cargo} no Codeniac Commerce Office, uma pequena empresa de e-commerce/afiliados. Você conversa com colegas de trabalho (outros agentes de IA); o dono da empresa é "o chefe".
Temperamento: ${p.temperamento || ag.personalidade}. Tom: ${p.tom || 'profissional'}. Especialidade: ${p.especialidade || ag.cargo}.
Objetivos profissionais: ${(p.objetivos || []).join('; ') || 'fazer bem o seu trabalho'}.
${ag.memoria?.length ? `Memória de trabalho:\n- ${ag.memoria.slice(-8).join('\n- ')}\n` : ''}Relação com os colegas (construída pelo histórico real de trabalho):\n${rel || '- (sem colegas na conversa)'}
Regras: fale como pessoa real de escritório, em português, 1 a 2 frases curtas. Opine do ponto de vista do seu papel e fundamente. Discorde com respeito e traga uma alternativa. Humor/ironia só se o contexto permitir; em assunto financeiro delicado, erro ou problema real, seja séria. Nunca invente números, preços, comissões, vendas ou pesquisas: se precisar de dado, diga que vai verificar com as ferramentas. Nada de ofensas.`;
}

// ---------- planejamento ----------
function planoLocal(texto, ativos) {
  const t = texto.toLowerCase(); const citados = ativos.filter((a) => t.includes(a.nome.toLowerCase()) || t.includes(a.nome.split(' ').at(-1).toLowerCase()));
  const todos = /\b(equipe|time|todos|pessoal|galera)\b/.test(t);
  const sel = todos ? ativos : citados;
  return { interpretacao: texto.slice(0, 200), responsaveis: sel.map((a) => ({ agente: a.nome, atividade: texto.slice(0, 280) })), discutir: sel.length > 1, origem: 'regra' };
}
async function planejar(userId, ordem, ativos, gerar) {
  const equipe = ativos.map((a) => `- ${a.nome} — ${a.cargo}. Especialidade: ${a.perfil?.especialidade || ''}. Estado: ${a.estado}`).join('\n');
  const prompt = `Você é o coordenador interno do escritório (não é um personagem). O chefe deu esta ORDEM:\n"""${ordem.texto}"""\n\nEquipe disponível:\n${equipe}\n\nInterprete a intenção e escolha os responsáveis (se a ordem for para a "equipe", escolha quem faz sentido; pode ser todos). Cada responsável recebe UMA atividade concreta, executável com as ferramentas do Hub (pesquisa na web, produtos, campanhas, financeiro em leitura, documentos, estoque). Se houver mais de um responsável, a equipe deve discutir antes (discutir=true).
Responda SOMENTE JSON: {"interpretacao":"...","responsaveis":[{"agente":"nome exato","atividade":"o que fazer","tarefa":"nome curto da tarefa"}],"discutir":true|false,"tema":"tema da discussão"}`;
  let bruto = null;
  try { bruto = await gerar({ etapa: 'plano', json: true, maxTokens: 700, system: 'Você organiza o trabalho de uma pequena equipe. Responda apenas JSON válido.', prompt, ordem: ordem.texto, ativos: ativos.map((a) => a.nome) }); } catch (e) { if (e.status === 409) throw e; }
  const j = jsonDe(bruto); const norm = (s) => String(s || '').toLowerCase().trim();
  const resp = [];
  for (const r of Array.isArray(j?.responsaveis) ? j.responsaveis : []) { const ag = ativos.find((a) => norm(a.nome) === norm(r.agente)); if (ag && !resp.some((x) => x.ag.id === ag.id)) resp.push({ ag, atividade: txt(r.atividade, 400) || ordem.texto, tarefa: txt(r.tarefa, 120) || txt(r.atividade, 120) }); }
  if (!resp.length) { const l = planoLocal(ordem.texto, ativos); for (const r of l.responsaveis) { const ag = ativos.find((a) => a.nome === r.agente); resp.push({ ag, atividade: r.atividade, tarefa: r.atividade.slice(0, 100) }); } if (resp.length) ordem.planoOrigem = 'regra'; }
  if (!resp.length) return null;
  return { interpretacao: txt(j?.interpretacao, 300) || ordem.texto.slice(0, 200), tema: txt(j?.tema, 200) || ordem.texto.slice(0, 160), discutir: j?.discutir !== false && resp.length > 1, responsaveis: resp.slice(0, MAX_RESPONSAVEIS) };
}

// ---------- discussão entre os agentes ----------
const social = (ag, atividade, ms) => { ag.social = atividade ? { atividade, ate: Date.now() + ms } : null; };
async function discutir(userId, ordem, plano, gerar, ctl) {
  const a = area(userId); const part = plano.responsaveis.map((r) => r.ag); const n = part.length; const max = Math.min(config(userId).maxTurnos, HARD_TURNOS);
  const reuniao = n >= 3; const historico = []; let ultimo = null; let conclusao = '';
  for (let i = 0; i < max; i++) {
    if (ctl.cancelada()) return { conclusao, interrompida: 'cancelada' };
    if (!gastar(userId, 1)) { postar(userId, ordem, { de: 'sistema', tipo: 'sistema', origem: 'sistema', classificacao: 'real', texto: 'Orçamento diário de chamadas de IA atingido: a discussão foi encerrada e a execução segue só com o que já foi decidido.' }); return { conclusao, interrompida: 'orcamento' }; }
    let ag = part[i % n]; if (n > 1 && ag.id === ultimo) ag = part[(i + 1) % n];
    for (const p of part) social(p, reuniao ? 'reunido' : null, 120000); social(ag, 'conversando', 120000); save();
    const ultima = i === max - 1;
    const transcricao = historico.length ? historico.map((m) => `${m.deNome}${m.paraNome ? ` → ${m.paraNome}` : ''} [${m.tipo}]: ${m.texto}`).join('\n') : '(você abre a conversa)';
    const prompt = `Ordem do chefe: "${ordem.texto}"\nInterpretação: ${plano.interpretacao}\nTema da discussão: ${plano.tema}\nQuem faz o quê: ${plano.responsaveis.map((r) => `${r.ag.nome}: ${r.atividade}`).join(' | ')}\n\nConversa até agora:\n${transcricao}\n\nSua vez, ${ag.nome}. ${i === 0 ? 'Abra a discussão com a sua visão inicial.' : 'Reaja ao que foi dito: concorde, questione ou discorde com argumento e proponha algo.'} ${ultima ? 'Esta é a ÚLTIMA rodada: feche com tipo "conclusao" dizendo a estratégia que a equipe vai seguir.' : ''}
Responda SOMENTE JSON: {"texto":"sua fala (máx. ${MAX_FALA} caracteres)","tipo":"conversa|ideia|pergunta|alerta|discordancia|conclusao","para":"nome do colega a quem fala ou null","consenso":true|false}. Use consenso=true só se a equipe já tem uma estratégia clara e fundamentada.`;
    let bruto;
    try { bruto = await gerar({ etapa: 'turno', agente: ag, turno: i, ultima, json: true, maxTokens: 400, system: personaSystem(userId, ag, part), prompt, ordem: ordem.texto, participantes: part, historico }); }
    catch (e) { postar(userId, ordem, { de: 'sistema', tipo: 'sistema', origem: 'sistema', classificacao: 'real', texto: `A IA não respondeu para ${ag.nome}: ${txt(e.message, 160)}. A discussão foi encerrada.` }); return { conclusao, interrompida: 'erro' }; }
    const j = jsonDe(bruto) || { texto: String(bruto || '').slice(0, MAX_FALA), tipo: 'conversa' };
    const tipo = TIPOS_FALA.includes(j.tipo) ? (ultima && j.tipo !== 'conclusao' ? 'conclusao' : j.tipo) : (ultima ? 'conclusao' : 'conversa');
    const para = part.find((p) => p.id !== ag.id && String(j.para || '').toLowerCase().trim() === p.nome.toLowerCase());
    const m = postar(userId, ordem, { de: ag.id, para: para?.id ?? null, tipo, texto: txt(j.texto, MAX_FALA), origem: ctl.teste ? 'teste' : 'ia', classificacao: ctl.teste ? 'simulada' : 'sugestao_ia' });
    if (!m) continue;
    historico.push(m); ultimo = ag.id; ordem.turnos += 1; save();
    if (para) registrarInteracao(userId, ag.id, para.id, tipo);
    else if (i > 0) registrarInteracao(userId, ag.id, historico.at(-2)?.de, tipo);
    if (tipo === 'conclusao') conclusao = m.texto;
    if (j.consenso === true && i >= n - 1) { if (!conclusao) conclusao = m.texto; break; }
    if (tipo === 'conclusao' && i >= n - 1) break;
  }
  for (const p of part) social(p, null, 0); save();
  return { conclusao: conclusao || historico.at(-1)?.texto || '', historico };
}

// ---------- execução ----------
const primeiraFrase = (t) => { const x = String(t || '').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim(); const f = x.split(/(?<=[.!?])\s/)[0] || x; return f.length > MAX_FALA ? `${f.slice(0, MAX_FALA - 1)}…` : f; };
async function executar(user, ordem, plano, conclusao, ia_, ctl) {
  const userId = user.id; let falhas = 0;
  for (const r of plano.responsaveis) {
    if (ctl.cancelada()) return;
    const ag = acharAgente(userId, r.ag.id);
    if (!gastar(userId, 1)) { postar(userId, ordem, { de: ag.id, tipo: 'alerta', origem: 'sistema', classificacao: 'real', texto: 'Não posso começar: o orçamento diário de chamadas de IA acabou.' }); falhas++; continue; }
    let t;
    try {
      t = criarTarefaOrquestrada(userId, { nome: r.tarefa || r.atividade, descricao: `${r.atividade}\n\nOrdem do chefe: "${ordem.texto}"${conclusao ? `\nConclusão da discussão da equipe: ${conclusao}` : ''}\nRegistre o resultado com as ferramentas do Hub (documentos, produtos, estoque) e cite as fontes.`, agenteId: ag.id, departamento: ag.departamento });
    } catch (e) { postar(userId, ordem, { de: ag.id, tipo: 'alerta', origem: 'sistema', classificacao: 'real', texto: `Não consegui abrir a tarefa: ${txt(e.message, 160)}` }); falhas++; continue; }
    t.ordemId = ordem.id; ordem.tarefaIds.push(t.id); save();
    postar(userId, ordem, { de: ag.id, tipo: 'conversa', origem: 'sistema', classificacao: 'real', texto: `Começando: ${txt(t.nome, 70)}${t.nome.length > 70 ? '…' : ''}`, tarefaId: t.id });
    try { await despachar(user, t.id, { esperar: true, ...(ia_.executor ? { executor: ia_.executor } : {}) }); } catch (e) { /* o estado real da tarefa é lido abaixo */ postar(userId, ordem, { de: ag.id, tipo: 'alerta', origem: 'sistema', classificacao: 'real', texto: `Bloqueio: ${txt(e.message, 180)}`, tarefaId: t.id }); falhas++; social(ag, 'preocupado', 10000); continue; }
    const f = acharTarefa(userId, t.id);
    if (f.status === 'aguardando_aprovacao') {
      let fala = ''; if (gastar(userId, 1)) { try { fala = jsonDe(await ia_.gerar({ etapa: 'resumo', agente: ag, tarefa: f, json: true, maxTokens: 250, system: personaSystem(userId, ag, plano.responsaveis.map((x) => x.ag)), prompt: `Você terminou a tarefa "${f.nome}". Resultado registrado:\n${txt(f.resultado, 1800)}\n\nDiga ao time, em 1 frase curta (máx. ${MAX_FALA} caracteres) e no seu jeito, o que entregou, baseando-se SOMENTE no resultado acima. JSON: {"texto":"...","tipo":"conclusao|alerta"}` }))?.texto || ''; } catch { fala = ''; } }
      postar(userId, ordem, { de: ag.id, tipo: 'conclusao', texto: fala || `Entreguei: ${primeiraFrase(f.resultado)}`, origem: fala ? (ctl.teste ? 'teste' : 'ia') : 'sistema', classificacao: ctl.teste ? 'simulada' : 'sugestao_ia', tarefaId: t.id });
    } else { falhas++; postar(userId, ordem, { de: ag.id, tipo: 'alerta', origem: 'sistema', classificacao: 'real', texto: `Não consegui concluir "${f.nome}": ${txt(f.historico.at(-1)?.motivo || f.status, 200)}`, tarefaId: t.id }); social(ag, 'preocupado', 12000); }
  }
  const alvo = plano.responsaveis.map((r) => area(userId).agentes.find((x) => x.id === r.ag.id)).filter(Boolean);
  if (!falhas) for (const ag of alvo) social(ag, 'comemorando', 8000);
  ordem.falhas = falhas;
}

// ---------- ordem do chefe ----------
export function statusDaOrdem(userId, o) {
  if (o.cancelada) return 'cancelada'; if (o.fase === 'bloqueada') return 'bloqueada'; if (o.fase === 'falha') return 'falha';
  if (o.fase === 'recebida') return 'recebida'; if (o.fase === 'planejando' || o.fase === 'discutindo') return 'planejada'; if (o.fase === 'executando') return 'em_execucao';
  const ts = o.tarefaIds.map((i) => area(userId).tarefas.find((t) => t.id === i)).filter(Boolean);
  if (!ts.length) return 'falha';
  if (ts.some((t) => t.status === 'erro')) return 'falha';
  if (ts.some((t) => t.status === 'aguardando_aprovacao')) return 'aguardando_aprovacao';
  if (ts.every((t) => ['concluida', 'cancelada'].includes(t.status))) return 'concluida';
  return 'em_execucao';
}
export function visaoOrdem(userId, o) {
  const a = area(userId); const status = statusDaOrdem(userId, o);
  const tarefas = o.tarefaIds.map((i) => a.tarefas.find((t) => t.id === i)).filter(Boolean).map((t) => ({ id: t.id, nome: t.nome, status: t.status, agenteId: t.agenteId, agente: a.agentes.find((x) => x.id === t.agenteId)?.nome || null }));
  return { id: o.id, texto: o.texto, status, rotulo: STATUS_ORDEM[status], fase: o.fase, motivo: o.motivo || '', criadaEm: o.criadaEm, finalizadaEm: o.finalizadaEm || null, interpretacao: o.plano?.interpretacao || '', responsaveis: (o.plano?.responsaveis || []).map((r) => ({ agenteId: r.agenteId, nome: r.nome, atividade: r.atividade })), turnos: o.turnos, conclusao: o.conclusao || '', tarefas, documentos: a.documentos.filter((d) => d.ordemId === o.id).map((d) => ({ id: d.id, tipo: d.tipo, titulo: d.titulo, classificacao: d.classificacao })), planoOrigem: o.planoOrigem || 'ia', teste: Boolean(o.teste) };
}
export const listarOrdens = (userId) => area(userId).ordens.slice().reverse().map((o) => visaoOrdem(userId, o));

/** Recupera ordens que estavam rodando quando o servidor reiniciou: viram falha com aviso (nada continua escondido). */
function recuperar(userId) {
  const a = area(userId); if (a._ordensBoot) return;
  Object.defineProperty(a, '_ordensBoot', { value: true, enumerable: false });
  for (const o of a.ordens) if (FASES_ATIVAS.includes(o.fase) && !jobs.has(userId)) { o.fase = 'falha'; o.motivo = 'o servidor reiniciou durante a ordem'; o.finalizadaEm = now(); }
  for (const ag of a.agentes) if (ag.social) ag.social = null;
  save();
}

export async function enviarOrdem(user, texto, opts = {}) {
  const userId = user.id; recuperar(userId); garantirAgentes(userId);
  const t = txt(texto, 1200); if (t.length < 5) throw erro('Escreva a ordem com um pouco mais de detalhe.');
  if (jobs.has(userId)) throw erro('Já existe uma ordem em andamento. Espere terminar (ou cancele) antes de dar outra: evitamos execuções duplicadas e gasto desnecessário.', 409);
  const a = area(userId);
  const ativos = a.agentes.filter((x) => !x.arquivado && x.estado !== 'pausado');
  if (!ativos.length) throw erro('Todos os funcionários estão pausados. Ative ao menos um.', 409);
  if (uso(userId).restantes < 3) throw erro(`Orçamento diário de chamadas de IA esgotado (${uso(userId).limite}). Aumente o limite em Equipe → Orçamento ou volte amanhã.`, 409);
  const ia_ = await ia(opts);
  const ordem = { id: id(), texto: t, fase: 'recebida', criadaEm: now(), finalizadaEm: null, plano: null, tarefaIds: [], turnos: 0, conclusao: '', motivo: '', teste: ia_.teste, cancelada: false };
  a.ordens.push(ordem); if (a.ordens.length > 500) a.ordens.splice(0, a.ordens.length - 500); save(); auditar(userId, 'ordem.receber', { ordem: ordem.id });
  postar(userId, ordem, { de: 'chefe', tipo: 'ordem', texto: t, origem: 'humano', classificacao: 'real' });
  const ctl = { teste: ia_.teste, cancelada: () => cancelamentos.has(ordem.id) };
  const rodar = (async () => {
    try {
      ordem.fase = 'planejando'; save();
      const plano = await planejar(userId, ordem, ativos, ia_.gerar);
      if (!plano) { ordem.fase = 'bloqueada'; ordem.motivo = 'não identifiquei quem deve cuidar disso: cite o nome do funcionário ou fale com a "Equipe".'; postar(userId, ordem, { de: 'sistema', tipo: 'sistema', origem: 'sistema', classificacao: 'real', texto: `Ordem bloqueada: ${ordem.motivo}` }); return; }
      ordem.plano = { interpretacao: plano.interpretacao, tema: plano.tema, responsaveis: plano.responsaveis.map((r) => ({ agenteId: r.ag.id, nome: r.ag.nome, atividade: r.atividade })) };
      postar(userId, ordem, { de: 'sistema', tipo: 'sistema', origem: 'sistema', classificacao: 'real', texto: `Plano: ${plano.responsaveis.map((r) => `${r.ag.nome} → ${r.tarefa}`).join(' · ')}` });
      let conclusao = '';
      if (plano.discutir) { ordem.fase = 'discutindo'; save(); const d = await discutir(userId, ordem, plano, ia_.gerar, ctl); conclusao = d.conclusao; ordem.conclusao = conclusao; }
      if (ctl.cancelada()) { ordem.cancelada = true; return; }
      for (const r of plano.responsaveis) { const ag = area(userId).agentes.find((x) => x.id === r.ag.id); if (ag && conclusao) { ag.memoria = [...(ag.memoria || []), `Ordem do chefe "${ordem.texto.slice(0, 80)}": equipe decidiu — ${conclusao.slice(0, 160)}`].slice(-20); } }
      ordem.fase = 'executando'; save();
      await executar(user, ordem, plano, conclusao, ia_, ctl);
      if (ctl.cancelada()) { ordem.cancelada = true; return; }
      ordem.fase = 'executada';
      const par = plano.responsaveis.map((r) => r.ag.id); for (let i = 0; i < par.length; i++) for (let j = i + 1; j < par.length; j++) if (!ordem.falhas) registrarInteracao(userId, par[i], par[j], 'conversa');
      postar(userId, ordem, { de: 'sistema', tipo: 'sistema', origem: 'sistema', classificacao: 'real', texto: ordem.falhas ? `Execução terminou com ${ordem.falhas} problema(s). Veja as tarefas.` : 'Execução terminada. Os resultados aguardam a sua aprovação nas tarefas.' });
    } catch (e) { ordem.fase = 'falha'; ordem.motivo = txt(e.message, 300); postar(userId, ordem, { de: 'sistema', tipo: 'sistema', origem: 'sistema', classificacao: 'real', texto: `A ordem falhou: ${ordem.motivo}` }); }
    finally { ordem.finalizadaEm = now(); jobs.delete(userId); cancelamentos.delete(ordem.id); for (const ag of area(userId).agentes) if (ag.social && ['reunido', 'conversando'].includes(ag.social.atividade)) ag.social = null; save(); }
  })();
  jobs.set(userId, rodar);
  if (opts.esperar) await rodar;
  return visaoOrdem(userId, ordem);
}

export function cancelarOrdem(userId, oid) {
  const o = area(userId).ordens.find((x) => x.id === oid); if (!o) throw erro('Ordem não encontrada.', 404);
  if (!FASES_ATIVAS.includes(o.fase)) throw erro('Esta ordem não está em andamento.', 409);
  cancelamentos.add(o.id); o.cancelada = true; o.motivo = 'cancelada pelo chefe';
  for (const i of o.tarefaIds) { const t = area(userId).tarefas.find((x) => x.id === i); if (t && t.status === 'pendente') { t.status = 'cancelada'; t.historico.push({ em: now(), acao: 'status', de: 'pendente', para: 'cancelada', motivo: 'ordem cancelada' }); } }
  save(); auditar(userId, 'ordem.cancelar', { ordem: oid }); return visaoOrdem(userId, o);
}

export function aguardar(userId) { return jobs.get(userId) ?? Promise.resolve(); }

/** Painel da equipe: agentes com perfil, relações e estado social, ordem ativa, orçamento. */
export function painelEquipe(userId) {
  recuperar(userId); const a = area(userId); const ags = garantirAgentes(userId); const agora = Date.now();
  const nome = (i) => a.agentes.find((x) => x.id === i)?.nome || '?';
  return {
    agentes: ags.map((x) => ({ ...resumoAgente(userId, x), estadoSocial: x.social && x.social.ate > agora ? x.social.atividade : null,
      relacionamentos: Object.entries(x.relacionamentos || {}).map(([i, r]) => ({ agenteId: i, nome: nome(i), colaboracoes: r.colaboracoes, discordancias: r.discordancias, descricao: descreverRelacao(r) })) })),
    ordemAtiva: a.ordens.filter((o) => FASES_ATIVAS.includes(o.fase)).map((o) => visaoOrdem(userId, o))[0] || null,
    config: { maxTurnos: config(userId).maxTurnos, balaoSegundos: config(userId).balaoSegundos, limiteChamadasDia: config(userId).limiteChamadasDia }, uso: uso(userId),
  };
}
