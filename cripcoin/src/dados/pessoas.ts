// PESSOAS: nomes, traços de personalidade, cargos e o gerador de candidatos. Os avatares são os 5 sprites fornecidos (8 direções).
import { aleatorio } from '../nucleo/rng';
import type { Candidato, Habilidades } from '../tipos';

export const AVATARES = ['eleonor', 'lady', 'sophia', 'laurinda', 'lucya'];
export const NOMES_AVATAR: Record<string, string> = { eleonor: 'jersey 98 e óculos escuros', lady: 'óculos de grau e regata branca', sophia: 'cabelo longo e blusa listrada verde', laurinda: 'coque castanho e regata roxa', lucya: 'rabos de cavalo e blusa listrada' };
export interface TracoDef { id: string; nome: string; prod: number; social: number; energia: number; humor: number; dica: string }
export const TRACOS: TracoDef[] = [
  { id: 'introvertido', nome: 'Introvertido', prod: 0.05, social: -0.5, energia: 0, humor: 0, dica: 'Prefere trabalhar quieto; conversa pouco.' },
  { id: 'extrovertido', nome: 'Extrovertido', prod: -0.03, social: 0.6, energia: 0.1, humor: 0.1, dica: 'Puxa conversa nas pausas.' },
  { id: 'inteligente', nome: 'Inteligente', prod: 0.12, social: 0, energia: 0, humor: 0, dica: 'Resolve rápido.' },
  { id: 'criativo', nome: 'Criativo', prod: 0.06, social: 0.1, energia: 0, humor: 0.1, dica: 'Boas ideias, ritmo irregular.' },
  { id: 'organizado', nome: 'Organizado', prod: 0.1, social: 0, energia: 0.05, humor: 0, dica: 'Mantém o ritmo estável.' },
  { id: 'ambicioso', nome: 'Ambicioso', prod: 0.12, social: -0.1, energia: -0.15, humor: -0.05, dica: 'Rende mais, cansa mais.' },
  { id: 'preguicoso', nome: 'Preguiçoso', prod: -0.15, social: 0.1, energia: 0.1, humor: 0.05, dica: 'Rende menos e descansa mais.' },
  { id: 'proativo', nome: 'Proativo', prod: 0.1, social: 0.05, energia: -0.05, humor: 0, dica: 'Começa antes e não espera ordens.' },
  { id: 'competitivo', nome: 'Competitivo', prod: 0.08, social: -0.05, energia: -0.1, humor: -0.05, dica: 'Rende mais perto de colegas.' },
  { id: 'comunicativo', nome: 'Comunicativo', prod: 0, social: 0.5, energia: 0, humor: 0.1, dica: 'Conversa bastante.' },
  { id: 'calmo', nome: 'Calmo', prod: 0.02, social: 0, energia: 0.15, humor: 0.1, dica: 'Se cansa devagar.' },
  { id: 'impulsivo', nome: 'Impulsivo', prod: -0.02, social: 0.15, energia: -0.1, humor: -0.1, dica: 'Muda de atividade de repente.' },
  { id: 'humoristico', nome: 'Humorístico', prod: -0.02, social: 0.3, energia: 0, humor: 0.2, dica: 'Faz piadas e levanta o humor.' },
  { id: 'reservado', nome: 'Reservado', prod: 0.03, social: -0.3, energia: 0.05, humor: 0, dica: 'Fala pouco de si.' },
  { id: 'colaborativo', nome: 'Colaborativo', prod: 0.04, social: 0.3, energia: 0, humor: 0.05, dica: 'Ajuda os colegas.' },
];
export const tracoPorId = new Map(TRACOS.map((t) => [t.id, t]));
export const CARGOS: { cargo: string; esp: string; foco: keyof Habilidades }[] = [
  { cargo: 'Analista de Dados', esp: 'Análise e relatórios', foco: 'logica' }, { cargo: 'Designer', esp: 'Interface e identidade visual', foco: 'criatividade' }, { cargo: 'Gerente de Projetos', esp: 'Planejamento e prazos', foco: 'organizacao' },
  { cargo: 'Redator', esp: 'Textos e conteúdo', foco: 'comunicacao' }, { cargo: 'Desenvolvedor', esp: 'Programação web', foco: 'logica' }, { cargo: 'Atendimento', esp: 'Relacionamento com clientes', foco: 'comunicacao' },
  { cargo: 'Financeiro', esp: 'Contas e orçamento', foco: 'organizacao' }, { cargo: 'Marketing', esp: 'Campanhas e redes sociais', foco: 'criatividade' },
];
const NOMES = ['Ana', 'Bianca', 'Carla', 'Daniela', 'Elisa', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Júlia', 'Karen', 'Larissa', 'Marina', 'Natália', 'Olívia', 'Patrícia', 'Rafaela', 'Sabrina', 'Tatiana', 'Valéria'];
const SOBRE = ['Almeida', 'Barros', 'Cardoso', 'Dias', 'Esteves', 'Ferraz', 'Gomes', 'Lima', 'Moura', 'Nunes', 'Oliveira', 'Pires', 'Queiroz', 'Ramos', 'Souza', 'Teixeira'];
const FORTES: Record<keyof Habilidades, string> = { criatividade: 'Ideias originais', logica: 'Raciocínio lógico', comunicacao: 'Comunica bem', organizacao: 'Muito organizada' };
const FRACOS: Record<keyof Habilidades, string> = { criatividade: 'Segue pouco o inusitado', logica: 'Se perde em cálculos', comunicacao: 'Tem dificuldade em explicar', organizacao: 'Esquece prazos' };

/** Gera os candidatos (um por avatar), de forma determinística a partir da semente do projeto. */
export function gerarCandidatos(semente: number): Candidato[] {
  const r = aleatorio(semente); const esc = <T,>(l: T[]): T => l[Math.floor(r() * l.length)];
  return AVATARES.map((avatar, i) => {
    const c = CARGOS[Math.floor(r() * CARGOS.length)]; const h: Habilidades = { criatividade: 3 + Math.floor(r() * 5), logica: 3 + Math.floor(r() * 5), comunicacao: 3 + Math.floor(r() * 5), organizacao: 3 + Math.floor(r() * 5) };
    h[c.foco] = Math.min(10, h[c.foco] + 3); const ord = (Object.keys(h) as (keyof Habilidades)[]).sort((a, b) => h[b] - h[a]);
    const tracos = [esc(TRACOS).id]; while (tracos.length < 3) { const t = esc(TRACOS).id; if (!tracos.includes(t)) tracos.push(t); }
    const nome = esc(NOMES); const idade = 21 + Math.floor(r() * 20); const media = (h.criatividade + h.logica + h.comunicacao + h.organizacao) / 4; const salario = Math.round(14 + media * 2.6 + r() * 4);
    return { id: `cand-${semente.toString(36)}-${i}`, avatar, nome: `${nome} ${esc(SOBRE)}`, idade, cargo: c.cargo, especialidade: c.esp, habilidades: h, tracos,
      fortes: [FORTES[ord[0]], FORTES[ord[1]]], fracos: [FRACOS[ord[3]]], salario, descricao: `${nome} tem ${idade} anos, aparência com ${NOMES_AVATAR[avatar]}, e busca uma vaga como ${c.cargo.toLowerCase()}.`,
      disponibilidade: ['Imediata', 'Imediata', 'Em 1 dia', 'Meio período à tarde'][Math.floor(r() * 4)], comportamento: tracos.map((t) => tracoPorId.get(t)!.dica).join(' ') };
  });
}
