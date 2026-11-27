// REDES SOCIAIS FICTÍCIAS das personagens (celular): perfis, posts, comentários e galeria. Tudo é determinístico a partir da semente da
// personagem (o mesmo projeto mostra sempre os mesmos posts) e é FICTÍCIO — contas e textos inventados para o jogo, sem nada real.
import { aleatorio, hash } from '../nucleo/rng';
import type { Funcionario, Projeto } from '../tipos';

export type Cena = 'praia' | 'cidade' | 'escritorio' | 'cafe' | 'parque' | 'quarto' | 'festa' | 'espelho' | 'produto' | 'unboxing';
export interface Foto { cena: Cena; avatar?: string; item?: string; semente: number; preco?: string }
export interface Autor { handle: string; nome: string; avatar?: string; cor: string; ficticia: boolean }
export interface Comentario { autor: string; texto: string }
export interface Post { id: string; autor: Autor; foto: Foto; legenda: string; curtidas: number; comentarios: Comentario[]; dias: number }
export interface Perfil { autor: Autor; bio: string; seguidores: number; seguindo: number; posts: Post[] }

const ITENS_PRODUTO = ['oculos-sol', 'fones-bluetooth', 'headphone', 'garrafa-agua', 'chapinha', 'perfume', 'paleta-sombras', 'batom', 'xuxinha', 'piranha-cabelo', 'colar', 'brincos', 'moletom', 'saia', 'cropped', 'escova', 'espelho', 'mascara-dormir', 'bolsa-rosa', 'ecobag', 'necessaire', 'garrafa-termica'];
const NOMES_PRODUTO: Record<string, string> = { 'oculos-sol': 'óculos de sol', 'fones-bluetooth': 'fone bluetooth', headphone: 'headphone rosa', 'garrafa-agua': 'garrafinha', chapinha: 'chapinha', perfume: 'perfume', 'paleta-sombras': 'paleta de sombras', batom: 'batom', xuxinha: 'xuxinha', 'piranha-cabelo': 'piranha de cabelo', colar: 'colar de coração', brincos: 'brincos dourados', moletom: 'moletom rosa', saia: 'saia plissada', cropped: 'cropped', escova: 'escova', espelho: 'espelhinho', 'mascara-dormir': 'máscara de dormir', 'bolsa-rosa': 'bolsa rosa', ecobag: 'ecobag', necessaire: 'necessaire', 'garrafa-termica': 'garrafa térmica' };
/** Contas fictícias (páginas de achadinhos e amigas) — nomes inventados, sem ligação com perfis reais. */
export const CONTAS: Autor[] = [
  { handle: 'garimpo.online', nome: 'Garimpo Online', cor: '#ff7a45', ficticia: true }, { handle: 'cupom.relampago', nome: 'Cupom Relâmpago', cor: '#ee4d2d', ficticia: true },
  { handle: 'achadinhos.da.semana', nome: 'Achadinhos da Semana', cor: '#f5a623', ficticia: true }, { handle: 'casa.organizada.br', nome: 'Casa Organizada', cor: '#4caf8f', ficticia: true },
  { handle: 'moda.baratinha', nome: 'Moda Baratinha', cor: '#e86aa6', ficticia: true }, { handle: 'dicas.de.afiliada', nome: 'Dicas de Afiliada', cor: '#7a5ae0', ficticia: true },
];
const LEG_PRODUTO = ['Achadinho do dia: {p} por {v} 😱 link na bio!', 'Testei o {p} e aprovei. Cupom no link da bio 🛒', 'Esse {p} chegou em 7 dias e é lindo demais', 'Comparei o {p} da Temu e da Shopee: o de {v} ganhou', '{p} com frete grátis hoje, corre que acaba', 'Recebidos da semana: {p} ✨ quem quer review?'];
const LEG_PESSOAL = { praia: ['Folga merecida 🌊', 'Sol, mar e zero planilha'], cidade: ['Rolê de sexta à noite ✨', 'A cidade brilhando hoje'], escritorio: ['Dia de bater meta de cliques 💻', 'Escritório novo, energia nova'], cafe: ['Café antes de editar 40 vídeos ☕', 'Pausa estratégica'], parque: ['Domingo no parque 🌳', 'Respirando um pouco'], quarto: ['Boa noite, amanhã tem live 💤', 'Modo soneca ativado'], festa: ['Comemorando a comissão do mês 🎉', 'Sextou!'], espelho: ['Look do dia (tudo achadinho)', 'Mirror selfie obrigatória'], produto: ['Novo recebido'], unboxing: ['Unboxing de hoje 📦', 'Abrindo os pedidos da semana'] } as Record<Cena, string[]>;
const COMENT = ['Que lindo!! 😍', 'Me passa o link?', 'Comprei também kkkk', 'Chegou rápido?', 'Arrasou 🔥', 'Preciso disso', 'Amei o look', 'Hahaha essa foto', 'Quero o cupom!', 'Isso é da Temu??', 'Vou colocar no carrinho agora', 'Saudades 🥹'];
const BIOS = ['Afiliada Temu & Shopee 🛍️ | achadinhos todo dia | links 👇', 'Garimpo, testo e indico ✨ | cupons na bio', 'Reviews sinceros de compras online 📦 | parcerias por DM', 'Achadinhos de beleza e casa 💄🏠 | link na bio'];

