// FUNCIONÁRIOS: contratação, estações de trabalho e a presença fixa na mesa.
// As personagens ficam PERMANENTEMENTE no escritório, sentadas na cadeira da estação (mesa + cadeira + computador). Não andam: só giram entre as
// vistas disponíveis (frente, costas, lados). Produzem CC no expediente; a simulação roda com qualquer janela aberta.
import { item } from '../dados/catalogo';
import { tracoPorId } from '../dados/pessoas';
import type { Grade } from '../nucleo/grade';
import { celulasDe } from '../nucleo/mapa';
import { novoId } from '../nucleo/rng';
import { ehFimDeSemana, minutoDoDia } from '../nucleo/tempo';
import type { Candidato, Dir, Funcionario, Habilidades, ObjetoColocado, Projeto } from '../tipos';

const clampH = (n: number): number => Math.min(10, Math.max(0, Math.round(Number(n) || 0)));
/** Rendimento diário de cada funcionária: valor aleatório entre 10 e 120 CC, sorteado a cada dia. */
export const RENDIMENTO = { min: 10, max: 120, alto: 85, baixo: 45 };
export const sortearRendimento = (rnd: () => number): number => RENDIMENTO.min + Math.floor(rnd() * (RENDIMENTO.max - RENDIMENTO.min + 1));
/** Desempenho do dia: 'alto' (seta verde ▲), 'baixo' (seta vermelha ▼) ou 'medio' (sem seta). */
export function desempenhoDe(f: Pick<Funcionario, 'metaDia'>): 'alto' | 'baixo' | 'medio' { const v = f.metaDia ?? 0; return v >= RENDIMENTO.alto ? 'alto' : v <= RENDIMENTO.baixo ? 'baixo' : 'medio'; }
export const HORARIO = { entrada: 9 * 60, saida: 18 * 60, almoco: [12 * 60, 13 * 60] as [number, number] };
export interface CfgContrato { nome: string; sobrenome: string; apelido: string; cargo: string; profissao: string; tracos: string[]; comportamento: string; salario: number; entrada?: number; saida?: number; defeitos?: string[]; habilidades?: Habilidades; extras?: string }

// ---------- estações de trabalho ----------
const viz4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
/** Cadeira livre encostada na mesa (uma estação = mesa + cadeira ao lado + computador em cima). */
export function acharAssento(p: Projeto, deskId: string): { chave: ObjetoColocado; x: number; y: number; dir: Dir } | null {
  const mesa = p.objetos.find((o) => o.id === deskId); const dm = mesa && item(mesa.def); if (!mesa || !dm?.mesa) return null; const cel = celulasDe(mesa, dm);
  const usadas = new Set(p.funcionarios.filter((f) => f.status === 'ativo' && f.estacao && f.estacao !== deskId).map((f) => f.estacao));
  void usadas;
  for (const o of p.objetos) {
    const d = item(o.def); if (!d?.sentavel || d.assentos !== 1 || d.id.startsWith('sofa') || d.id.startsWith('poltrona')) continue;
    const perto = cel.find((c) => viz4.some(([dx, dy]) => c.x + dx === o.x && c.y + dy === o.y)); if (!perto) continue;
    const ocupada = p.objetos.some((q) => q.id !== deskId && item(q.def)?.mesa && q.id !== deskId && false); void ocupada;
    const dx = perto.x - o.x; const dy = perto.y - o.y; const dir: Dir = dx === 0 ? (dy < 0 ? 'N' : 'S') : dx > 0 ? 'E' : 'W';
    return { chave: o, x: o.x, y: o.y, dir };
  }
  return null;
}
export const computadorDaMesa = (p: Projeto, deskId: string): ObjetoColocado | null => p.objetos.find((o) => o.sobre === deskId && item(o.def)?.interacao === 'computador') ?? null;
export function estacoesLivres(p: Projeto): string[] {
  const ocupadas = new Set(p.funcionarios.filter((f) => f.status === 'ativo' && f.estacao).map((f) => f.estacao));
  return p.objetos.filter((o) => item(o.def)?.mesa && !ocupadas.has(o.id) && computadorDaMesa(p, o.id) && acharAssento(p, o.id)).map((o) => o.id);
}
export function atribuirEstacao(p: Projeto, fid: string, deskId: string | null): { ok: boolean; motivo: string } {
  const f = p.funcionarios.find((q) => q.id === fid); if (!f) return { ok: false, motivo: 'Funcionário não encontrado.' };
  if (deskId === null) { f.estacao = null; return { ok: true, motivo: 'Estação removida.' }; }
  const dono = p.funcionarios.find((q) => q.status === 'ativo' && q.estacao === deskId && q.id !== fid); if (dono) return { ok: false, motivo: `Esta estação já é de ${dono.nome}.` };
  if (!computadorDaMesa(p, deskId)) return { ok: false, motivo: 'A mesa precisa de um computador em cima.' }; if (!acharAssento(p, deskId)) return { ok: false, motivo: 'A mesa precisa de uma cadeira encostada.' };
  f.estacao = deskId; return { ok: true, motivo: 'Estação definida.' };
}

