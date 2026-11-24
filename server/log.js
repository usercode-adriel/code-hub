// LOGS ESTRUTURADOS: uma linha JSON por evento, com nível e horário (mesmo formato de antes).
// Sem dependência externa de propósito: o atualizador do sistema recusa versões que mudam as dependências,
// então o log precisa funcionar só com o que já está instalado.
// O nível vem de LOG_LEVEL (padrão: info). Os logs vão para a saída padrão, que o lançador do Windows grava em codeniac.log.
const NIVEIS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 };
const minimo = NIVEIS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? NIVEIS.info;

const texto = (v) => {
  if (v instanceof Error) return v.stack || `${v.name}: ${v.message}`;
  if (typeof v === 'object' && v !== null) { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
};

function emitir(nivel, args) {
  if (NIVEIS[nivel] < minimo) return;
  const [primeiro, ...resto] = args;
  const msg = [primeiro instanceof Error ? primeiro.message : texto(primeiro), ...resto.map(texto)].filter((x) => x !== '').join(' ');
  const linha = { level: NIVEIS[nivel], time: new Date().toISOString(), app: 'codeniac', msg };
  if (primeiro instanceof Error) linha.stack = primeiro.stack;
  process.stdout.write(`${JSON.stringify(linha)}\n`);
}

export const logger = {
  trace: (...a) => emitir('trace', a),
  debug: (...a) => emitir('debug', a),
  info: (...a) => emitir('info', a),
  warn: (...a) => emitir('warn', a),
  error: (...a) => emitir('error', a),
};