const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
export const autorDe = (f: Funcionario): Autor => ({ handle: `${slug(f.apelido || f.nome)}.achadinhos`, nome: `${f.nome} ${f.sobrenome}`.trim(), avatar: f.avatar, cor: '#c13584', ficticia: false });
const preco = (r: () => number): string => `R$ ${(9 + Math.floor(r() * 80))},${['90', '99', '49', '00'][Math.floor(r() * 4)]}`;

function postsDe(autor: Autor, semente: number, n: number, equipe: Autor[]): Post[] {
  const r = aleatorio(semente); const out: Post[] = []; const esc = <T,>(l: T[]): T => l[Math.floor(r() * l.length)];
  for (let i = 0; i < n; i++) {
    const pessoal = autor.avatar && r() < 0.55; const cenas: Cena[] = ['praia', 'cidade', 'escritorio', 'cafe', 'parque', 'quarto', 'festa', 'espelho'];
    const cena: Cena = pessoal ? esc(cenas) : r() < 0.5 ? 'produto' : 'unboxing'; const item = esc(ITENS_PRODUTO); const v = preco(r);
    const legenda = pessoal ? esc(LEG_PESSOAL[cena]) : esc(LEG_PRODUTO).replace('{p}', NOMES_PRODUTO[item] ?? item).replace('{v}', v);
    const quem = [...equipe.filter((a) => a.handle !== autor.handle), ...CONTAS]; const nc = 1 + Math.floor(r() * 3);
    out.push({ id: `${autor.handle}-${i}`, autor, foto: { cena, avatar: pessoal ? autor.avatar : undefined, item: pessoal ? (cena === 'cafe' ? 'garrafa-agua' : undefined) : item, semente: semente + i * 7, preco: pessoal ? undefined : v },
      legenda, curtidas: 20 + Math.floor(r() * (autor.ficticia ? 4000 : 900)), comentarios: Array.from({ length: nc }, () => ({ autor: esc(quem).handle, texto: esc(COMENT) })), dias: i * 2 + Math.floor(r() * 2) });
  }
  return out;
}
export function perfilDe(p: Projeto, f: Funcionario): Perfil {
  const s = hash(`${p.id}:${f.candidatoId}`); const r = aleatorio(s); const a = autorDe(f); const equipe = p.funcionarios.filter((q) => q.status !== 'demitido').map(autorDe);
  return { autor: a, bio: BIOS[Math.floor(r() * BIOS.length)], seguidores: 800 + Math.floor(r() * 25000), seguindo: 150 + Math.floor(r() * 700), posts: postsDe(a, s, 9 + Math.floor(r() * 4), equipe) };
}
export function perfilConta(p: Projeto, c: Autor): Perfil { const s = hash(`${p.id}:${c.handle}`); const r = aleatorio(s); return { autor: c, bio: 'Página de achadinhos e cupons (conta fictícia).', seguidores: 20000 + Math.floor(r() * 300000), seguindo: 50 + Math.floor(r() * 300), posts: postsDe(c, s, 9, []) }; }
/** Feed da dona do celular: posts das colegas, das contas que ela segue e os dela, do mais novo para o mais antigo. */
export function feedDe(p: Projeto, _f: Funcionario): Post[] {
  const colegas = p.funcionarios.filter((q) => q.status !== 'demitido').map((q) => perfilDe(p, q));
  return [...colegas.flatMap((q) => q.posts.slice(0, 6)), ...CONTAS.flatMap((c) => perfilConta(p, c).posts.slice(0, 3))].sort((a, b) => a.dias - b.dias || a.id.localeCompare(b.id));
}
/** Galeria: fotos dela (selfies em lugares diferentes). */
export function galeriaDe(p: Projeto, f: Funcionario): Foto[] {
  const s = hash(`${p.id}:${f.candidatoId}:galeria`); const r = aleatorio(s); const cenas: Cena[] = ['espelho', 'praia', 'cafe', 'cidade', 'parque', 'escritorio', 'festa', 'quarto'];
  return Array.from({ length: 15 }, (_, i) => ({ cena: cenas[Math.floor(r() * cenas.length)], avatar: f.avatar, semente: s + i * 13, item: r() < 0.3 ? ITENS_PRODUTO[Math.floor(r() * ITENS_PRODUTO.length)] : undefined }));
}
