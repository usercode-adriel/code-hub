// IMPORTADOR DE RELATÓRIOS (CSV): funciona mesmo quando a API de uma plataforma não está disponível.
// Identifica colunas, deixa mapear campos, valida formatos, evita duplicidade, preserva o que já existe,
// registra a origem (arquivo + importação) e mostra os erros linha a linha. Nunca apaga lançamentos anteriores.
import { area, auditar, erro, txt, id, now, save } from './store.js';
import { registrar, PLATAFORMAS } from './finance.js';

// ---------- leitura de CSV (RFC 4180, com BOM e delimitador detectado) ----------
export function detectarDelimitador(texto) {
  const linha = String(texto).split(/\r?\n/).find((l) => l.trim()) || '';
  const conta = (c) => { let n = 0; let aspas = false; for (const ch of linha) { if (ch === '"') aspas = !aspas; else if (ch === c && !aspas) n++; } return n; };
  return [',', ';', '\t'].map((c) => [c, conta(c)]).sort((a, b) => b[1] - a[1])[0][0];
}

export function lerCsv(texto, delimitador = null) {
  const t = String(texto).replace(/^﻿/, '');
  const d = delimitador || detectarDelimitador(t);
  const linhas = []; let campo = ''; let linha = []; let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === d) { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; linha.push(campo); campo = ''; if (linha.some((c) => c.trim() !== '')) linhas.push(linha); linha = []; }
    else campo += ch;
  }
  if (campo !== '' || linha.length) { linha.push(campo); if (linha.some((c) => c.trim() !== '')) linhas.push(linha); }
  if (!linhas.length) return { cabecalho: [], linhas: [], delimitador: d };
  return { cabecalho: linhas[0].map((c) => c.trim()), linhas: linhas.slice(1), delimitador: d };
}

// ---------- detecção automática de colunas (português e inglês) ----------
const sem = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const CAMPOS = {
  data: { nome: 'Data', obrigatorio: true, pistas: ['data', 'date', 'order time', 'created time', 'hora do pedido', 'data do pedido', 'criado em', 'order date', 'data de criacao'] },
  pedido: { nome: 'Pedido', pistas: ['pedido', 'order id', 'id do pedido', 'numero do pedido', 'order', 'order no', 'n pedido'] },
  produto: { nome: 'Produto', pistas: ['produto', 'product name', 'nome do produto', 'product', 'item', 'titulo'] },
  valor: { nome: 'Valor da venda', pistas: ['valor', 'valor da venda', 'preco', 'amount', 'gmv', 'order amount', 'total', 'sales', 'valor do pedido', 'payment amount'] },
  comissao: { nome: 'Comissão', pistas: ['comissao', 'comissao estimada', 'commission', 'estimated commission', 'commission amount', 'valor da comissao', 'ganhos'] },
  quantidade: { nome: 'Quantidade', pistas: ['quantidade', 'qtd', 'quantity', 'qty', 'items sold', 'itens vendidos'] },
  status: { nome: 'Status', pistas: ['status', 'situacao', 'order status', 'status do pedido', 'status da comissao', 'commission status'] },
  externoId: { nome: 'Identificador externo', pistas: ['id externo', 'external id', 'transaction id', 'id da transacao', 'sku id', 'line id'] },
};

export function detectarColunas(cabecalho) {
  const mapa = {}; const usados = new Set();
  for (const [campo, def] of Object.entries(CAMPOS)) {
    const pistas = def.pistas.map(sem);
    let melhor = -1; let nota = 0;
    cabecalho.forEach((h, i) => {
      if (usados.has(i)) return;
      const n = sem(h);
      const exato = pistas.includes(n) ? 3 : pistas.some((p) => n.includes(p) || p.includes(n)) && n.length >= 3 ? 1 : 0;
      if (exato > nota) { nota = exato; melhor = i; }
    });
    if (melhor >= 0) { mapa[campo] = melhor; usados.add(melhor); }
  }
  return mapa;
}

// ---------- conversão de valores ----------
export function lerNumero(v) {
  let s = String(v ?? '').trim();
  if (!s) return null;
  s = s.replace(/[^\d.,\-]/g, '');
  if (!/\d/.test(s)) return null;
  const virgula = s.lastIndexOf(','); const ponto = s.lastIndexOf('.');
  if (virgula > ponto) s = s.replace(/\./g, '').replace(',', '.');            // 1.234,56
  else if (ponto > virgula) s = s.replace(/,/g, '');                          // 1,234.56
  else if (virgula >= 0) s = s.replace(',', '.');                             // 12,30
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function lerData(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valida(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return valida(m[3], m[2], m[1]);
  return null;
}
function valida(a, m, d) {
  const dt = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d)));
  if (dt.getUTCFullYear() !== Number(a) || dt.getUTCMonth() !== Number(m) - 1 || dt.getUTCDate() !== Number(d)) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// status do relatório → status do sistema (venda e comissão). Sem pista clara, fica o status mais cauteloso.
