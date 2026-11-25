// Cliente da API do Hub (mesma origem, mesmo token do login). O escritório roda dentro do Hub: nada de autenticação nova.
export const token = (): string => localStorage.getItem('codeniac.token') ?? '';

export class ErroApi extends Error { constructor(msg: string, readonly status: number) { super(msg); } }

async function chamar<T>(base: string, metodo: string, rota: string, corpo?: unknown): Promise<T> {
  const opts: RequestInit = { method: metodo, headers: { Authorization: `Bearer ${token()}` } };
  if (corpo instanceof FormData) opts.body = corpo;
  else if (corpo !== undefined) { opts.body = JSON.stringify(corpo); (opts.headers as Record<string, string>)['Content-Type'] = 'application/json'; }
  const r = await fetch(`${base}${rota}`, opts);
  const dados = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (!r.ok) throw new ErroApi(dados?.error ?? `Erro ${r.status}`, r.status);
  return dados as T;
}
export const api = {
  get: <T = unknown>(rota: string) => chamar<T>('/api/commerce', 'GET', rota),
  post: <T = unknown>(rota: string, corpo?: unknown) => chamar<T>('/api/commerce', 'POST', rota, corpo ?? {}),
  put: <T = unknown>(rota: string, corpo?: unknown) => chamar<T>('/api/commerce', 'PUT', rota, corpo ?? {}),
  del: <T = unknown>(rota: string) => chamar<T>('/api/commerce', 'DELETE', rota),
  hub: <T = unknown>(metodo: string, rota: string, corpo?: unknown) => chamar<T>('/api', metodo, rota, corpo),
};
export const urlAsset = (id: string): string => `/api/commerce/assets/${encodeURIComponent(id)}/arquivo?token=${encodeURIComponent(token())}`;

/** Chat com um agente: usa o mesmo chat do Hub (SSE) numa conversa ligada ao bot do agente. */
export async function conversar(texto: string, conversaId: string, aoEvento: (ev: { type: string; text?: string; name?: string }) => void): Promise<void> {
  const r = await fetch('/api/assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ message: texto, conversationId: conversaId }) });
  if (!r.ok || !r.body) throw new ErroApi((await r.json().catch(() => ({}))).error ?? 'Falha no chat', r.status);
  const leitor = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await leitor.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) { const bloco = buf.slice(0, i); buf = buf.slice(i + 2); const linha = bloco.split('\n').find((l) => l.startsWith('data: ')); if (linha) aoEvento(JSON.parse(linha.slice(6))); }
  }
}

// ---------- tipos dos dados do servidor (só o que a interface usa) ----------
export interface Agente { id: string; chave: string | null; nome: string; cargo: string; departamento: string; estado: string; estadoDesde?: string; instrucoes: string; personalidade: string; modelo: string; ferramentas: string[]; memoria: string[]; tarefaAtual: string | null; avatarId: string | null; indicadores: { concluidas: number; aprovadas: number; erros: number }; tarefasAbertas: number; tempoMedioMs: number | null; historico: { em: string; evento: string; de?: string; para?: string; nota?: string }[] }
export interface Tarefa { id: string; nome: string; descricao: string; departamento: string; agenteId: string | null; prioridade: string; prazo: string | null; status: string; criadaEm: string; concluidaEm: string | null; resultado: string; atrasada: boolean; historico: { em: string; acao: string; de?: string; para?: string; motivo?: string; por?: string }[]; produtoId?: string | null; campanhaId?: string | null }
export interface Produto { id: string; nome: string; imagem: string; categoria: string; plataforma: string; preco: number | null; comissaoPct: number | null; comissaoPotencial: number | null; link: string; origem: string; publicoAlvo: string; avaliacao: { nota: number | null; texto: string; fonte: string } | null; status: string; real: boolean; historico: { em: string; acao: string; campos?: string[] }[] }
export interface Lancamento { id: string; data: string; plataforma: string; tipo: string; status: string; valor: number; produto: string; pedido: string; origem: string; real: boolean; externoId: string | null }
export interface Campanha { id: string; nome: string; produtoId: string | null; plataforma: string; objetivo: string; etapa: string; status: string; responsavelId: string | null; criativos: { id: string; titulo: string; tipo: string; arquivo: string; nota: string }[]; roteiros: { id: string; titulo: string; texto: string; autor: string; em: string }[]; resultados: { id: string; data: string; metrica: string; valor: number; fonte: string }[] }
export interface AssetM { id: string; nome: string; categoria: string; largura: number; altura: number; transparencia: boolean; escala: number; ancora: { x: number; y: number }; perspectiva: string; camada: string; colisao: { solida: boolean; larguraTiles: number; profundidadeTiles: number }; frames: { quadroL: number; quadroA: number; colunas: number; linhas: number } | null; animacoes: unknown[]; origem: string; autor: string; licenca: { tipo: string; usoComercial: boolean | string; atribuicao: boolean | string; evidencia: string }; licencaUrl: string; pacote: string }
export interface PersonagemDef { id: string; nome: string; assetId: string; quadroL: number; quadroA: number; colunas: number; linhas: number; animacoes: { estado: string | null; nome: string; direcao: string | null; linha: number; quadros: number[]; fps: number; loop: boolean }[]; escala: number; ancora: { x: number; y: number }; velocidade: number; direcoes: string[] }
export interface LayoutResumo { id: string; nome: string; versao: number; ativo: boolean; largura: number; altura: number; objetos: number }
