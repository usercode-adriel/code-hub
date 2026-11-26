// FUNCIONÁRIOS: contratação, estações de trabalho e a rotina autônoma (chegar, trabalhar, pausa, café, descanso, conversa, ir embora).
// A simulação roda no tempo do jogo e continua com qualquer janela aberta. Cada funcionário só muda de estado por uma causa (horário, energia, pausa).
import { item } from '../dados/catalogo';
import { tracoPorId } from '../dados/pessoas';
import { acharCaminho, type Cel } from '../nucleo/caminho';
import type { Grade } from '../nucleo/grade';
import { celulasDe, portaEm } from '../nucleo/mapa';
import { novoId } from '../nucleo/rng';
import { ehFimDeSemana, minutoDoDia } from '../nucleo/tempo';
import type { Candidato, Dir, Funcionario, ObjetoColocado, Projeto } from '../tipos';
import { cafes, definir, graos, prepararCafe, tomarCafe } from './objetos';

export const HORARIO = { entrada: 9 * 60, saida: 18 * 60, almoco: [12 * 60, 13 * 60] as [number, number] };
export interface CfgContrato { nome: string; sobrenome: string; apelido: string; cargo: string; profissao: string; tracos: string[]; comportamento: string; salario: number; entrada?: number; saida?: number }

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
  const prod = tracos.reduce((a, t) => a + (tracoPorId.get(t)?.prod ?? 0), 1) * (0.7 + (c.habilidades.logica + c.habilidades.organizacao + c.habilidades.criatividade + c.habilidades.comunicacao) / 40);
  const f: Funcionario = { id: novoId('func'), candidatoId, avatar: c.avatar, nome: cfg.nome.trim().slice(0, 30), sobrenome: cfg.sobrenome.trim().slice(0, 30), apelido: cfg.apelido.trim().slice(0, 20), cargo: cfg.cargo.trim().slice(0, 40) || c.cargo, profissao: cfg.profissao.trim().slice(0, 40) || c.cargo,
    idade: c.idade, tracos, comportamento: cfg.comportamento.trim().slice(0, 300), habilidades: { ...c.habilidades }, produtividade: Math.round(prod * 100) / 100, energia: 100, humor: 75, salario: Math.round(cfg.salario),
    entrada: cfg.entrada ?? HORARIO.entrada, saida: cfg.saida ?? HORARIO.saida, estacao: null, status: 'ativo', contratadoEm: p.minuto, diasSemPagar: 0, estado: 'ausente', x: 0, y: 0, dir: 'S', caminho: [], desde: p.minuto, produzido: 0 };
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