export function lerStatus(v) {
  const s = sem(v);
  if (!s) return { venda: 'pendente', comissao: 'estimada' };
  if (/cancel|refund|reembols|devolv|reject|recus/.test(s)) return { venda: 'cancelada', comissao: 'cancelada' };
  if (/pago|paid|settled|recebid|payout|liquidad/.test(s)) return { venda: 'confirmada', comissao: 'recebida' };
  if (/aprov|approved|confirm|conclu|complet|deliver|entreg/.test(s)) return { venda: 'confirmada', comissao: 'aprovada' };
  return { venda: 'pendente', comissao: 'estimada' };
}

/** Valida e converte as linhas com o mapeamento escolhido. Não grava nada. */
export function preparar(csv, mapeamento) {
  const lancamentos = []; const erros = [];
  const col = (linha, campo) => (mapeamento[campo] === undefined || mapeamento[campo] === null || mapeamento[campo] === '' ? '' : (linha[Number(mapeamento[campo])] ?? '').trim());
  csv.linhas.forEach((linha, i) => {
    const n = i + 2; // número da linha no arquivo (1 = cabeçalho)
    const data = lerData(col(linha, 'data'));
    if (!data) return erros.push({ linha: n, motivo: `Data inválida ou ausente: "${col(linha, 'data')}"` });
    const valor = lerNumero(col(linha, 'valor')); const comissao = lerNumero(col(linha, 'comissao'));
    if (valor === null && comissao === null) return erros.push({ linha: n, motivo: 'Sem valor da venda nem comissão' });
    if ((valor !== null && valor < 0) || (comissao !== null && comissao < 0)) return erros.push({ linha: n, motivo: 'Valor negativo: lance reembolsos manualmente' });
    const st = lerStatus(col(linha, 'status'));
    const base = { data, produto: col(linha, 'produto'), pedido: col(linha, 'pedido'), quantidade: lerNumero(col(linha, 'quantidade')) || 1 };
    const ext = col(linha, 'externoId');
    if (valor !== null) lancamentos.push({ ...base, tipo: 'venda', valor, status: st.venda, externoId: ext ? `${ext}:venda` : null, linha: n });
    if (comissao !== null) lancamentos.push({ ...base, tipo: 'comissao', valor: comissao, status: st.comissao, externoId: ext ? `${ext}:comissao` : null, linha: n });
  });
  return { lancamentos, erros };
}

export function previa(texto, mapeamentoManual = null) {
  const csv = lerCsv(texto);
  if (!csv.cabecalho.length) throw erro('O arquivo está vazio ou não é um CSV válido.');
  const sugerido = detectarColunas(csv.cabecalho);
  const mapeamento = mapeamentoManual || sugerido;
  const p = preparar(csv, mapeamento);
  return {
    delimitador: csv.delimitador, cabecalho: csv.cabecalho, totalLinhas: csv.linhas.length, amostra: csv.linhas.slice(0, 5),
    mapeamentoSugerido: sugerido, mapeamento, campos: Object.fromEntries(Object.entries(CAMPOS).map(([k, v]) => [k, { nome: v.nome, obrigatorio: Boolean(v.obrigatorio) }])),
    validos: p.lancamentos.length, erros: p.erros.slice(0, 50), totalErros: p.erros.length,
    faltaObrigatorio: Object.entries(CAMPOS).filter(([k, v]) => v.obrigatorio && (mapeamento[k] === undefined || mapeamento[k] === '')).map(([, v]) => v.nome),
  };
}

/** Importa de verdade: grava lançamentos novos, ignora duplicados, registra a importação e a origem. */
export function importar(userId, { plataforma, texto, mapeamento, arquivo = 'relatorio.csv', real = true } = {}) {
  if (!PLATAFORMAS.includes(plataforma)) throw erro('Escolha a plataforma do relatório.');
  const csv = lerCsv(texto);
  if (!csv.cabecalho.length) throw erro('O arquivo está vazio ou não é um CSV válido.');
  const mapa = mapeamento || detectarColunas(csv.cabecalho);
  if (mapa.data === undefined || mapa.data === '') throw erro('Mapeie a coluna de data antes de importar.');
  const { lancamentos, erros } = preparar(csv, mapa);
  const importacaoId = id();
  const origem = `importacao:${txt(arquivo, 80)}`;
  let criados = 0; let duplicados = 0;
  for (const l of lancamentos) {
    const { linha, ...resto } = l;
    try {
      const r = registrar(userId, { ...resto, plataforma, origem, real }, { importacaoId });
      if (r.duplicado) duplicados++; else criados++;
    } catch (e) { erros.push({ linha, motivo: e.message }); }
  }
  const reg = { id: importacaoId, em: now(), plataforma, arquivo: txt(arquivo, 120), linhas: csv.linhas.length, criados, duplicados, erros: erros.length, real, mapeamento: mapa };
  area(userId).importacoes.push(reg);
  save();
  auditar(userId, 'importacao', { importacao: importacaoId, plataforma, criados, duplicados, erros: erros.length });
  return { ...reg, detalheErros: erros.slice(0, 100) };
}