// ---------- contratação ----------
export function contratar(p: Projeto, candidatoId: string, cfg: CfgContrato): { ok: boolean; motivo: string; func?: Funcionario } {
  const i = p.candidatos.findIndex((c) => c.id === candidatoId); if (i < 0) return { ok: false, motivo: 'Este candidato não está mais disponível.' };
  if (p.funcionarios.some((f) => f.candidatoId === candidatoId && f.status !== 'demitido')) return { ok: false, motivo: 'Este candidato já foi contratado.' };
  const c = p.candidatos[i]; const tracos = cfg.tracos.filter((t) => tracoPorId.has(t)).slice(0, 5); if (!cfg.nome.trim()) return { ok: false, motivo: 'Dê um nome ao funcionário.' };
  if (!(cfg.salario >= 1 && cfg.salario <= 500)) return { ok: false, motivo: 'Salário inválido (1 a 500 CC por dia).' };
  const hab: Habilidades = cfg.habilidades ? { criatividade: clampH(cfg.habilidades.criatividade), logica: clampH(cfg.habilidades.logica), comunicacao: clampH(cfg.habilidades.comunicacao), organizacao: clampH(cfg.habilidades.organizacao) } : { ...c.habilidades };
  const prod = tracos.reduce((a, t) => a + (tracoPorId.get(t)?.prod ?? 0), 1) * (0.7 + (hab.logica + hab.organizacao + hab.criatividade + hab.comunicacao) / 40);
  const f: Funcionario = { id: novoId('func'), candidatoId, avatar: c.avatar, nome: cfg.nome.trim().slice(0, 30), sobrenome: cfg.sobrenome.trim().slice(0, 30), apelido: cfg.apelido.trim().slice(0, 20), cargo: cfg.cargo.trim().slice(0, 40) || c.cargo, profissao: cfg.profissao.trim().slice(0, 40) || c.cargo,
    idade: c.idade, tracos, comportamento: cfg.comportamento.trim().slice(0, 300), habilidades: hab, defeitos: (cfg.defeitos ?? []).slice(0, 6), extras: (cfg.extras ?? '').trim().slice(0, 300), produtividade: Math.round(prod * 100) / 100, energia: 100, humor: 75, salario: Math.round(cfg.salario),
    entrada: cfg.entrada ?? HORARIO.entrada, saida: cfg.saida ?? HORARIO.saida, estacao: null, metaDia: sortearRendimento(Math.random), status: 'ativo', contratadoEm: p.minuto, diasSemPagar: 0, estado: 'ausente', x: 0, y: 0, dir: 'S', caminho: [], desde: p.minuto, produzido: 0 };
  p.candidatos.splice(i, 1); p.funcionarios.push(f); const livre = estacoesLivres(p)[0]; if (livre) f.estacao = livre;
  return { ok: true, motivo: f.estacao ? `${f.nome} foi contratado(a) e já tem estação de trabalho.` : `${f.nome} foi contratado(a). Falta uma estação (mesa + cadeira + computador).`, func: f };
}
export function demitir(p: Projeto, fid: string): { ok: boolean; motivo: string } {
  const f = p.funcionarios.find((q) => q.id === fid && q.status === 'ativo'); if (!f) return { ok: false, motivo: 'Funcionário não encontrado.' };
  f.status = 'demitido'; f.estacao = null; f.estado = 'ausente'; f.caminho = []; const c = candidatoDe(f); p.recontratar.push(c); return { ok: true, motivo: `${f.nome} foi demitido(a).` };
}
export const candidatoDe = (f: Funcionario): Candidato => ({ id: f.candidatoId, avatar: f.avatar, nome: `${f.nome} ${f.sobrenome}`.trim(), idade: f.idade, cargo: f.cargo, especialidade: f.profissao, habilidades: f.habilidades, tracos: f.tracos, fortes: [], fracos: [], salario: f.salario, descricao: 'Ex-funcionário(a).', disponibilidade: 'Imediata', comportamento: f.comportamento });
/** Demitidos podem voltar à lista de candidatos (e só então ser contratados de novo). */
export function readmitir(p: Projeto, candidatoId: string): boolean { const i = p.recontratar.findIndex((c) => c.id === candidatoId); if (i < 0) return false; p.candidatos.push(p.recontratar.splice(i, 1)[0]); return true; }

