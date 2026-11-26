// COMPORTAMENTO AUTÔNOMO E MOVIMENTO LEVE DOS AVATARES. Os sprites têm 8 direções (sentados na cadeira): não há quadros de caminhada.
// A vida do escritório vem de (1) pequenos movimentos por estado (vai e vem suave do corpo), (2) giros controlados entre direções vizinhas,
// (3) pausas e (4) deslocamentos curtos "rolando na cadeira". Tudo é uma máquina de estados simples e determinística (semente por personagem).
import { DIRECOES, type Direcao } from './iso';
import type { EstadoAnim } from './animacoes';

export type EstadoComp = 'idle' | 'working' | 'sitting' | 'walking' | 'looking_around' | 'resting';
export interface Comp {
  estado: EstadoComp; dir: Direcao; casa: Direcao;       // casa: direção de repouso (de frente para a mesa)
  desde: number; proxima: number;                       // instantes (s): quando entrou no estado e quando decidir de novo
  alvo: { x: number; y: number } | null; voltando: boolean; giros: number; semente: number;
}

/** Gerador pseudoaleatório determinístico (mulberry32) para cada personagem: comportamento variado, mas sem sustos nos testes. */
export function aleatorio(semente: number): () => number {
  let a = semente >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export const girar = (dir: Direcao, passos: number): Direcao => DIRECOES[(DIRECOES.indexOf(dir) + passos + 80) % 8];
/** Distância angular em passos de 45° entre duas direções (0..4). */
export const distancia = (a: Direcao, b: Direcao): number => { const d = Math.abs(DIRECOES.indexOf(a) - DIRECOES.indexOf(b)); return Math.min(d, 8 - d); };

export function novoComp(dir: Direcao, agora: number, id: string): Comp {
  const rnd = aleatorio(hash(id));
  return { estado: 'sitting', dir, casa: dir, desde: agora, proxima: agora + 4 + rnd() * 8, alvo: null, voltando: false, giros: 0, semente: hash(id) };
}

export interface Contexto { agora: number; rnd: () => number; livre: boolean; podeAndar: boolean; ocioMs: number }
export type Acao = { tipo: 'virar'; dir: Direcao } | { tipo: 'andar' } | { tipo: 'sentar' } | { tipo: 'estado'; estado: EstadoComp } | null;

/**
 * Decide a próxima ação de um personagem DISPONÍVEL (sem tarefa nem conversa). Regras:
 *  - sentado: de tempos em tempos olha em volta (gira 1 passo de 45°, no máximo 2 passos para cada lado) e volta a encarar a mesa;
 *  - de vez em quando (e só um personagem por vez: `podeAndar`) dá uma voltinha curta e retorna;
 *  - ocioso há muito tempo: descansa (parado, de lado).
 * Nunca gira a cada quadro: cada decisão respeita um intervalo mínimo.
 */
export function proximaAcao(c: Comp, x: Contexto): Acao {
  if (x.agora < c.proxima) return null;
  const r = x.rnd();
  if (!x.livre) { c.proxima = x.agora + 2; return null; }
  switch (c.estado) {
    case 'sitting': case 'idle': {
      if (x.ocioMs > 5 * 60 * 1000 && r < 0.2) { c.proxima = x.agora + 12 + x.rnd() * 10; return { tipo: 'estado', estado: 'resting' }; }
      if (x.podeAndar && r < 0.14) { c.proxima = x.agora + 3; return { tipo: 'andar' }; }
      if (r < 0.75) { c.giros = 0; c.proxima = x.agora + 1.4 + x.rnd() * 1.6; return { tipo: 'estado', estado: 'looking_around' }; }
      c.proxima = x.agora + 5 + x.rnd() * 8; return null;
    }
    case 'looking_around': {
      // até 3 giros seguidos (ida e volta); depois volta à direção de casa e descansa um tempo
      if (c.giros >= 3 || x.rnd() < 0.25) { c.proxima = x.agora + 6 + x.rnd() * 10; return { tipo: 'sentar' }; }
      const lado = x.rnd() < 0.5 ? -1 : 1; let nova = girar(c.dir, lado); if (distancia(nova, c.casa) > 2) nova = girar(c.dir, -lado);
      c.giros++; c.proxima = x.agora + 1.6 + x.rnd() * 2.2; return { tipo: 'virar', dir: nova };
    }
    case 'resting': { c.proxima = x.agora + 8 + x.rnd() * 10; return { tipo: 'sentar' }; }
    default: return null;                                   // walking/working: quem decide é a navegação / o estado real do agente
  }
}

/** Pequeno deslocamento visual (px lógicos) por estado de animação, em função do tempo (s). Sutil de propósito: nada de tremer. */
export function movimentoLeve(estado: EstadoAnim, t: number, fase: number): { dx: number; dy: number } {
  const w = (hz: number): number => Math.sin((t * hz + fase) * Math.PI * 2);
  const meio = (v: number): number => Math.round(v * 2) / 2;                       // passos de meio pixel: sem tremer em subpixel
  switch (estado) {
    case 'typing': case 'working': return { dx: 0, dy: meio(w(3.2) * 0.5) };          // digitando: balanço curto
    case 'thinking': return { dx: 0, dy: meio(w(0.9) * 0.5) };
    case 'talking': case 'meeting-talking': return { dx: 0, dy: meio(w(2.4) * 0.5) };
    case 'celebrating': return { dx: 0, dy: -Math.abs(meio(w(1.6) * 2)) };            // pulinhos
    case 'error': case 'worried': return { dx: meio(w(5) * 0.5), dy: 0 };             // tremidinha
    case 'walking': return { dx: 0, dy: meio(w(4.5) * 0.5) };                         // rolando: vai e vem leve
    case 'resting': return { dx: 0, dy: meio(w(0.25) * 1) };
    default: return { dx: 0, dy: 0 };                                                 // idle/sitting/meeting: parado
  }
}
