// Peças básicas da interface do escritório (botões, campos, abas, cartões): leves e sem dependências.
import { useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export const Cartao = ({ titulo, acao, children, className = '' }: { titulo?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`o-cartao ${className}`}>{(titulo || acao) && <header><h4>{titulo}</h4>{acao}</header>}{children}</section>
);
export const Botao = ({ primario, perigo, pequeno, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { primario?: boolean; perigo?: boolean; pequeno?: boolean }) => (
  <button type="button" {...p} className={`o-btn ${primario ? 'pri' : ''} ${perigo ? 'per' : ''} ${pequeno ? 'peq' : ''} ${p.className ?? ''}`} />
);
export const Campo = ({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) => (<label className="o-campo"><span>{rotulo}</span>{children}{dica && <small>{dica}</small>}</label>);
export const Entrada = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`o-in ${p.className ?? ''}`} />;
export const Seletor = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`o-in ${p.className ?? ''}`} />;
export const Texto = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={`o-in ${p.className ?? ''}`} />;
export const Etiqueta = ({ cor = 'cinza', children, titulo }: { cor?: 'verde' | 'azul' | 'amarelo' | 'vermelho' | 'roxo' | 'cinza'; children: ReactNode; titulo?: string }) => <span className={`o-etq ${cor}`} title={titulo}>{children}</span>;
export const Vazio = ({ children }: { children: ReactNode }) => <p className="o-vazio">{children}</p>;
export function Abas({ abas, inicial, aoMudar }: { abas: { id: string; rotulo: string; conteudo: ReactNode }[]; inicial?: string; aoMudar?: (id: string) => void }) {
  const [ativa, setAtiva] = useState(inicial ?? abas[0].id);
  return (<div className="o-abas"><nav role="tablist">{abas.map((a) => <button key={a.id} role="tab" aria-selected={a.id === ativa} className={a.id === ativa ? 'on' : ''} onClick={() => { setAtiva(a.id); aoMudar?.(a.id); }}>{a.rotulo}</button>)}</nav><div className="o-aba-corpo">{abas.find((a) => a.id === ativa)?.conteudo}</div></div>);
}
export const brl = (v: number | null | undefined): string => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
export const quando = (iso?: string | null): string => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const ESTADO_ROTULO: Record<string, string> = { disponivel: 'Disponível', aguardando: 'Aguardando', planejando: 'Planejando', executando: 'Executando', analisando: 'Analisando', aguardando_aprovacao: 'Aguardando aprovação', concluido: 'Concluído', com_erro: 'Com erro', pausado: 'Pausado' };
export const corEstado = (e: string): 'verde' | 'azul' | 'amarelo' | 'vermelho' | 'roxo' | 'cinza' => ({ disponivel: 'verde', concluido: 'verde', executando: 'azul', analisando: 'azul', planejando: 'roxo', aguardando_aprovacao: 'amarelo', com_erro: 'vermelho' }[e] as 'verde' | undefined) ?? 'cinza';
export const DEPARTAMENTOS: Record<string, string> = { diretoria: 'Diretoria', pesquisa: 'Pesquisa e Inteligência Comercial', produtos: 'Produtos e Marketplace', marketing: 'Marketing e Criatividade', audiovisual: 'Estúdio Audiovisual', financeiro: 'Financeiro', reunioes: 'Sala de Reuniões', convivencia: 'Área de Convivência' };
export const erroTexto = (e: unknown): string => (e instanceof Error ? e.message : String(e));