// ---------- presença fixa e giros ----------
/** Vistas disponíveis nos sprites. Diagonais caem na vista cardeal mais próxima (não há quadros diagonais). */
export const direcaoDe = (dx: number, dy: number, antes: Dir): Dir => {
  if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return antes; return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
};
export interface Contexto { g: Grade; rnd: () => number }
const dentroDoExpediente = (p: Projeto, f: Funcionario): boolean => { const md = minutoDoDia(p.minuto); return !ehFimDeSemana(p.minuto) && md >= f.entrada && md < f.saida; };
/** Coloca a personagem na cadeira da estação, virada para a mesa. Sem estação válida ela não aparece (estado "ausente"). Devolve true se está sentada. */
export function sentarNaEstacao(p: Projeto, f: Funcionario): boolean {
  const a = f.estacao ? acharAssento(p, f.estacao) : null;
  if (!a) { f.estado = 'ausente'; f.caminho = []; return false; }
  f.x = a.x + 0.5; f.y = a.y + 0.5; if (f.estado === 'ausente') f.dir = a.dir; return true;
}
/** Avança os funcionários: ficam sentados; no expediente trabalham (geram CC), fora dele ficam parados na mesa. Giram ocasionalmente (tempo real). */
export function atualizarFuncionarios(p: Projeto, ctx: Contexto, dtMin: number, dtSeg: number, agora = Date.now() / 1000): void {
  const { rnd } = ctx;
  for (const f of p.funcionarios) {
    if (f.status !== 'ativo') continue;
    if (!f.estacao) { const livre = estacoesLivres(p)[0]; if (livre) f.estacao = livre; }          // compra de uma estação nova encaixa quem estava esperando
    const a = f.estacao ? acharAssento(p, f.estacao) : null;
    if (!a) { f.estado = 'ausente'; continue; }
    f.metaDia ??= sortearRendimento(rnd);
    f.x = a.x + 0.5; f.y = a.y + 0.5; f.caminho = [];
    const trabalha = dentroDoExpediente(p, f); f.estado = trabalha ? 'trabalhando' : 'parado';
    // giro: de vez em quando vira para o jogador (frente) ou para o lado e depois volta para a mesa; sempre só entre as vistas existentes
    if (f.giroAte !== undefined && agora >= f.giroAte) { f.giroAte = undefined; f.dir = a.dir; }
    else if (f.giroAte === undefined && rnd() < dtSeg / 40) { f.dir = ['S', 'E', 'W'][Math.floor(rnd() * 3)] as Dir; f.giroAte = agora + 2.5 + rnd() * 3; }
    else if (f.giroAte === undefined) f.dir = a.dir;
    if (trabalha && dtMin > 0) trabalhar(p, f, dtMin);
  }
}
function trabalhar(p: Projeto, f: Funcionario, dtMin: number): void {
  const mesa = f.estacao; const pc = mesa ? computadorDaMesa(p, mesa) : null; if (!pc) return;                 // o dinheiro vem do rendimento diário (pagarSalarios); aqui só o humor
  const t = f.tracos.map((x) => tracoPorId.get(x)); const humorBase = 70 + t.reduce((a, x) => a + (x?.humor ?? 0), 0) * 20; f.humor = Math.max(10, Math.min(100, f.humor + (humorBase - f.humor) * 0.005 * dtMin)); f.energia = 100;
}
/** Fim do dia: credita o rendimento do dia de cada personagem na mesa (10–120 CC), sorteia o do dia seguinte e paga os salários; quem não recebe por 3 dias pede demissão. */
export function pagarSalarios(p: Projeto, registrar: (tipo: 'salario' | 'recompensa', valor: number, desc: string) => void, rnd: () => number = Math.random): { pago: number; rendeu: number; saidas: string[] } {
  let pago = 0; let rendeu = 0; const saidas: string[] = [];
  for (const f of p.funcionarios) {
    if (f.status !== 'ativo' || !f.estacao || f.estado === 'ausente') continue;                // sem estação ela não trabalha: não rende nem recebe
    const ganho = f.metaDia ?? sortearRendimento(rnd); p.cc = Math.round((p.cc + ganho) * 1000) / 1000; rendeu += ganho; f.produzido = ganho; registrar('recompensa', ganho, `Rendimento de ${f.nome} no dia`); f.metaDia = sortearRendimento(rnd);
    if (p.cc >= f.salario) { p.cc = Math.round((p.cc - f.salario) * 1000) / 1000; pago += f.salario; f.diasSemPagar = 0; registrar('salario', -f.salario, `Salário de ${f.nome}`); }
    else { f.diasSemPagar++; f.humor = Math.max(0, f.humor - 25); if (f.diasSemPagar >= 3) { demitir(p, f.id); saidas.push(f.nome); } }
  }
  return { pago, rendeu, saidas };
}

/** Licença: o funcionário sai do escritório, libera a estação e não recebe salário até voltar. */
export function afastar(p: Projeto, fid: string): { ok: boolean; motivo: string } {
  const f = p.funcionarios.find((q) => q.id === fid && q.status === 'ativo'); if (!f) return { ok: false, motivo: 'Funcionário não encontrado.' };
  f.status = 'afastado'; f.estacao = null; f.estado = 'ausente'; f.caminho = []; f.fala = undefined; return { ok: true, motivo: `${f.nome} entrou em licença.` };
}
export function retornar(p: Projeto, fid: string): { ok: boolean; motivo: string } {
  const f = p.funcionarios.find((q) => q.id === fid && q.status === 'afastado'); if (!f) return { ok: false, motivo: 'Funcionário não está em licença.' };
  f.status = 'ativo'; f.estado = 'ausente'; const livre = estacoesLivres(p)[0]; if (livre) f.estacao = livre; return { ok: true, motivo: `${f.nome} voltou da licença.` };
}
