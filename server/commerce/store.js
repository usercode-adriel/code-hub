// COMMERCE OFFICE — persistência. Os dados ficam em db().commerce[usuário], no mesmo db.json do Hub (nada de banco paralelo),
// com versão de esquema para migrações futuras. Cada usuário só enxerga os próprios dados.
import { db, save, id, now } from '../db.js';

export const SCHEMA = 2;
const vazio = () => ({
  schema: SCHEMA,
  layouts: [], layoutAtivo: null,        // escritório: mapas salvos (Office Builder)
  assets: [],                            // manifestos do Asset Studio (arquivos ficam em disco)
  aquisicoes: [],                        // pacotes de assets analisados, aguardando aprovação
  personagens: [],                       // avatares e spritesheets
  agentes: [],                           // funcionários de IA (cada um ligado a um bot real)
  tarefas: [], produtos: [], campanhas: [], reunioes: [],
  lancamentos: [],                       // financeiro comercial auditável
  conectores: {},                        // estado de cada marketplace
  importacoes: [],                       // histórico de importações de relatório
  auditoria: [],                         // quem fez o quê
  ordens: [],                            // ordens do chefe (linguagem natural) e seu andamento
  mensagens: [],                         // comunicação interna entre os agentes (nuvens de diálogo e histórico)
  documentos: [],                        // roteiros, propostas e relatórios gerados pelos agentes (com classificação da informação)
  estoque: { itens: [], movimentos: [] },// controle de estoque da Sala de Estoque e Logística
  equipeConfig: { maxTurnos: 8, balaoSegundos: 7, limiteChamadasDia: 80, uso: { data: '', chamadas: 0 } },
});

export function area(userId) {
  const d = db();
  d.commerce ??= {};
  const a = (d.commerce[userId] ??= vazio());
  // migração: garante as chaves novas sem apagar nada
  for (const [k, v] of Object.entries(vazio())) if (a[k] === undefined) a[k] = v;
  a.schema = SCHEMA;
  return a;
}

export function auditar(userId, acao, detalhe = {}) {
  const a = area(userId);
  a.auditoria.push({ id: id(), em: now(), acao, ...detalhe });
  if (a.auditoria.length > 2000) a.auditoria.splice(0, a.auditoria.length - 2000);
  save();
}

// ---- validação simples e explícita (mensagens em português; erro leva status 400) ----
export const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });
export const txt = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
export const oneOf = (v, lista, padrao) => (lista.includes(v) ? v : padrao);
export const numero = (v, padrao = null) => { const n = Number(v); return Number.isFinite(n) ? n : padrao; };
export const dataISO = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
export const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export { id, now, save };