// ---------- simulação ----------
const cel = (f: { x: number; y: number }): Cel => ({ x: Math.floor(f.x), y: Math.floor(f.y) });
export const direcaoDe = (dx: number, dy: number, antes: Dir): Dir => {
  if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return antes; const a = Math.atan2(dx, -dy); const i = Math.round(((a + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8;
  return (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as Dir[])[i];
};
function portaEntrada(p: Projeto): { x: number; y: number } | null {
  const q = p.portas[0]; if (!q) return null; const o = q.y === 0 ? [0, 1] : q.y === p.altura - 1 ? [0, -1] : q.x === 0 ? [1, 0] : [-1, 0]; return { x: q.x + o[0], y: q.y + o[1] };
}
function irPara(f: Funcionario, g: Grade, destino: Cel, aproximar = false): boolean {
  const r = acharCaminho(g, cel(f), destino, { aproximar }); if (!r) return false; f.caminho = r; return true;
}
const FALAS = ['Bom dia!', 'Como está o projeto?', 'Preciso de mais café.', 'Que dia corrido.', 'Alguém viu o relatório?', 'Boa ideia!'];
const FALAS_TRACO: Record<string, string[]> = { humoristico: ['Vou contar uma piada de TI... mas ela travou.'], comunicativo: ['E aí, tudo bem? Quer ouvir uma novidade?'], reservado: ['Hm... tudo certo.'], introvertido: ['...prefiro trabalhar em silêncio.'], extrovertido: ['Vamos tomar um café juntos?'], ambicioso: ['Vamos bater a meta hoje.'], preguicoso: ['Falta muito para o fim do dia?'] };

export interface Contexto { g: Grade; rnd: () => number }
/** Avança TODOS os funcionários `dtMin` minutos de jogo (e `dtSeg` segundos reais para o andar). */
export function atualizarFuncionarios(p: Projeto, ctx: Contexto, dtMin: number, dtSeg: number): void {
  const { g, rnd } = ctx; const md = minutoDoDia(p.minuto); const fim = ehFimDeSemana(p.minuto); const vel = 2.6 * Math.min(Math.max(p.velocidade, 1), 3);
  for (const f of p.funcionarios) {
    if (f.status !== 'ativo') continue;
    const deveEstar = !fim && md >= f.entrada && md < f.saida;
    if (f.estado === 'ausente') {
      if (deveEstar && f.energia > 0) chegar(p, f, g, rnd);
      else if (f.estado === 'ausente') f.energia = Math.min(100, f.energia + 3 * dtMin);                      // em casa: recupera a energia
      continue;
    }
    if (!deveEstar && f.estado !== 'indo_embora') sair(p, f, g);
    // andar
    if (f.caminho.length) {
      const alvo = f.caminho[0]; const tx = alvo.x + 0.5; const ty = alvo.y + 0.5; const dx = tx - f.x; const dy = ty - f.y; const dist = Math.hypot(dx, dy); const passo = vel * dtSeg;
      f.dir = direcaoDe(dx, dy, f.dir); const q = portaEm(p, alvo.x, alvo.y); if (q) q.aberta = true;
      if (dist <= passo) { f.x = tx; f.y = ty; f.caminho.shift(); if (!f.caminho.length) chegou(p, f, g, rnd); } else { f.x += (dx / dist) * passo; f.y += (dy / dist) * passo; }
      continue;
    }
    // sem caminho: lógica por estado
    const tmp = f.estado; const tempo = p.minuto - f.desde;
    if (tmp === 'trabalhando') trabalhar(p, f, dtMin, g, rnd);
    else if (tmp === 'cafe' && tempo >= 6) { voltar(p, f, g); }
    else if (tmp === 'descansando') { f.energia = Math.min(100, f.energia + 1.1 * dtMin); f.humor = Math.min(100, f.humor + 0.2 * dtMin); if (f.energia >= 85 && deveEstar) voltar(p, f, g); }
    else if (tmp === 'pausa' && tempo >= 25) voltar(p, f, g);
    else if (tmp === 'conversando' && tempo >= 12) { f.estado = 'pausa'; f.desde = p.minuto - 20; f.fala = undefined; }
    else if (tmp === 'parado') { f.energia = Math.max(20, f.energia - 0.02 * dtMin); if (f.estacao && estacoesLivres(p).length >= 0 && acharAssento(p, f.estacao)) voltar(p, f, g); }
    if (f.fala && f.falaAte !== undefined && p.minuto > f.falaAte) f.fala = undefined;
    if (['pausa', 'cafe', 'descansando'].includes(f.estado)) conversar(p, f, rnd);
  }
}
function chegar(p: Projeto, f: Funcionario, g: Grade, rnd: () => number): void {
  const e = portaEntrada(p); let c: Cel | null = e && g.livre(e.x, e.y) ? e : null;
  if (!c) { for (let t = 0; t < 40 && !c; t++) { const x = 1 + Math.floor(rnd() * (p.largura - 2)); const y = 1 + Math.floor(rnd() * (p.altura - 2)); if (g.livre(x, y)) c = { x, y }; } }
  if (!c) return; f.x = c.x + 0.5; f.y = c.y + 0.5; f.estado = 'chegando'; f.desde = p.minuto; f.fala = 'Bom dia!'; f.falaAte = p.minuto + 2; voltar(p, f, g, 'chegando');
}
function voltar(p: Projeto, f: Funcionario, g: Grade, estado: Funcionario['estado'] = 'indo_trabalhar'): void {
  const a = f.estacao ? acharAssento(p, f.estacao) : null;
  if (!a) { f.estado = 'parado'; f.desde = p.minuto; f.caminho = []; return; }                                    // sem estação: espera
  if (cel(f).x === a.x && cel(f).y === a.y) { sentar(p, f, a.dir); return; }
  if (irPara(f, g, { x: a.x, y: a.y })) { f.estado = estado === 'chegando' ? 'chegando' : 'indo_trabalhar'; f.desde = p.minuto; } else { f.estado = 'parado'; f.desde = p.minuto; }
}
function sentar(p: Projeto, f: Funcionario, dir: Dir): void { f.estado = 'trabalhando'; f.dir = dir; f.desde = p.minuto; f.caminho = []; }
function chegou(p: Projeto, f: Funcionario, g: Grade, rnd: () => number): void {
  switch (f.estado) {
    case 'chegando': case 'indo_trabalhar': { const a = f.estacao ? acharAssento(p, f.estacao) : null; if (a && cel(f).x === a.x && cel(f).y === a.y) { f.x = a.x + 0.5; f.y = a.y + 0.5; sentar(p, f, a.dir); } else { f.estado = 'parado'; f.desde = p.minuto; } break; }
    case 'cafe': { const c = p.objetos.find((o) => item(o.def)?.interacao === 'cafeteira' && (cafes(o) > 0)); if (c && tomarCafe(c)) { f.energia = Math.min(100, f.energia + 32); f.humor = Math.min(100, f.humor + 5); f.fala = 'Ahh, café!'; f.falaAte = p.minuto + 2; const lx = p.objetos.find((q) => item(q.def)?.interacao === 'lixeira'); if (lx) definir(lx, 'lixo', Math.min(10, Number((lx.estado?.lixo as number | undefined) ?? 0) + 1)); } f.desde = p.minuto; break; }
    case 'descansando': f.dir = 'S'; f.desde = p.minuto; break;
    case 'pausa': f.desde = p.minuto; break;
    case 'indo_embora': f.estado = 'ausente'; f.x = 0; f.y = 0; f.desde = p.minuto; for (const q of p.portas) q.aberta = false; break;
    default: break;
  }
  void g; void rnd;
}
function sair(p: Projeto, f: Funcionario, g: Grade): void {
  const e = portaEntrada(p); f.estado = 'indo_embora'; f.desde = p.minuto; f.fala = 'Até amanhã!'; f.falaAte = p.minuto + 2;
  if (!e || !irPara(f, g, e)) { f.estado = 'ausente'; f.caminho = []; }
}
function trabalhar(p: Projeto, f: Funcionario, dtMin: number, g: Grade, rnd: () => number): void {
  const mesa = f.estacao; const pc = mesa ? computadorDaMesa(p, mesa) : null;
  if (!pc) { f.estado = 'parado'; return; }
  const t = f.tracos.map((x) => tracoPorId.get(x)); const gastoEnergia = 0.1 * (1 - t.reduce((a, x) => a + (x?.energia ?? 0), 0)); const eficiencia = Math.max(0.2, f.produtividade * (0.6 + f.energia / 250) * (0.8 + f.humor / 250));
  const ganho = 0.05 * eficiencia * dtMin; p.cc = Math.round((p.cc + ganho) * 1000) / 1000; f.produzido += ganho; f.energia = Math.max(0, f.energia - gastoEnergia * dtMin); f.humor = Math.max(10, Math.min(100, f.humor + (70 - f.humor) * 0.005 * dtMin));
  const md = minutoDoDia(p.minuto);
  const almocou = f.fala === '__almocou__'; void almocou;
  if (f.energia < 30 || (md >= HORARIO.almoco[0] && md < HORARIO.almoco[0] + 15 && f.desde < p.minuto - 60 && f.estado === 'trabalhando' && rnd() < 0.2)) pausar(p, f, g, rnd);
}
function pausar(p: Projeto, f: Funcionario, g: Grade, rnd: () => number): void {
  const cafeteiras = p.objetos.filter((o) => item(o.def)?.interacao === 'cafeteira');
  const cafe = cafeteiras.find((o) => cafes(o) > 0) ?? cafeteiras.find((o) => graos(o) > 0 && (prepararCafe(p, o.id), cafes(o) > 0));
  if (f.energia < 45 && cafe && irPara(f, g, { x: cafe.x, y: cafe.y }, true)) { f.estado = 'cafe'; f.desde = p.minuto; return; }
  const ocupados = new Set(p.funcionarios.filter((q) => q.id !== f.id && q.estado === 'descansando' && q.alvo).map((q) => q.alvo));
  for (const o of p.objetos) {
    const d = item(o.def); if (!d || !(d.id.startsWith('sofa') || d.id.startsWith('poltrona'))) continue;
    for (const c of celulasDe(o, d)) { const k = `${c.x},${c.y}`; if (ocupados.has(k) || !g.livre(c.x, c.y)) continue; if (irPara(f, g, c)) { f.estado = 'descansando'; f.alvo = k; f.desde = p.minuto; return; } }
  }
  const x = 1 + Math.floor(rnd() * (p.largura - 2)); const y = 1 + Math.floor(rnd() * (p.altura - 2));
  if (g.livre(x, y) && irPara(f, g, { x, y })) { f.estado = 'pausa'; f.alvo = null; f.desde = p.minuto; } else { f.estado = 'pausa'; f.desde = p.minuto; }
}
function conversar(p: Projeto, f: Funcionario, rnd: () => number): void {
  if (f.estado === 'conversando') return; const social = f.tracos.reduce((a, t) => a + (tracoPorId.get(t)?.social ?? 0), 0.15);
  const par = p.funcionarios.find((q) => q.id !== f.id && q.status === 'ativo' && ['pausa', 'cafe', 'descansando'].includes(q.estado) && !q.caminho.length && !f.caminho.length && Math.hypot(q.x - f.x, q.y - f.y) < 3.2);
  if (!par || rnd() > Math.max(0.01, social) * 0.04) return;
  for (const [a, b] of [[f, par], [par, f]] as [Funcionario, Funcionario][]) { a.estado = 'conversando'; a.desde = p.minuto; a.dir = direcaoDe(b.x - a.x, b.y - a.y, a.dir); }
  const l = f.tracos.flatMap((t) => FALAS_TRACO[t] ?? []); const linhas = l.length ? [...l, ...FALAS] : FALAS; f.fala = linhas[Math.floor(rnd() * linhas.length)]; f.falaAte = p.minuto + 6;
  par.fala = FALAS[Math.floor(rnd() * FALAS.length)]; par.falaAte = p.minuto + 8; f.humor = Math.min(100, f.humor + 4); par.humor = Math.min(100, par.humor + 4);
}
/** Fim do dia: paga os salários; quem não recebe por 3 dias pede demissão. Devolve o resumo. */
export function pagarSalarios(p: Projeto, registrar: (tipo: 'salario' | 'recompensa', valor: number, desc: string) => void): { pago: number; saidas: string[] } {
  let pago = 0; const saidas: string[] = [];
  for (const f of p.funcionarios) {
    if (f.status !== 'ativo') continue;
    if (f.produzido > 0.01) { registrar('recompensa', Math.round(f.produzido * 100) / 100, `Produção de ${f.nome}`); f.produzido = 0; }
    if (p.cc >= f.salario) { p.cc = Math.round((p.cc - f.salario) * 1000) / 1000; pago += f.salario; f.diasSemPagar = 0; registrar('salario', -f.salario, `Salário de ${f.nome}`); }
    else { f.diasSemPagar++; f.humor = Math.max(0, f.humor - 25); if (f.diasSemPagar >= 3) { demitir(p, f.id); saidas.push(f.nome); } }
  }
  return { pago, saidas };
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
