// Dados vivos da equipe: painel (agentes, ordem ativa, orçamento) e mensagens da comunicação interna, com polling leve
// (mais rápido enquanto há ordem em andamento, parado com a aba escondida). Nada aqui inventa fala: tudo vem do servidor.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Mensagem, type Ordem, type PainelEquipeDados } from './api';

export function useEquipe(ativo: boolean, aoNovaMensagem: (m: Mensagem[], inicial: boolean) => void) {
  const [painel, setPainel] = useState<PainelEquipeDados | null>(null); const [mensagens, setMensagens] = useState<Mensagem[]>([]); const [ordens, setOrdens] = useState<Ordem[]>([]);
  const cursor = useRef(0); const primeira = useRef(true); const cb = useRef(aoNovaMensagem); cb.current = aoNovaMensagem; const ativaRef = useRef(false);

  const atualizar = useCallback(async (): Promise<void> => {
    try {
      const [p, ms] = await Promise.all([api.get<PainelEquipeDados>('/equipe'), api.get<Mensagem[]>(`/mensagens?depois=${cursor.current}${primeira.current ? '&limite=300' : ''}`)]);
      setPainel(p); ativaRef.current = Boolean(p.ordemAtiva);
      if (ms.length) { cursor.current = ms[ms.length - 1].seq; setMensagens((a) => [...a, ...ms].slice(-600)); cb.current(ms, primeira.current); }
      primeira.current = false;
      if (ms.length || p.ordemAtiva || !ordensCarregadas.current) { setOrdens(await api.get<Ordem[]>('/ordens')); ordensCarregadas.current = true; }
    } catch { /* o próximo ciclo tenta de novo */ }
  }, []);
  const ordensCarregadas = useRef(false);

  useEffect(() => {
    if (!ativo) return; let vivo = true; let t: ReturnType<typeof setTimeout>;
    const ciclo = async (): Promise<void> => { if (!vivo) return; if (!document.hidden) await atualizar(); t = setTimeout(ciclo, ativaRef.current ? 1200 : 3500); };
    ciclo(); return () => { vivo = false; clearTimeout(t); };
  }, [ativo, atualizar]);

  const enviarOrdem = useCallback(async (texto: string): Promise<Ordem> => { const o = await api.post<Ordem>('/ordens', { texto }); ativaRef.current = true; await atualizar(); return o; }, [atualizar]);
  const cancelar = useCallback(async (id: string): Promise<void> => { await api.post(`/ordens/${id}/cancelar`); await atualizar(); }, [atualizar]);
  return { painel, mensagens, ordens, atualizar, enviarOrdem, cancelar };
}
