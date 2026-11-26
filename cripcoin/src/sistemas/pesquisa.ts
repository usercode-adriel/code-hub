// PESQUISA REAL: o navegador do jogo chama o servidor, que consulta a web de verdade. Sem sessão/rede => erro claro (nunca resultados falsos).
export interface Resultado { titulo: string; url: string; trecho?: string }
export interface RespostaPesquisa { fonte: string; resumo: string; resultados: Resultado[] }
export interface Pagina { url: string; title: string; text: string; truncated: boolean }
const token = (): string | null => { try { return localStorage.getItem('codeniac.token'); } catch { return null; } };
async function get<T>(rota: string, q: Record<string, string>): Promise<T> {
  const t = token(); if (!t) throw new Error('Para pesquisar na web você precisa estar logado no Hub (abra o Hub e entre).');
  let r: Response; try { r = await fetch(`/api/cripcoin/${rota}?${new URLSearchParams(q)}`, { headers: { Authorization: `Bearer ${t}` } }); } catch { throw new Error('Sem conexão com o servidor.'); }
  const j = await r.json().catch(() => ({})) as { error?: string }; if (!r.ok) throw new Error(j.error ?? `Erro ${r.status}`); return j as T;
}
export const pesquisar = (q: string): Promise<RespostaPesquisa> => get('pesquisar', { q });
export const lerPagina = (url: string): Promise<Pagina> => get('pagina', { url });
