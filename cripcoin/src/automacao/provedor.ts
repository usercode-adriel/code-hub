// PROVEDOR DE RESPOSTAS: quem escreve a fala das personagens. O padrão chama o servidor do Hub (IA real configurada lá).
// Para automações/integrações futuras basta registrar outro provedor (`definirProvedor`) sem mexer no resto do jogo.
import type { Funcionario } from '../tipos';

export interface PedidoResposta {
  funcionario: Funcionario; mensagem: string; historico: { de: 'eu' | 'ela'; texto: string }[];
  contexto: { escritorio: string; empresa: string; hora: string; dia: number; equipe: string[] };
}
export interface Provedor { nome: string; responder(pedido: PedidoResposta): Promise<string> }
export class ErroProvedor extends Error { constructor(msg: string, readonly semIA = false) { super(msg); } }

const token = (): string | null => { try { return localStorage.getItem('codeniac.token'); } catch { return null; } };
export const provedorServidor: Provedor = {
  nome: 'Hub (IA configurada)',
  async responder(p) {
    const t = token(); if (!t) throw new ErroProvedor('Para conversar com as personagens você precisa estar logado no Hub (abra o Hub e entre).');
    const f = p.funcionario; let r: Response;
    const corpo = { mensagem: p.mensagem, historico: p.historico.slice(-8), contexto: p.contexto,
      funcionario: { nome: f.nome, apelido: f.apelido, cargo: f.cargo, personalidade: f.tracos, defeitos: f.defeitos ?? [], habilidades: f.habilidades, extras: f.extras ?? '', comportamento: f.comportamento } };
    try { r = await fetch('/api/cripcoin/conversar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(corpo) }); } catch { throw new ErroProvedor('Sem conexão com o servidor.'); }
    const j = await r.json().catch(() => ({})) as { texto?: string; error?: string; semIA?: boolean };
    if (!r.ok || !j.texto) throw new ErroProvedor(j.error ?? `Erro ${r.status}`, Boolean(j.semIA));
    return j.texto;
  },
};
let atual: Provedor = provedorServidor;
export const provedorAtual = (): Provedor => atual;
export const definirProvedor = (p: Provedor): void => { atual = p; };
